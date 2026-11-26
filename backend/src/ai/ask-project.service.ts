import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { Type, type FunctionDeclaration } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftSnapshot } from '@stave/shared-types';
import { SubscriptionsService } from '../billing/subscriptions.service';
import { DiffService } from '../commits/diff.service';
import { ProjectAccessService } from '../project-access/project-access.service';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { AiRateLimiter } from './ai-rate-limiter';
import type { SuggestionLang } from './commit-message.service';
import { GeminiClient } from './gemini-client';
import { analyzeTheory } from './theory-analysis';

export const ASK_STAVE_TOOL_NAMES = [
  'list_branches',
  'compare_branches',
  'get_theory_range',
  'summarize_comments',
  'get_recent_commits',
] as const;

export type AskStaveToolName = (typeof ASK_STAVE_TOOL_NAMES)[number];

export interface AskProjectResult {
  answer: string | null;
  toolsUsed: string[];
  rateLimited: boolean;
}

interface BranchRow {
  id: string;
  name: string;
  is_default: boolean;
  head_commit_id: string | null;
  created_at?: string;
}

interface CommitListRow {
  id: string;
  branch_id: string;
  author_id?: string | null;
  message: string;
  created_at: string;
  merged_from_commit_id?: string | null;
  merged_from_branch_id?: string | null;
}

interface CommentRow {
  body: string;
  track_id: string | null;
  bar: number | null;
  anchor_ref?: string | null;
  created_at: string;
}

interface UserNameRow {
  id: string;
  username: string | null;
  display_name: string | null;
}

const ASK_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;
const ANSWER_MAX_LENGTH = 2000;
const EXCERPT_MAX_LENGTH = 120;
const MAX_CHORDS_RETURNED = 64;
const MAX_RECENT_EXCERPTS = 10;
const MAX_RECENT_COMMITS = 10;

const UUID_GLOBAL_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const EMAIL_GLOBAL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SPEC_CODE_RE = /\b(?:UC|BR)-\d+\b/gi;

const SYSTEM_PROMPTS: Record<SuggestionLang, string> = {
  vi: [
    'Bạn là Ask STAVE — trợ lý chỉ đọc trả lời câu hỏi về lịch sử phiên bản, so sánh nhánh, nhạc lý và bình luận của một dự án MIDI.',
    'Luôn trả lời bằng tiếng Việt ngắn gọn, rõ ràng và khách quan.',
    'CHỈ dùng dữ liệu có thật trả về từ các công cụ (tools). Hãy gọi công cụ phù hợp trước khi trả lời mọi câu hỏi về nhánh, thay đổi giữa nhánh, hợp âm/giọng/vòng kết, commit hoặc bình luận.',
    'Nếu công cụ báo không có dữ liệu hoặc chỉ dành cho cộng tác viên (collaborator_only), hãy nêu thẳng điều đó, tuyệt đối không suy đoán.',
    'TUYỆT ĐỐI CẤM: bịa thêm ô nhịp, hợp âm, nốt, commit hay bình luận; sáng tác nhạc hoặc đề xuất sửa giai điệu/hợp âm; đánh giá hay/dở hoặc gán cảm xúc (vui/buồn); tiết lộ UUID hay email; nhắc mã tài liệu nội bộ.',
  ].join(' '),
  en: [
    'You are Ask STAVE — a strictly read-only assistant answering questions about a single MIDI project’s branch history, diffs, music theory analysis, and collaboration comments.',
    'Always answer concisely and objectively in English.',
    'Use ONLY factual data returned by the provided tools. Call the relevant tool(s) before answering any question about branches, branch comparisons, chords/key/cadences, commits, or comments.',
    'If a tool reports missing data or restricted access (e.g. collaborator_only), state that plainly without guessing.',
    'STRICTLY FORBIDDEN: inventing bars, chords, notes, commits, or comments; composing music or suggesting musical edits; judging artistic quality or mood/emotion; exposing UUIDs or emails; mentioning internal specification codes.',
  ].join(' '),
};

