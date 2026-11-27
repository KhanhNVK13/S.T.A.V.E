import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftSnapshot, DraftTrack } from '@stave/shared-types';
import { BranchesService } from '../branches/branches.service';
import { MergeService, type MergeConflictResult } from '../merge/merge.service';
import { ProjectAccessService } from '../project-access/project-access.service';
import { PullRequestAnalysisService } from '../pull-requests/pull-request-analysis.service';
import { PullRequestsService } from '../pull-requests/pull-requests.service';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { AiRateLimiter } from './ai-rate-limiter';
import type { SuggestionLang } from './commit-message.service';
import type { ConflictAdviceDto } from './dto/conflict-advice.dto';
import { GeminiClient } from './gemini-client';
import { midiPitchToSpn } from './theory-analysis';

export interface ConflictBarFact {
  bar: number;
  conflictCount: number;
  items: Array<{
    track: string;
    basePitch: string | null;
    type: 'DELETE_VS_MODIFY' | 'MODIFIED_DIFFERENTLY';
    deletedSide?: 'target' | 'source';
    targetPitch?: string;
    sourcePitch?: string;
    pitchDelta?: number;
    startBeatsDelta?: number;
    durationBeatsDelta?: number;
    velocityDelta?: number;
  }>;
}

export interface ConflictAdviceResult {
  barCount: number;
  conflictCount: number;
  truncated: boolean;
  advice: string | null;
}

const MAX_BARS_FOR_AI = 12;
const MAX_ITEMS_PER_BAR = 4;
const MAX_CACHE_ENTRIES = 200;
const ADVICE_MAX_LENGTH = 1000;

function cleanTrackName(name: string | undefined): string {
  const cleaned = (name ?? 'Track').replace(/\s+/g, ' ').trim();
  return cleaned.length > 40 ? `${cleaned.slice(0, 39)}…` : cleaned || 'Track';
}

function roundBeats(ticks: number, ppq: number): number {
  const safePpq = ppq > 0 ? ppq : 480;
  return Math.round((ticks / safePpq) * 100) / 100;
}

export function buildConflictBarFacts(
  conflictsByBar: MergeConflictResult['conflictsByBar'],
  tracks: DraftTrack[],
  ppq: number,
): { bars: ConflictBarFact[]; barCount: number; truncated: boolean } {
  const trackNames = new Map(tracks.map((t) => [t.id, cleanTrackName(t.name)]));
  const sortedBarKeys = Object.keys(conflictsByBar)
    .map((k) => Number(k))
    .sort((a, b) => a - b);

  const selected = sortedBarKeys.slice(0, MAX_BARS_FOR_AI);
  const bars: ConflictBarFact[] = selected.map((bar) => {
    const entries = conflictsByBar[bar] ?? [];
    const items = entries.slice(0, MAX_ITEMS_PER_BAR).map((c) => {
      const refNote = c.baseNote ?? c.targetNote ?? c.sourceNote;
      const track = refNote
        ? (trackNames.get(refNote.trackId) ?? 'Track')
        : 'Track';
      const basePitch = c.baseNote ? midiPitchToSpn(c.baseNote.pitch) : null;

      if (c.type === 'DELETE_VS_MODIFY') {
        const deletedSide: 'target' | 'source' = !c.targetNote
          ? 'target'
          : 'source';
        const surviving = c.targetNote ?? c.sourceNote;
        return {
          track,
          basePitch,
          type: c.type,
          deletedSide,
          ...(surviving && c.targetNote
            ? { targetPitch: midiPitchToSpn(surviving.pitch) }
            : {}),
          ...(surviving && c.sourceNote
            ? { sourcePitch: midiPitchToSpn(surviving.pitch) }
            : {}),
        };
      }

      const targetNote = c.targetNote;
      const sourceNote = c.sourceNote;
      return {
        track,
        basePitch,
        type: c.type,
        ...(targetNote
          ? { targetPitch: midiPitchToSpn(targetNote.pitch) }
          : {}),
        ...(sourceNote
          ? { sourcePitch: midiPitchToSpn(sourceNote.pitch) }
          : {}),
        ...(targetNote && sourceNote
          ? {
              pitchDelta: sourceNote.pitch - targetNote.pitch,
              startBeatsDelta: roundBeats(
                sourceNote.start - targetNote.start,
                ppq,
              ),
              durationBeatsDelta: roundBeats(
                sourceNote.duration - targetNote.duration,
                ppq,
              ),
              velocityDelta: sourceNote.velocity - targetNote.velocity,
            }
          : {}),
      };
    });

    return {
      bar,
      conflictCount: entries.length,
      items,
    };
  });

  return {
    bars,
    barCount: sortedBarKeys.length,
    truncated: sortedBarKeys.length > MAX_BARS_FOR_AI,
  };
}

