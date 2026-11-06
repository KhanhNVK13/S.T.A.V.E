import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftSnapshot } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';
import { ProjectAccessService } from '../project-access/project-access.service';
import { ProjectsService } from '../projects/projects.service';
import { DraftsService } from '../drafts/drafts.service';
import { DiffService, type SnapshotDiff } from '../commits/diff.service';

export const MAX_NOTES_FOR_AI_SUGGESTION = 300;
export const MAX_TRACKS_FOR_AI_SUGGESTION = 5;

export type SuggestionLang = 'en' | 'vi';

const TRACK_NAME_MAX = 40;
const SUGGESTION_MAX_LENGTH = 200;

const COMMIT_MESSAGE_PROMPTS: Record<SuggestionLang, string> = {
  vi:
    'Bạn viết lời nhắn commit cho một dự án nhạc MIDI. Dưới đây là tóm tắt thay đổi dạng JSON. ' +
    'Hãy viết đúng một câu tiếng Việt, tối đa 80 ký tự, ở thì hiện tại, không dùng dấu ngoặc kép, ' +
    'không giải thích thêm và không thêm chi tiết nào không có trong dữ liệu. ',
  en:
    'You write a commit message for a MIDI music project. Below is a JSON summary of the changes. ' +
    'Write exactly one English sentence of at most 80 characters, in the imperative mood, without quotation marks, ' +
    'with no extra explanation and no detail that is not in the data. ',
};

const LARGE_CHANGE_MESSAGES: Record<
  SuggestionLang,
  (notes: number, tracks: number) => string
> = {
  vi: (notes, tracks) => `Cập nhật lớn: ${notes} nốt, ${tracks} track thay đổi`,
  en: (notes, tracks) =>
    `Large update: ${notes} notes, ${tracks} tracks changed`,
};

interface AiChangeSummary {
  notesAdded: number;
  notesRemoved: number;
  notesModified: number;
  tracksAdded: string[];
  tracksRemoved: string[];
  tracksModified: string[];
  barsRange: [number, number] | null;
  tempoChange: { from: number; to: number } | null;
}

function cleanTrackName(name: string): string {
  const oneLine = name.replace(/\s+/g, ' ').trim();
  return oneLine.length > TRACK_NAME_MAX
    ? `${oneLine.slice(0, TRACK_NAME_MAX - 1)}…`
    : oneLine;
}

function buildAiSummary(diff: SnapshotDiff): AiChangeSummary {
  const bars = Object.keys(diff.changesByBar)
    .map((key) => Number(key))
    .sort((a, b) => a - b);
  const tempo = diff.metaChanges.find((change) => change.field === 'tempo');
  return {
    notesAdded: diff.summary.notes.added,
    notesRemoved: diff.summary.notes.removed,
    notesModified: diff.summary.notes.modified,
    tracksAdded: diff.tracksDiff.added.map((track) =>
      cleanTrackName(track.name),
    ),
    tracksRemoved: diff.tracksDiff.removed.map((track) =>
      cleanTrackName(track.name),
    ),
    tracksModified: diff.tracksDiff.modified.map(({ new: track }) =>
      cleanTrackName(track.name),
    ),
    barsRange: bars.length > 0 ? [bars[0], bars[bars.length - 1]] : null,
    tempoChange: tempo
      ? { from: tempo.old as number, to: tempo.new as number }
      : null,
  };
}

@Injectable()
export class CommitMessageService {
  constructor(
    private readonly gemini: GeminiClient,
    private readonly rateLimiter: AiRateLimiter,
    private readonly access: ProjectAccessService,
    private readonly projects: ProjectsService,
    private readonly drafts: DraftsService,
    private readonly diff: DiffService,
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async suggest(
    projectId: string,
    branchId: string | null,
    userId: string,
    lang: SuggestionLang = 'vi',
  ): Promise<{ suggestion: string | null }> {
    await this.access.assertCanEdit(projectId, userId);

    const activeBranch = await this.projects.getActiveBranchForUser(
      projectId,
      userId,
      { accessChecked: true },
    );

    let baseHead: string | null = activeBranch.head_commit_id;
    if (branchId && branchId !== activeBranch.id) {
      const { data: branch } = await this.supabase
        .from('branches')
        .select('head_commit_id')
        .eq('id', branchId)
        .eq('project_id', projectId)
        .maybeSingle<{ head_commit_id: string | null }>();
      if (!branch) {
        throw new NotFoundException('Branch not found in this project');
      }
      baseHead = branch.head_commit_id;
    }

    if (!baseHead) return { suggestion: null };

    const base = await this.readHeadSnapshot(baseHead);
    if (!base) return { suggestion: null };

    const draft = await this.drafts.getDraft(projectId, userId);
    const diff = this.diff.compareSnapshots(base, draft);
    const changedNotes = diff.summary.notes.totalChanges;
    const changedTracks =
      diff.summary.tracks.added +
      diff.summary.tracks.removed +
      diff.summary.tracks.modified;

    if (
      changedNotes === 0 &&
      changedTracks === 0 &&
      diff.metaChanges.length === 0
    ) {
      return { suggestion: null };
    }

    if (
      changedNotes > MAX_NOTES_FOR_AI_SUGGESTION ||
      changedTracks > MAX_TRACKS_FOR_AI_SUGGESTION
    ) {
      return {
        suggestion: LARGE_CHANGE_MESSAGES[lang](changedNotes, changedTracks),
      };
    }

    if (!this.rateLimiter.tryConsume(userId)) {
      return { suggestion: null };
    }

    const raw = await this.gemini.generateText(
      COMMIT_MESSAGE_PROMPTS[lang] + JSON.stringify(buildAiSummary(diff)),
    );
    return { suggestion: this.sanitize(raw) };
  }

  private async readHeadSnapshot(
    commitId: string,
  ): Promise<DraftSnapshot | null> {
    const { data } = await this.supabase
      .from('commits')
      .select('snapshot')
      .eq('id', commitId)
      .maybeSingle<{ snapshot: DraftSnapshot }>();
    return data?.snapshot ?? null;
  }

  private sanitize(raw: string | null): string | null {
    if (raw === null) return null;
    const cleaned = raw
      .replace(/["'”«»]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length === 0) return null;
    return cleaned.length > SUGGESTION_MAX_LENGTH
      ? cleaned.slice(0, SUGGESTION_MAX_LENGTH).trim()
      : cleaned;
  }
}