export const ASK_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'list_branches',
    description:
      'List all branches in the project with default flag, commit count, and latest commit message and timestamp.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'compare_branches',
    description:
      'Compare the head snapshots of two named branches in the project and return added/removed/modified note counts, affected tracks, bar ranges, and tempo/time signature changes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        sourceBranchName: {
          type: Type.STRING,
          description: 'Name of the source branch to compare from.',
        },
        targetBranchName: {
          type: Type.STRING,
          description: 'Name of the target/base branch to compare against.',
        },
      },
      required: ['sourceBranchName', 'targetBranchName'],
    },
  },
  {
    name: 'get_theory_range',
    description:
      'Analyze music theory (key, alternative key, chord progression with Roman numerals, cadences, pitch range, note density, and MIDI integrity counts) for a branch head commit, optionally sliced to a bar range.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branchName: {
          type: Type.STRING,
          description:
            'Optional branch name. Defaults to the project default branch when omitted.',
        },
        fromBar: {
          type: Type.INTEGER,
          description: 'Optional 1-based starting bar number (inclusive).',
        },
        toBar: {
          type: Type.INTEGER,
          description: 'Optional 1-based ending bar number (inclusive).',
        },
      },
    },
  },
  {
    name: 'summarize_comments',
    description:
      'Summarize collaboration comments on the project (total count, top commented bars, track names, and up to 10 recent anonymized excerpts), optionally filtered to one bar. Only available to project owner and accepted collaborators.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        bar: {
          type: Type.INTEGER,
          description: 'Optional 1-based bar number to filter comments.',
        },
      },
    },
  },
  {
    name: 'get_recent_commits',
    description:
      'Read up to 10 recent commits on a branch (message, timestamp, author display name, and merge flag).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branchName: {
          type: Type.STRING,
          description:
            'Optional branch name. Defaults to the project default branch when omitted.',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Optional number of commits to fetch (1 to 10).',
        },
      },
    },
  },
];