const CONFLICT_PROMPTS: Record<SuggestionLang, string> = {
  vi: [
    'Bạn giúp người dùng hiểu rõ các xung đột khi hợp nhất hai nhánh nhạc MIDI.',
    'Dữ liệu JSON dưới đây liệt kê chênh lệch cụ thể giữa nhánh đích (target) và nhánh nguồn (source) theo từng ô nhịp.',
    'Quy ước dấu bắt buộc: mọi trường *Delta đều bằng (source trừ target): giá trị dương nghĩa là nhánh nguồn cao hơn/muộn hơn/dài hơn/mạnh hơn nhánh đích,',
    'giá trị âm nghĩa là nhánh đích lớn hơn, giá trị 0 nghĩa là hai bên giống nhau ở thuộc tính đó (không cần nhắc).',
    'Với DELETE_VS_MODIFY, deletedSide cho biết bên đã xoá nốt và targetPitch/sourcePitch là cao độ ở bên còn lại.',
    'Hãy viết các gạch đầu dòng tiếng Việt ngắn gọn (bắt đầu bằng "- ") tóm tắt từng ô nhịp dựa đúng trên JSON, không tự suy đoán thuộc tính nào được "giữ nguyên",',
    'TUYỆT ĐỐI KHÔNG ra lệnh bên nào hay hơn hoặc chọn thay người dùng, không dùng dấu ngoặc kép.',
  ].join(' '),
  en: [
    'You help a user understand MIDI merge conflicts between two branches.',
    'The JSON below lists exact differences between target (ours) and source (theirs) grouped by bar.',
    'Mandatory sign convention: every *Delta field equals (source minus target): a positive number means source is higher/later/longer/louder than target,',
    'negative means target is greater, and 0 means both sides match on that attribute (omit unchanged fields).',
    'For DELETE_VS_MODIFY, deletedSide identifies the side that deleted the note and targetPitch/sourcePitch is the surviving side pitch.',
    'Write concise English bullet points (starting with "- ") summarizing each conflicted bar strictly from the JSON without guessing what stayed unchanged,',
    'STRICTLY FORBIDDEN: declaring one version musically better, choosing for the user, or using quotation marks.',
  ].join(' '),
};

