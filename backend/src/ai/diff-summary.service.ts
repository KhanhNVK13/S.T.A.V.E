import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { DraftSnapshot } from '@stave/shared-types';
import { CommitsService } from '../commits/commits.service';
import { DiffService, type SnapshotDiff } from '../commits/diff.service';
import { PullRequestAnalysisService } from '../pull-requests/pull-request-analysis.service';
import { PullRequestsService } from '../pull-requests/pull-requests.service';
import { AiRateLimiter } from './ai-rate-limiter';
import type { SuggestionLang } from './commit-message.service';
import type { DiffSummaryStyle } from './dto/diff-summary.dto';
import { GeminiClient } from './gemini-client';
import { MergeRiskService, type ExplanationSource } from './merge-risk.service';
import { analyzeTheory, type Tonality } from './theory-analysis';

export interface DiffHotspotBar {
  bar: number;
  added: number;
  removed: number;
  modified: number;
}

export interface DiffStoryFacts {
  areIdentical: boolean;
  notesAdded: number;
  notesRemoved: number;
  notesModified: number;
  tracksAdded: Array<{
    name: string;
    instrument: string | null;
    notes: number;
  }>;
  tracksRemoved: Array<{
    name: string;
    instrument: string | null;
    notes: number;
  }>;
  tracksModified: string[];
  metaChanges: Array<{ field: string; from: unknown; to: unknown }>;
  barsRange: [number, number] | null;
  topHotspotBars: DiffHotspotBar[];
  keyChange: { from: string; to: string } | null;
  pitchRangeChange: { from: string; to: string } | null;
  commitMessages?: string[];
}

export interface PrSummaryResult {
  facts: DiffStoryFacts;
  summary: string | null;
}

export interface DiffSummaryResult {
  facts: DiffStoryFacts;
  summary: string | null;
  style: DiffSummaryStyle;
}

const MAX_CACHE_ENTRIES = 200;
const SUMMARY_MAX_LENGTH = 800;
const NAME_MAX = 40;
const COMMIT_MSG_MAX = 100;

function cleanText(value: string, maxLen: number): string {
  const single = value.replace(/\s+/g, ' ').trim();
  return single.length > maxLen ? `${single.slice(0, maxLen - 1)}…` : single;
}

function formatTonalityLabel(tonality: Tonality | null): string | null {
  if (!tonality) return null;
  return `${tonality.tonic} ${tonality.mode}`;
}

export function buildDiffStoryFacts(
  baseSnapshot: DraftSnapshot,
  targetSnapshot: DraftSnapshot,
  diff: SnapshotDiff,
  commitMessages?: string[],
): DiffStoryFacts {
  const barEntries = Object.entries(diff.changesByBar)
    .map(([barKey, changes]) => ({
      bar: Number(barKey),
      added: changes.added.length,
      removed: changes.removed.length,
      modified: changes.modified.length,
    }))
    .sort((a, b) => a.bar - b.bar);

  const barsRange: [number, number] | null =
    barEntries.length > 0
      ? [barEntries[0].bar, barEntries[barEntries.length - 1].bar]
      : null;

  const topHotspotBars = [...barEntries]
    .sort(
      (a, b) =>
        b.added + b.removed + b.modified - (a.added + a.removed + a.modified) ||
        a.bar - b.bar,
    )
    .slice(0, 5);

  const baseTheory = analyzeTheory(baseSnapshot);
  const targetTheory = analyzeTheory(targetSnapshot);
  const baseKey = formatTonalityLabel(baseTheory.tonality);
  const targetKey = formatTonalityLabel(targetTheory.tonality);
  const keyChange =
    baseKey && targetKey && baseKey !== targetKey
      ? { from: baseKey, to: targetKey }
      : null;

  const baseRange = baseTheory.profile.pitchRange
    ? `${baseTheory.profile.pitchRange.lowest}-${baseTheory.profile.pitchRange.highest}`
    : null;
  const targetRange = targetTheory.profile.pitchRange
    ? `${targetTheory.profile.pitchRange.lowest}-${targetTheory.profile.pitchRange.highest}`
    : null;
  const pitchRangeChange =
    baseRange && targetRange && baseRange !== targetRange
      ? { from: baseRange, to: targetRange }
      : null;

  const cleanedCommits = commitMessages
    ?.map((msg) => cleanText(msg, COMMIT_MSG_MAX))
    .filter((msg) => msg.length > 0)
    .slice(0, 15);

  return {
    areIdentical: diff.areIdentical,
    notesAdded: diff.summary.notes.added,
    notesRemoved: diff.summary.notes.removed,
    notesModified: diff.summary.notes.modified,
    tracksAdded: diff.tracksDiff.added.map((t) => ({
      name: cleanText(t.name, NAME_MAX),
      instrument: t.instrument ? cleanText(t.instrument, NAME_MAX) : null,
      notes: diff.tracksDiff.noteCounts[t.id] ?? 0,
    })),
    tracksRemoved: diff.tracksDiff.removed.map((t) => ({
      name: cleanText(t.name, NAME_MAX),
      instrument: t.instrument ? cleanText(t.instrument, NAME_MAX) : null,
      notes: diff.tracksDiff.noteCounts[t.id] ?? 0,
    })),
    tracksModified: diff.tracksDiff.modified.map(({ new: t }) =>
      cleanText(t.name, NAME_MAX),
    ),
    metaChanges: diff.metaChanges.map((m) => ({
      field: m.field,
      from: m.old,
      to: m.new,
    })),
    barsRange,
    topHotspotBars,
    keyChange,
    pitchRangeChange,
    ...(cleanedCommits && cleanedCommits.length > 0
      ? { commitMessages: cleanedCommits }
      : {}),
  };
}

