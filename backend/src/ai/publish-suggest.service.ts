import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftSnapshot } from '@stave/shared-types';
import { DraftsService } from '../drafts/drafts.service';
import { ProjectAccessService } from '../project-access/project-access.service';
import {
  MAX_PROJECT_TAGS,
  MAX_TAG_LENGTH,
} from '../projects/dto/set-project-tags.dto';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { AiRateLimiter } from './ai-rate-limiter';
import type { SuggestionLang } from './commit-message.service';
import { GeminiClient } from './gemini-client';
import { analyzeTheory } from './theory-analysis';

export interface PublishSuggestFacts {
  name: string;
  genre: string | null;
  tempo: number;
  timeSignature: [number, number];
  totalBars: number;
  totalNotes: number;
  trackCount: number;
  instruments: string[];
  key: string | null;
}

export interface PublishSuggestResult {
  description: string | null;
  tags: string[];
  facts: PublishSuggestFacts;
  aiAvailable: boolean;
}

const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\- ]*$/u;
const DESCRIPTION_MAX = 400;

export function sanitizeSuggestedTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const cleaned = item
      .normalize('NFC')
      .replace(/^#+/, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
    if (cleaned === '' || cleaned.length > MAX_TAG_LENGTH) continue;
    if (!TAG_PATTERN.test(cleaned)) continue;
    seen.add(cleaned);
    if (seen.size >= MAX_PROJECT_TAGS) break;
  }
  return [...seen];
}

export function parsePublishAiJson(raw: string | null): {
  description: string | null;
  tags: string[];
} {
  if (!raw) return { description: null, tags: [] };
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return { description: null, tags: [] };

  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1)) as {
      description?: unknown;
      tags?: unknown;
    };
    const desc =
      typeof parsed.description === 'string'
        ? parsed.description
            .replace(/["“”«»]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, DESCRIPTION_MAX)
        : '';
    return {
      description: desc || null,
      tags: sanitizeSuggestedTags(parsed.tags),
    };
  } catch {
    return { description: null, tags: [] };
  }
}

const PUBLISH_PROMPTS: Record<SuggestionLang, string> = {
  vi:
    'Bạn giúp chủ dự án nhạc MIDI soạn bản nháp mô tả ngắn và tối đa 5 thẻ tag kỹ thuật để đăng lên Explore. ' +
    'Dữ liệu JSON dưới đây chứa thông số thật của bản nhạc. ' +
    'Hãy trả về ĐÚNG MỘT JSON hợp lệ dạng {"description": "...", "tags": ["...", ...]}. ' +
    'description: 1-2 câu tiếng Việt mô tả khách quan nhạc cụ, tempo, nhịp, giọng chủ âm và cấu trúc bản nhạc; ' +
    'TUYỆT ĐỐI KHÔNG bịa cảm xúc (buồn/vui/chill) hoặc khen ngợi nghệ thuật. ' +
    'tags: tối đa 5 tag chữ thường không dấu #, chỉ gồm chữ cái/số/dấu gạch ngang/khoảng trắng (tối đa 30 ký tự/tag) dựa trên nhạc cụ, thể loại, tempo hoặc giọng. ',
  en:
    'You help a MIDI project owner draft an objective description and up to 5 technical tags for Explore publishing. ' +
    'The JSON below contains factual project metadata. ' +
    'Return EXACTLY ONE valid JSON object: {"description": "...", "tags": ["...", ...]}. ' +
    'description: 1-2 objective English sentences describing instrumentation, tempo, time signature, key, and structure; ' +
    'STRICTLY FORBIDDEN: inventing subjective moods (sad/happy/chill) or artistic praise. ' +
    'tags: up to 5 lowercase tags without #, only letters/numbers/hyphens/spaces (max 30 chars each) derived from instruments, genre, tempo, or key. ',
};

@Injectable()
export class PublishSuggestService {
  private readonly logger = new Logger(PublishSuggestService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly access: ProjectAccessService,
    private readonly drafts: DraftsService,
    private readonly gemini: GeminiClient,
    private readonly rateLimiter: AiRateLimiter,
  ) {}

  async suggest(
    userId: string,
    projectId: string,
    lang: SuggestionLang = 'vi',
  ): Promise<PublishSuggestResult> {
    await this.access.assertOwner(projectId, userId);

    const { data: project, error } = await this.supabase
      .from('projects')
      .select('id, name, genre')
      .eq('id', projectId)
      .maybeSingle<{ id: string; name: string; genre: string | null }>();
    if (error) {
      throw new InternalServerErrorException('Could not read project');
    }
    if (!project) throw new NotFoundException('Project not found');

    const snapshot = await this.loadSnapshot(projectId, userId);
    const theory = analyzeTheory(snapshot);
    const instruments = [
      ...new Set(
        (snapshot.tracks ?? [])
          .map((t) => t.instrument?.trim())
          .filter((name): name is string => !!name && name.length > 0),
      ),
    ].slice(0, 10);

    const facts: PublishSuggestFacts = {
      name: project.name.slice(0, 100),
      genre: project.genre,
      tempo: theory.profile.tempo,
      timeSignature: theory.profile.timeSignature,
      totalBars: theory.profile.totalBars,
      totalNotes: theory.profile.totalNotes,
      trackCount: (snapshot.tracks ?? []).length,
      instruments,
      key: theory.tonality
        ? `${theory.tonality.tonic} ${theory.tonality.mode}`
        : null,
    };

    if (!this.rateLimiter.tryConsume(userId)) {
      return { description: null, tags: [], facts, aiAvailable: false };
    }

    try {
      const raw = await this.gemini.generateText(
        `${PUBLISH_PROMPTS[lang]}\n${JSON.stringify(facts)}`,
      );
      const parsed = parsePublishAiJson(raw);
      if (!parsed.description && parsed.tags.length === 0) {
        return { description: null, tags: [], facts, aiAvailable: false };
      }
      return {
        description: parsed.description,
        tags: parsed.tags,
        facts,
        aiAvailable: true,
      };
    } catch (err) {
      this.logger.warn(
        `Publish suggestion failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { description: null, tags: [], facts, aiAvailable: false };
    }
  }

  private async loadSnapshot(
    projectId: string,
    userId: string,
  ): Promise<DraftSnapshot> {
    const { data: branch } = await this.supabase
      .from('branches')
      .select('head_commit_id')
      .eq('project_id', projectId)
      .eq('is_default', true)
      .maybeSingle<{ head_commit_id: string | null }>();

    if (branch?.head_commit_id) {
      const { data: commit } = await this.supabase
        .from('commits')
        .select('snapshot')
        .eq('id', branch.head_commit_id)
        .maybeSingle<{ snapshot: DraftSnapshot }>();
      if (commit?.snapshot) return commit.snapshot;
    }

    try {
      return await this.drafts.getDraft(projectId, userId);
    } catch {
      return {
        schemaVersion: 3,
        meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
        tracks: [],
        notes: [],
      };
    }
  }
}