@Injectable()
export class ConflictAdviceService {
  private readonly logger = new Logger(ConflictAdviceService.name);
  private readonly cache = new Map<string, ConflictAdviceResult>();

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly branches: BranchesService,
    private readonly access: ProjectAccessService,
    private readonly merge: MergeService,
    private readonly pullRequests: PullRequestsService,
    private readonly prAnalysis: PullRequestAnalysisService,
    private readonly gemini: GeminiClient,
    private readonly rateLimiter: AiRateLimiter,
  ) {}

  async advise(
    userId: string,
    dto: ConflictAdviceDto,
  ): Promise<ConflictAdviceResult> {
    const lang: SuggestionLang = dto.lang ?? 'vi';

    if (dto.pullRequestId) {
      return this.advisePullRequest(userId, dto.pullRequestId, lang);
    }

    if (!dto.sourceBranchId || !dto.targetBranchId) {
      throw new BadRequestException(
        'Provide either pullRequestId or both sourceBranchId and targetBranchId',
      );
    }
    return this.adviseBranches(
      userId,
      dto.sourceBranchId,
      dto.targetBranchId,
      lang,
    );
  }

  private async advisePullRequest(
    userId: string,
    pullRequestId: string,
    lang: SuggestionLang,
  ): Promise<ConflictAdviceResult> {
    const { row } = await this.pullRequests.loadForUser(pullRequestId, userId);
    if (!row.source_branch_id || !row.target_branch_id) {
      throw new BadRequestException('Branches are no longer available');
    }
    const analysis = await this.prAnalysis.analyze(
      row.source_branch_id,
      row.target_branch_id,
    );
    const cacheKey = `pr:${pullRequestId}:${analysis.sourceBranch.head_commit_id ?? 'none'}:${analysis.targetBranch.head_commit_id ?? 'none'}:${lang}`;
    const tracks = [
      ...(analysis.targetSnapshot?.tracks ?? []),
      ...(analysis.sourceSnapshot?.tracks ?? []),
      ...(analysis.baseSnapshot?.tracks ?? []),
    ];
    const ppq =
      analysis.targetSnapshot?.meta.ppq ??
      analysis.sourceSnapshot?.meta.ppq ??
      480;

    return this.buildAndExplain(
      userId,
      cacheKey,
      analysis.conflictsByBar,
      analysis.conflictsCount,
      tracks,
      ppq,
      lang,
    );
  }

  private async adviseBranches(
    userId: string,
    sourceBranchId: string,
    targetBranchId: string,
    lang: SuggestionLang,
  ): Promise<ConflictAdviceResult> {
    const [source, target] = await Promise.all([
      this.getBranch(sourceBranchId),
      this.getBranch(targetBranchId),
    ]);
    if (!source || !target) {
      throw new NotFoundException('Branch not found');
    }
    if (source.project_id !== target.project_id) {
      throw new BadRequestException('Branches cannot be compared');
    }
    await this.access.assertCanEdit(source.project_id, userId);

    const baseCommitId = await this.branches.findMergeBase(
      source.head_commit_id,
      target.head_commit_id,
    );
    if (!baseCommitId) {
      throw new BadRequestException('Branches cannot be compared');
    }
    const [baseSnap, sourceSnap, targetSnap] = await Promise.all([
      this.getSnapshot(baseCommitId),
      this.getSnapshot(source.head_commit_id),
      this.getSnapshot(target.head_commit_id),
    ]);
    if (!baseSnap || !sourceSnap || !targetSnap) {
      throw new BadRequestException('Branches cannot be compared');
    }

    const preview = this.merge.previewMerge(baseSnap, sourceSnap, targetSnap);
    const cacheKey = `br:${source.head_commit_id ?? 'none'}:${target.head_commit_id ?? 'none'}:${lang}`;
    const tracks = [
      ...targetSnap.tracks,
      ...sourceSnap.tracks,
      ...baseSnap.tracks,
    ];
    const ppq = targetSnap.meta?.ppq ?? 480;

    return this.buildAndExplain(
      userId,
      cacheKey,
      preview.conflictsByBar,
      preview.conflictsCount,
      tracks,
      ppq,
      lang,
    );
  }

  private async buildAndExplain(
    userId: string,
    cacheKey: string,
    conflictsByBar: MergeConflictResult['conflictsByBar'],
    conflictCount: number,
    tracks: DraftTrack[],
    ppq: number,
    lang: SuggestionLang,
  ): Promise<ConflictAdviceResult> {
    const hit = this.cache.get(cacheKey);
    if (hit) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, hit);
      return hit;
    }

    const { bars, barCount, truncated } = buildConflictBarFacts(
      conflictsByBar,
      tracks,
      ppq,
    );
    if (conflictCount === 0 || bars.length === 0) {
      return { barCount: 0, conflictCount: 0, truncated: false, advice: null };
    }

    let advice: string | null = null;
    if (this.rateLimiter.tryConsume(userId)) {
      try {
        const raw = await this.gemini.generateText(
          `${CONFLICT_PROMPTS[lang]}\n${JSON.stringify({ totalConflicts: conflictCount, totalConflictBars: barCount, truncated, bars })}`,
        );
        const cleaned = raw?.replace(/["“”«»]/g, '').trim() ?? '';
        advice = cleaned ? cleaned.slice(0, ADVICE_MAX_LENGTH).trim() : null;
      } catch (error) {
        this.logger.warn(
          `Conflict advice failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const result: ConflictAdviceResult = {
      barCount,
      conflictCount,
      truncated,
      advice,
    };
    if (advice !== null) {
      this.cache.set(cacheKey, result);
      if (this.cache.size > MAX_CACHE_ENTRIES) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
    }
    return result;
  }

  private async getBranch(branchId: string) {
    const { data, error } = await this.supabase
      .from('branches')
      .select('id, project_id, head_commit_id')
      .eq('id', branchId)
      .maybeSingle<{
        id: string;
        project_id: string;
        head_commit_id: string | null;
      }>();
    if (error) {
      throw new InternalServerErrorException('Could not read branch');
    }
    return data;
  }

  private async getSnapshot(
    commitId: string | null,
  ): Promise<DraftSnapshot | null> {
    if (!commitId) return null;
    const { data, error } = await this.supabase
      .from('commits')
      .select('snapshot')
      .eq('id', commitId)
      .maybeSingle<{ snapshot: DraftSnapshot }>();
    if (error) {
      throw new InternalServerErrorException('Could not read commit');
    }
    return data?.snapshot ?? null;
  }
}
