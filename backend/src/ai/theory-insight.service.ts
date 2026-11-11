import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftSnapshot } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { ProjectAccessService } from '../project-access/project-access.service';
import { DraftsService } from '../drafts/drafts.service';
import { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';
import type { SuggestionLang } from './commit-message.service';
import {
  analyzeTheory,
  type BarChord,
  type Tonality,
  type TheoryAnalysis,
} from './theory-analysis';

export interface TheoryInsightResult {
  tonality: Tonality | null;
  chords: BarChord[];
  truncated: boolean;
  explanation: string | null;
}

const MAX_CHORDS_FOR_AI = 16;
const EXPLANATION_MAX_LENGTH = 400;

const THEORY_PROMPTS: Record<SuggestionLang, string> = {
  vi:
    'Bạn giải thích ngắn gọn về nhạc lý cho người dùng một ứng dụng soạn nhạc MIDI. ' +
    'Dưới đây là kết quả đã được máy tính tính sẵn (giọng chủ âm và các hợp âm theo ô nhịp) ở dạng JSON. ' +
    'Hãy viết đúng một hoặc hai câu tiếng Việt diễn giải kết quả này, chỉ dùng thông tin có trong dữ liệu, ' +
    'không tự đổi giọng hay hợp âm, không sáng tác nhạc, không dùng dấu ngoặc kép. Danh sách hợp âm có thể chỉ là phần đầu bản nhạc (totalChordBars là tổng số ô nhịp có hợp âm). ',
  en:
    'You briefly explain music theory to a user of a MIDI composing app. ' +
    'Below is a result already computed by code (the key and the chords per bar) as JSON. ' +
    'Write exactly one or two English sentences interpreting it, using only what is in the data, ' +
    'without changing the key or chords, without composing music, and without quotation marks. The chord list may be only the start of the piece (totalChordBars is the total number of bars with a chord). ',
};

function confidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.75) return 'medium';
  return 'low';
}

@Injectable()
export class TheoryInsightService {
  private readonly logger = new Logger(TheoryInsightService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly access: ProjectAccessService,
    private readonly drafts: DraftsService,
    private readonly gemini: GeminiClient,
    private readonly rateLimiter: AiRateLimiter,
  ) {}

  async insight(
    userId: string,
    projectId: string,
    commitId: string | null,
    lang: SuggestionLang = 'vi',
  ): Promise<TheoryInsightResult> {
    await this.access.assertCanRead(projectId, userId);

    const snapshot = commitId
      ? await this.readCommitSnapshot(projectId, commitId)
      : await this.readCurrentSnapshot(projectId, userId);

    const analysis = analyzeTheory(snapshot);
    const explanation = await this.explain(userId, analysis, lang);
    return { ...analysis, explanation };
  }

  private async readCommitSnapshot(
    projectId: string,
    commitId: string,
  ): Promise<DraftSnapshot> {
    const { data: commit, error } = await this.supabase
      .from('commits')
      .select('snapshot, branch_id')
      .eq('id', commitId)
      .maybeSingle<{ snapshot: DraftSnapshot; branch_id: string }>();
    if (error) {
      this.logger.error(`Failed to read commit: ${error.message}`);
      throw new InternalServerErrorException('Could not read theory insight');
    }
    if (!commit) throw new NotFoundException('Commit not found');

    const { data: branch, error: branchError } = await this.supabase
      .from('branches')
      .select('id')
      .eq('id', commit.branch_id)
      .eq('project_id', projectId)
      .maybeSingle<{ id: string }>();
    if (branchError) {
      this.logger.error(`Failed to read branch: ${branchError.message}`);
      throw new InternalServerErrorException('Could not read theory insight');
    }
    if (!branch) throw new NotFoundException('Commit not found');
    return commit.snapshot;
  }

  private async readCurrentSnapshot(
    projectId: string,
    userId: string,
  ): Promise<DraftSnapshot> {
    const level = await this.access.getAccess(projectId, userId);
    if (level !== null) return this.drafts.getDraft(projectId, userId);

    const { data: branch, error } = await this.supabase
      .from('branches')
      .select('head_commit_id')
      .eq('project_id', projectId)
      .eq('is_default', true)
      .maybeSingle<{ head_commit_id: string | null }>();
    if (error) {
      this.logger.error(`Failed to read branch: ${error.message}`);
      throw new InternalServerErrorException('Could not read theory insight');
    }
    if (!branch) throw new NotFoundException('Default branch not found');
    if (!branch.head_commit_id) {
      return {
        schemaVersion: 3,
        meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
        tracks: [],
        notes: [],
      };
    }
    return this.readCommitSnapshot(projectId, branch.head_commit_id);
  }

  private async explain(
    userId: string,
    analysis: TheoryAnalysis,
    lang: SuggestionLang,
  ): Promise<string | null> {
    const allChords = analysis.chords.filter(
      (c): c is { bar: number; chord: string } => c.chord !== null,
    );
    const chords = allChords.slice(0, MAX_CHORDS_FOR_AI);
    if (!analysis.tonality && chords.length === 0) return null;
    if (!this.rateLimiter.tryConsume(userId)) return null;

    const payload = {
      key: analysis.tonality
        ? {
            tonic: analysis.tonality.tonic,
            mode: analysis.tonality.mode,
            confidence: confidenceLevel(analysis.tonality.confidence),
          }
        : null,
      chords,
      totalChordBars: allChords.length,
    };

    try {
      const raw = await this.gemini.generateText(
        THEORY_PROMPTS[lang] + JSON.stringify(payload),
      );
      if (!raw) return null;
      const cleaned = raw
        .replace(/["“”«»]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return cleaned ? cleaned.slice(0, EXPLANATION_MAX_LENGTH) : null;
    } catch (error) {
      this.logger.warn(
        `Theory explanation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
