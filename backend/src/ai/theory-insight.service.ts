import {
  ForbiddenException,
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
  type DescriptiveProfile,
  type DetectedCadence,
  type MidiIntegrityReport,
  type Tonality,
  type TheoryAnalysis,
} from './theory-analysis';

export interface TheoryInsightResult {
  tonality: Tonality | null;
  alternativeTonality: Tonality | null;
  chords: BarChord[];
  cadences: DetectedCadence[];
  profile: DescriptiveProfile;
  integrity: MidiIntegrityReport;
  truncated: boolean;
  explanation: string | null;
  explanationSource: 'ai' | null;
}

const MAX_CHORDS_FOR_AI = 16;
const MAX_CADENCES_FOR_AI = 8;
export const THEORY_CACHE_MAX_ENTRIES = 200;
const EXPLANATION_MAX_LENGTH = 600;

const THEORY_PROMPTS: Record<SuggestionLang, string> = {
  vi:
    'Bạn tóm tắt khách quan cấu trúc nhạc lý và thông số MIDI cho người dùng ứng dụng soạn nhạc. ' +
    'Dữ liệu JSON dưới đây được trích xuất bằng thuật toán Krumhansl-Schmuckler và kiểm tra MIDI 1.0. ' +
    'Hãy viết 2 đến 3 câu tiếng Việt ngắn gọn tóm tắt giọng (kèm ứng viên gần nếu có), tiến trình hợp âm/vòng kết, âm vực/mật độ nốt, ' +
    'và chỉ nhắc số nốt trùng/chồng lấn kỹ thuật nếu > 0. ' +
    'TUYỆT ĐỐI KHÔNG đánh giá hay/dở, KHÔNG suy đoán cảm xúc (vui/buồn), KHÔNG coi nốt biến âm hay sắc thái velocity đều là lỗi, ' +
    'không gợi ý sửa nhạc, không dùng dấu ngoặc kép. ',
  en:
    'You objectively summarize music-theory structure and MIDI measurements for a composing app user. ' +
    'The JSON below was computed by Krumhansl-Schmuckler analysis and MIDI 1.0 technical checks. ' +
    'Write 2 to 3 concise English sentences summarizing the detected key (and close candidate if present), chord/cadence structure, pitch range/density, ' +
    'and mention duplicate/overlap MIDI technical counts only if > 0. ' +
    'STRICTLY FORBIDDEN: judging artistic quality, guessing emotion or mood (happy/sad), treating accidentals or flat velocity as errors, ' +
    'suggesting musical changes, or using quotation marks. ',
};

function confidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.75) return 'medium';
  return 'low';
}

@Injectable()
export class TheoryInsightService {
  private readonly logger = new Logger(TheoryInsightService.name);
  private readonly commitCache = new Map<string, TheoryInsightResult>();

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
    includeAi = true,
  ): Promise<TheoryInsightResult> {
    await this.access.assertCanRead(projectId, userId);

    const cacheKey =
      includeAi && commitId ? `${projectId}:${commitId}:${lang}` : null;
    if (cacheKey) {
      const cached = this.commitCache.get(cacheKey);
      if (cached) {
        this.commitCache.delete(cacheKey);
        this.commitCache.set(cacheKey, cached);
        return cached;
      }
    }

    const snapshot = commitId
      ? await this.readCommitSnapshot(projectId, commitId)
      : await this.readCurrentSnapshot(projectId, userId);

    const analysis = analyzeTheory(snapshot);
    const explanation = includeAi
      ? await this.explain(userId, analysis, lang)
      : null;
    const result: TheoryInsightResult = {
      ...analysis,
      explanation,
      explanationSource: explanation ? 'ai' : null,
    };

    const nothingToExplain =
      !analysis.tonality &&
      analysis.chords.every((c) => c.chord === null) &&
      analysis.profile.totalNotes === 0;
    if (cacheKey && (explanation !== null || nothingToExplain)) {
      this.commitCache.set(cacheKey, result);
      if (this.commitCache.size > THEORY_CACHE_MAX_ENTRIES) {
        const oldest = this.commitCache.keys().next().value;
        if (oldest !== undefined) this.commitCache.delete(oldest);
      }
    }
    return result;
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
    if (level !== null) {
      try {
        return await this.drafts.getDraft(projectId, userId);
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
      }
    }

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
      (c): c is { bar: number; chord: string; roman: string | null } =>
        c.chord !== null,
    );
    const chords = allChords.slice(0, MAX_CHORDS_FOR_AI);
    if (
      !analysis.tonality &&
      chords.length === 0 &&
      analysis.profile.totalNotes === 0
    ) {
      return null;
    }
    if (!analysis.tonality && chords.length === 0) return null;
    if (!this.rateLimiter.tryConsume(userId)) return null;

    const payload = {
      key: analysis.tonality
        ? {
            tonic: analysis.tonality.tonic,
            mode: analysis.tonality.mode,
            r: analysis.tonality.confidence,
            confidence: confidenceLevel(analysis.tonality.confidence),
          }
        : null,
      alternativeKey: analysis.alternativeTonality
        ? {
            tonic: analysis.alternativeTonality.tonic,
            mode: analysis.alternativeTonality.mode,
            r: analysis.alternativeTonality.confidence,
          }
        : null,
      chords,
      totalChordBars: allChords.length,
      cadences: analysis.cadences.slice(0, MAX_CADENCES_FOR_AI),
      profile: {
        tempo: analysis.profile.tempo,
        timeSignature: analysis.profile.timeSignature,
        totalBars: analysis.profile.totalBars,
        totalNotes: analysis.profile.totalNotes,
        pitchRange: analysis.profile.pitchRange
          ? `${analysis.profile.pitchRange.lowest}-${analysis.profile.pitchRange.highest}`
          : null,
        averageNotesPerBar: analysis.profile.averageNotesPerBar,
        scaleFit: analysis.profile.scaleFit
          ? {
              inScalePercent: analysis.profile.scaleFit.inScalePercent,
              outOfScaleCount: analysis.profile.scaleFit.outOfScaleCount,
            }
          : null,
      },
      midiIntegrity: {
        duplicateCount: analysis.integrity.duplicateCount,
        overlapCount: analysis.integrity.overlapCount,
      },
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