function stripIdentifiers(text: string): string {
  return text
    .replace(UUID_GLOBAL_RE, '')
    .replace(EMAIL_GLOBAL_RE, '[redacted]')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanText(value: string | null | undefined, maxLen: number): string {
  const sanitized = stripIdentifiers(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!sanitized) return '';
  return sanitized.length > maxLen
    ? `${sanitized.slice(0, maxLen - 1)}…`
    : sanitized;
}

export function sanitizeFinalAnswer(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = stripIdentifiers(raw)
    .replace(SPEC_CODE_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, ANSWER_MAX_LENGTH).trim() || null;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const int = Math.floor(value);
  return int >= 1 ? int : null;
}

function findBranchByName(
  branches: BranchRow[],
  branchName: unknown,
): BranchRow | null {
  if (typeof branchName !== 'string') return null;
  const needle = branchName.trim();
  if (!needle) return null;
  return (
    branches.find((b) => b.name === needle) ??
    branches.find((b) => b.name.toLowerCase() === needle.toLowerCase()) ??
    null
  );
}

function pickDefaultBranch(branches: BranchRow[]): BranchRow | null {
  return branches.find((b) => b.is_default) ?? branches[0] ?? null;
}

function parseCommentAnchor(row: CommentRow): {
  bar: number | null;
  trackId: string | null;
} {
  let bar = row.bar;
  let trackId = row.track_id;
  if ((trackId === null || trackId === undefined) && row.anchor_ref) {
    try {
      const parsed = JSON.parse(row.anchor_ref) as {
        bar?: unknown;
        track_id?: unknown;
      };
      if (typeof parsed.bar === 'number' && Number.isFinite(parsed.bar)) {
        bar = parsed.bar;
      }
      if (typeof parsed.track_id === 'string') {
        trackId = parsed.track_id;
      }
    } catch {
      // Ignore malformed legacy anchor_ref JSON.
    }
  }
  return { bar: bar ?? null, trackId: trackId ?? null };
}

@Injectable()
export class AskProjectService {
  private readonly logger = new Logger(AskProjectService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly access: ProjectAccessService,
    private readonly subscriptions: SubscriptionsService,
    private readonly diff: DiffService,
    private readonly gemini: GeminiClient,
    private readonly rateLimiter: AiRateLimiter,
  ) {}

  async ask(
    userId: string,
    projectId: string,
    question: string,
    lang: SuggestionLang = 'vi',
  ): Promise<AskProjectResult> {
    await this.access.assertCanRead(projectId, userId);

    const eff = await this.subscriptions.getEffective(userId);
    if (!eff.hasPaidAccess) {
      throw new ForbiddenException('Paid access required');
    }

    if (!this.rateLimiter.tryConsume(userId, ASK_RATE_LIMIT)) {
      return { answer: null, toolsUsed: [], rateLimited: true };
    }

    const trimmedQuestion = question.trim();
    try {
      const result = await this.gemini.generateWithTools({
        systemInstruction: SYSTEM_PROMPTS[lang],
        prompt: trimmedQuestion,
        declarations: ASK_TOOL_DECLARATIONS,
        executeTool: (name, args) =>
          this.executeTool(projectId, userId, name, args),
      });

      return {
        answer: sanitizeFinalAnswer(result.text),
        toolsUsed: result.toolsUsed,
        rateLimited: false,
      };
    } catch (error) {
      this.logger.warn(
        `Ask STAVE failed cleanly: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { answer: null, toolsUsed: [], rateLimited: false };
    }
  }

  private async executeTool(
    projectId: string,
    userId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (name) {
      case 'list_branches':
        return this.toolListBranches(projectId);
      case 'compare_branches':
        return this.toolCompareBranches(projectId, args);
      case 'get_theory_range':
        return this.toolGetTheoryRange(projectId, args);
      case 'summarize_comments':
        return this.toolSummarizeComments(projectId, userId, args);
      case 'get_recent_commits':
        return this.toolGetRecentCommits(projectId, args);
      default:
        return { error: 'unknown_tool' };
    }
  }

  private async loadBranches(projectId: string): Promise<BranchRow[] | null> {
    const { data, error } = await this.supabase
      .from('branches')
      .select('id, name, is_default, head_commit_id, created_at')
      .eq('project_id', projectId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
      .returns<BranchRow[]>();

    if (error) {
      this.logger.warn(`Failed to list branches: ${error.message}`);
      return null;
    }
    return data ?? [];
  }

  private async toolListBranches(
    projectId: string,
  ): Promise<Record<string, unknown>> {
    const branches = await this.loadBranches(projectId);
    if (!branches) return { error: 'failed_to_read_branches' };
    if (branches.length === 0) return { branches: [] };

    const branchIds = branches.map((b) => b.id);
    const { data: commitsData, error: commitsError } = await this.supabase
      .from('commits')
      .select('id, branch_id, message, created_at')
      .in('branch_id', branchIds)
      .order('created_at', { ascending: false });

    if (commitsError) {
      this.logger.warn(`Failed to read commits: ${commitsError.message}`);
      return { error: 'failed_to_read_commits' };
    }

    const commits = (commitsData ?? []) as CommitListRow[];
    const commitById = new Map<string, CommitListRow>();
    const countByBranch = new Map<string, number>();
    const latestByBranch = new Map<string, CommitListRow>();

    for (const c of commits) {
      commitById.set(c.id, c);
      countByBranch.set(c.branch_id, (countByBranch.get(c.branch_id) ?? 0) + 1);
      if (!latestByBranch.has(c.branch_id)) {
        latestByBranch.set(c.branch_id, c);
      }
    }

    return {
      branches: branches.map((b) => {
        const latest =
          (b.head_commit_id ? commitById.get(b.head_commit_id) : undefined) ??
          latestByBranch.get(b.id) ??
          null;
        return {
          name: cleanText(b.name, 60),
          isDefault: Boolean(b.is_default),
          commitCount: countByBranch.get(b.id) ?? 0,
          latestCommitMessage: latest ? cleanText(latest.message, 200) : null,
          latestCommitAt: latest?.created_at ?? null,
        };
      }),
    };
  }

  private async toolCompareBranches(
    projectId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const branches = await this.loadBranches(projectId);
    if (!branches) return { error: 'failed_to_read_branches' };

    const sourceBranch = findBranchByName(branches, args.sourceBranchName);
    const targetBranch = findBranchByName(branches, args.targetBranchName);
    if (!sourceBranch || !targetBranch) {
      return {
        error: 'branch_not_found',
        availableBranches: branches.map((b) => cleanText(b.name, 60)),
      };
    }

    if (sourceBranch.id === targetBranch.id) {
      return {
        areIdentical: true,
        sourceBranch: cleanText(sourceBranch.name, 60),
        targetBranch: cleanText(targetBranch.name, 60),
      };
    }

    if (!sourceBranch.head_commit_id || !targetBranch.head_commit_id) {
      return { available: false, reason: 'branch_has_no_commits' };
    }

    const headIds = [
      ...new Set([targetBranch.head_commit_id, sourceBranch.head_commit_id]),
    ];
    const { data: commitRows, error } = await this.supabase
      .from('commits')
      .select('id, snapshot')
      .in('id', headIds);

    if (error) {
      this.logger.warn(`Failed to read snapshots: ${error.message}`);
      return { error: 'failed_to_read_snapshots' };
    }

    const snapById = new Map(
      (
        (commitRows ?? []) as Array<{ id: string; snapshot: DraftSnapshot }>
      ).map((r) => [r.id, r.snapshot]),
    );
    const targetSnap = snapById.get(targetBranch.head_commit_id);
    const sourceSnap = snapById.get(sourceBranch.head_commit_id);
    if (!targetSnap || !sourceSnap) {
      return { available: false, reason: 'snapshot_not_found' };
    }

    const diff = this.diff.compareSnapshots(targetSnap, sourceSnap);
    const trackNames = new Map<string, string>();
    for (const t of [
      ...(targetSnap.tracks ?? []),
      ...(sourceSnap.tracks ?? []),
    ]) {
      const cleaned = cleanText(t.name, 40);
      if (cleaned) trackNames.set(t.id, cleaned);
    }

    const affectedSet = new Set<string>();
    for (const t of diff.tracksDiff.added) {
      const name = cleanText(t.name, 40);
      if (name) affectedSet.add(name);
    }
    for (const t of diff.tracksDiff.removed) {
      const name = cleanText(t.name, 40);
      if (name) affectedSet.add(name);
    }
    for (const { new: t } of diff.tracksDiff.modified) {
      const name = cleanText(t.name, 40);
      if (name) affectedSet.add(name);
    }
    for (const barDiff of Object.values(diff.changesByBar)) {
      for (const note of barDiff.added) {
        const name = trackNames.get(note.trackId);
        if (name) affectedSet.add(name);
      }
      for (const note of barDiff.removed) {
        const name = trackNames.get(note.trackId);
        if (name) affectedSet.add(name);
      }
      for (const { old: oldNote, new: newNote } of barDiff.modified) {
        const oldName = trackNames.get(oldNote.trackId);
        const newName = trackNames.get(newNote.trackId);
        if (oldName) affectedSet.add(oldName);
        if (newName) affectedSet.add(newName);
      }
    }

    const bars = Object.keys(diff.changesByBar)
      .map((k) => Number(k))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    const tempoMeta = diff.metaChanges.find((m) => m.field === 'tempo');
    const timeSigMeta = diff.metaChanges.find(
      (m) => m.field === 'timeSignature',
    );

    return {
      areIdentical: diff.areIdentical,
      sourceBranch: cleanText(sourceBranch.name, 60),
      targetBranch: cleanText(targetBranch.name, 60),
      notes: diff.summary.notes,
      tracks: diff.summary.tracks,
      tracksAdded: diff.tracksDiff.added.map((t) => ({
        name: cleanText(t.name, 40),
        instrument: t.instrument ?? null,
        noteCount: diff.tracksDiff.noteCounts[t.id] ?? 0,
      })),
      tracksRemoved: diff.tracksDiff.removed.map((t) => ({
        name: cleanText(t.name, 40),
        instrument: t.instrument ?? null,
        noteCount: diff.tracksDiff.noteCounts[t.id] ?? 0,
      })),
      tracksModified: diff.tracksDiff.modified.map(({ new: t }) =>
        cleanText(t.name, 40),
      ),
      affectedTrackNames: [...affectedSet],
      barRange:
        bars.length > 0
          ? { fromBar: bars[0], toBar: bars[bars.length - 1] }
          : null,
      changedBarsCount: bars.length,
      tempoChange: tempoMeta
        ? { from: tempoMeta.old, to: tempoMeta.new }
        : null,
      timeSignatureChange: timeSigMeta
        ? { from: timeSigMeta.old, to: timeSigMeta.new }
        : null,
    };
  }

  private async toolGetTheoryRange(
    projectId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const branches = await this.loadBranches(projectId);
    if (!branches) return { error: 'failed_to_read_branches' };

    const hasBranchArg =
      typeof args.branchName === 'string' && args.branchName.trim().length > 0;
    const branch = hasBranchArg
      ? findBranchByName(branches, args.branchName)
      : pickDefaultBranch(branches);

    if (!branch) {
      return {
        error: 'branch_not_found',
        availableBranches: branches.map((b) => cleanText(b.name, 60)),
      };
    }

    if (!branch.head_commit_id) {
      return {
        available: false,
        branchName: cleanText(branch.name, 60),
        reason: 'branch_has_no_commits',
      };
    }

    const { data: commit, error } = await this.supabase
      .from('commits')
      .select('snapshot')
      .eq('id', branch.head_commit_id)
      .maybeSingle<{ snapshot: DraftSnapshot }>();

    if (error || !commit?.snapshot) {
      return {
        available: false,
        branchName: cleanText(branch.name, 60),
        reason: 'snapshot_not_found',
      };
    }

    const theory = analyzeTheory(commit.snapshot);
    const rawFrom = parsePositiveInt(args.fromBar) ?? 1;
    const rawTo = parsePositiveInt(args.toBar);
    const fromBar = rawTo !== null && rawTo < rawFrom ? rawTo : rawFrom;
    const toBar = rawTo !== null && rawTo < rawFrom ? rawFrom : rawTo;

    const slicedChords = theory.chords.filter(
      (c) => c.bar >= fromBar && (toBar === null || c.bar <= toBar),
    );
    const slicedCadences = theory.cadences.filter(
      (c) => c.fromBar >= fromBar && (toBar === null || c.toBar <= toBar),
    );

    return {
      branchName: cleanText(branch.name, 60),
      fromBar,
      toBar: toBar ?? theory.profile.totalBars,
      key: theory.tonality,
      alternativeKey: theory.alternativeTonality,
      chords: slicedChords.slice(0, MAX_CHORDS_RETURNED),
      chordsTruncated:
        slicedChords.length > MAX_CHORDS_RETURNED || theory.truncated,
      cadences: slicedCadences,
      pitchRange: theory.profile.pitchRange,
      tempo: theory.profile.tempo,
      timeSignature: theory.profile.timeSignature,
      totalBars: theory.profile.totalBars,
      totalNotes: theory.profile.totalNotes,
      averageNotesPerBar: theory.profile.averageNotesPerBar,
      densestBar: theory.profile.densestBar,
      scaleFit: theory.profile.scaleFit,
      midiIntegrity: {
        duplicateCount: theory.integrity.duplicateCount,
        overlapCount: theory.integrity.overlapCount,
      },
      truncated: theory.truncated,
    };
  }

  private async toolSummarizeComments(
    projectId: string,
    userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const accessLevel = await this.access.getAccess(projectId, userId);
    if (accessLevel === null) {
      return { available: false, reason: 'collaborator_only' };
    }

    const { data: rows, error } = await this.supabase
      .from('comments')
      .select('body, track_id, bar, anchor_ref, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.warn(`Failed to read comments: ${error.message}`);
      return { error: 'failed_to_read_comments' };
    }

    const parsed = ((rows ?? []) as CommentRow[]).map((row) => {
      const anchor = parseCommentAnchor(row);
      return {
        body: row.body,
        createdAt: row.created_at,
        bar: anchor.bar,
        trackId: anchor.trackId,
      };
    });

    const trackNames = await this.loadTrackNameMap(
      projectId,
      parsed.some((c) => c.trackId !== null),
    );

    const barFilter = parsePositiveInt(args.bar);
    const matching =
      barFilter !== null ? parsed.filter((c) => c.bar === barFilter) : parsed;

    const barCounts = new Map<number, number>();
    for (const item of parsed) {
      if (item.bar !== null && item.bar >= 1) {
        barCounts.set(item.bar, (barCounts.get(item.bar) ?? 0) + 1);
      }
    }

    const topBars = [...barCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 10)
      .map(([bar, count]) => ({ bar, count }));

    const referencedTrackNames = [
      ...new Set(
        matching
          .map((c) => (c.trackId ? trackNames.get(c.trackId) : undefined))
          .filter((name): name is string => Boolean(name)),
      ),
    ].slice(0, 20);

    const recentExcerpts = matching.slice(0, MAX_RECENT_EXCERPTS).map((c) => ({
      bar: c.bar,
      trackName: c.trackId ? (trackNames.get(c.trackId) ?? null) : null,
      createdAt: c.createdAt,
      excerpt: cleanText(c.body, EXCERPT_MAX_LENGTH),
    }));

    return {
      available: true,
      totalCount: parsed.length,
      ...(barFilter !== null
        ? { barFilter, matchingCount: matching.length }
        : {}),
      topBars,
      trackNames: referencedTrackNames,
      recentExcerpts,
    };
  }

  private async loadTrackNameMap(
    projectId: string,
    needed: boolean,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!needed) return map;

    const branches = await this.loadBranches(projectId);
    const defaultBranch = branches ? pickDefaultBranch(branches) : null;
    if (!defaultBranch?.head_commit_id) return map;

    const { data } = await this.supabase
      .from('commits')
      .select('snapshot')
      .eq('id', defaultBranch.head_commit_id)
      .maybeSingle<{ snapshot: DraftSnapshot }>();

    for (const track of data?.snapshot?.tracks ?? []) {
      const cleaned = cleanText(track.name, 40);
      if (cleaned) map.set(track.id, cleaned);
    }
    return map;
  }

  private async toolGetRecentCommits(
    projectId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const branches = await this.loadBranches(projectId);
    if (!branches) return { error: 'failed_to_read_branches' };

    const hasBranchArg =
      typeof args.branchName === 'string' && args.branchName.trim().length > 0;
    const branch = hasBranchArg
      ? findBranchByName(branches, args.branchName)
      : pickDefaultBranch(branches);

    if (!branch) {
      return {
        error: 'branch_not_found',
        availableBranches: branches.map((b) => cleanText(b.name, 60)),
      };
    }

    const rawLimit = parsePositiveInt(args.limit);
    const limit =
      rawLimit !== null
        ? Math.min(MAX_RECENT_COMMITS, rawLimit)
        : MAX_RECENT_COMMITS;

    const { data: commitRows, error } = await this.supabase
      .from('commits')
      .select(
        'id, branch_id, author_id, message, created_at, merged_from_commit_id, merged_from_branch_id',
      )
      .eq('branch_id', branch.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      this.logger.warn(`Failed to read recent commits: ${error.message}`);
      return { error: 'failed_to_read_commits' };
    }

    const commits = (commitRows ?? []) as CommitListRow[];
    const authorIds = [
      ...new Set(
        commits
          .map((c) => c.author_id)
          .filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          ),
      ),
    ];

    const authorNames = new Map<string, string>();
    if (authorIds.length > 0) {
      const { data: usersData } = await this.supabase
        .from('users')
        .select('id, username, display_name')
        .in('id', authorIds);
      for (const user of (usersData ?? []) as UserNameRow[]) {
        const display = cleanText(user.display_name ?? user.username, 60);
        if (display) authorNames.set(user.id, display);
      }
    }

    return {
      branchName: cleanText(branch.name, 60),
      commits: commits.map((c) => ({
        message: cleanText(c.message, 200),
        createdAt: c.created_at,
        authorName: c.author_id
          ? (authorNames.get(c.author_id) ?? 'Collaborator')
          : 'Collaborator',
        isMerge: Boolean(c.merged_from_commit_id || c.merged_from_branch_id),
      })),
    };
  }
}