const PR_SUMMARY_PROMPTS: Record<SuggestionLang, string> = {
  vi:
    'Bạn tóm tắt khách quan các thay đổi trong một dự án nhạc MIDI (Pull Request hoặc so sánh commit). ' +
    'Trong JSON bên dưới, notesAdded, notesRemoved, notesModified, notes, added, removed và modified đều là SỐ NỐT NHẠC MIDI (tuyệt đối KHÔNG dịch "notes" là "ghi chú"). ' +
    'Chỉ dựa trên dữ liệu JSON bên dưới, viết 3 đến 4 gạch đầu dòng tiếng Việt ngắn gọn (bắt đầu bằng "- "), ' +
    'nêu rõ track nào thay đổi, ô nhịp trọng tâm, đổi giọng/tempo/âm vực nếu có. ' +
    'Không đánh giá hay/dở, không bịa chi tiết ngoài JSON, không dùng dấu ngoặc kép. ',
  en:
    'You objectively summarize changes in a MIDI music project Pull Request or commit comparison. ' +
    'Using only the JSON facts below (notesAdded/notesRemoved/notesModified/added/removed/modified all count MIDI musical notes), write 3 to 4 concise English bullet points (starting with "- "), ' +
    'covering track changes, hotspot bars, and key/tempo/pitch-range shifts if present. ' +
    'Do not judge artistic quality, invent details outside the JSON, or use quotation marks. ',
};

const RELEASE_NOTES_PROMPTS: Record<SuggestionLang, string> = {
  vi:
    'Bạn viết ghi chú phát hành (Release Notes) ngắn gọn cho một phiên bản dự án nhạc MIDI dựa trên JSON thay đổi bên dưới. ' +
    'Trong JSON bên dưới, mọi trường notesAdded, notesRemoved, notesModified, notes, added, removed, modified đều là SỐ NỐT NHẠC MIDI (tuyệt đối KHÔNG dịch "notes" là "ghi chú"). ' +
    'Viết 3 đến 4 gạch đầu dòng tiếng Việt rõ ràng (bắt đầu bằng "- ") sẵn sàng để sao chép cho cộng tác viên. ' +
    'Chỉ dùng số liệu có trong JSON, không phán xét nghệ thuật, không dùng dấu ngoặc kép. ',
  en:
    'You write concise Release Notes for a MIDI project version based on the JSON diff facts below. ' +
    'Write 3 to 4 clear English bullet points (starting with "- ") ready to copy for collaborators. ' +
    'Use only figures from the JSON, do not make artistic judgments, and do not use quotation marks. ',
};

function emptySnapshot(): DraftSnapshot {
  return {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [],
    notes: [],
  };
}

@Injectable()
export class DiffSummaryService {
  private readonly logger = new Logger(DiffSummaryService.name);
  private readonly prCache = new Map<string, PrSummaryResult>();
  private readonly diffCache = new Map<string, DiffSummaryResult>();

  constructor(
    private readonly pullRequests: PullRequestsService,
    private readonly prAnalysis: PullRequestAnalysisService,
    private readonly commits: CommitsService,
    private readonly diff: DiffService,
    private readonly mergeRisk: MergeRiskService,
    private readonly gemini: GeminiClient,
    private readonly rateLimiter: AiRateLimiter,
  ) {}

  async summarizePullRequest(
    userId: string,
    pullRequestId: string,
    lang: SuggestionLang = 'vi',
  ): Promise<PrSummaryResult> {
    const { row } = await this.pullRequests.loadForUser(pullRequestId, userId);
    if (!row.source_branch_id || !row.target_branch_id) {
      throw new BadRequestException('Branches are no longer available');
    }

    const analysis = await this.prAnalysis.analyze(
      row.source_branch_id,
      row.target_branch_id,
    );
    const cacheKey = `pr:${pullRequestId}:${analysis.sourceBranch.head_commit_id ?? 'none'}:${analysis.targetBranch.head_commit_id ?? 'none'}:${lang}`;
    const cached = this.getCached(this.prCache, cacheKey);
    if (cached) return cached;

    const facts = buildDiffStoryFacts(
      analysis.baseSnapshot ?? emptySnapshot(),
      analysis.sourceSnapshot ?? emptySnapshot(),
      analysis.summary,
      analysis.newCommits.map((c) => c.message),
    );

    const summary = await this.generateSummary(
      userId,
      PR_SUMMARY_PROMPTS[lang],
      facts,
    );
    const result: PrSummaryResult = { facts, summary };
    if (summary !== null) {
      this.setCached(this.prCache, cacheKey, result);
    }
    return result;
  }

  async explainPullRequestRisk(
    userId: string,
    pullRequestId: string,
    lang: SuggestionLang = 'vi',
  ): Promise<{
    explanation: string | null;
    explanationSource: ExplanationSource;
  }> {
    const { row } = await this.pullRequests.loadForUser(pullRequestId, userId);
    if (!row.source_branch_id || !row.target_branch_id) {
      throw new BadRequestException('Branches are no longer available');
    }
    const analysis = await this.prAnalysis.analyze(
      row.source_branch_id,
      row.target_branch_id,
    );
    return this.mergeRisk.explainFromMetrics(
      userId,
      analysis.risk.level,
      analysis.risk.metrics,
      lang,
    );
  }

  async summarizeCommitDiff(
    userId: string,
    baseCommitId: string,
    targetCommitId: string,
    lang: SuggestionLang = 'vi',
    style: DiffSummaryStyle = 'summary',
  ): Promise<DiffSummaryResult> {
    const [baseCommit, targetCommit] = await Promise.all([
      this.commits.getCommitById(baseCommitId, userId),
      this.commits.getCommitById(targetCommitId, userId),
    ]);

    const cacheKey = `diff:${baseCommitId}:${targetCommitId}:${style}:${lang}`;
    const cached = this.getCached(this.diffCache, cacheKey);
    if (cached) return cached;

    const snapshotDiff = this.diff.compareSnapshots(
      baseCommit.snapshot,
      targetCommit.snapshot,
    );
    const facts = buildDiffStoryFacts(
      baseCommit.snapshot,
      targetCommit.snapshot,
      snapshotDiff,
    );

    if (snapshotDiff.areIdentical) {
      return { facts, summary: null, style };
    }

    const prompt =
      style === 'release-notes'
        ? RELEASE_NOTES_PROMPTS[lang]
        : PR_SUMMARY_PROMPTS[lang];
    const summary = await this.generateSummary(userId, prompt, facts);
    const result: DiffSummaryResult = { facts, summary, style };
    if (summary !== null) {
      this.setCached(this.diffCache, cacheKey, result);
    }
    return result;
  }

  private async generateSummary(
    userId: string,
    prompt: string,
    facts: DiffStoryFacts,
  ): Promise<string | null> {
    if (!this.rateLimiter.tryConsume(userId)) return null;
    try {
      const raw = await this.gemini.generateText(
        `${prompt}\n${JSON.stringify(facts)}`,
      );
      if (!raw) return null;
      const cleaned = raw.replace(/["“”«»]/g, '').trim();
      return cleaned ? cleaned.slice(0, SUMMARY_MAX_LENGTH).trim() : null;
    } catch (error) {
      this.logger.warn(
        `Diff summary failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private getCached<T>(cache: Map<string, T>, key: string): T | null {
    const hit = cache.get(key);
    if (!hit) return null;
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  private setCached<T>(cache: Map<string, T>, key: string, value: T): void {
    cache.set(key, value);
    if (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }
}
