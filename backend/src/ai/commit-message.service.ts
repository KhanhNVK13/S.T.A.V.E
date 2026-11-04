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

/**
 * UC-70: gợi ý commit message bằng AI (chỉ viết 1 câu, không tự commit).
 *
 * Toán học + quy tắc làm trước, AI chỉ viết câu giải thích (nguyên tắc 1):
 * mọi con số trong prompt đều tính bằng `DiffService.compareSnapshots`
 * ngay ở server — không nhận tóm tắt từ trình duyệt (safety 1).
 *
 * BR-80 (chỉ gửi tóm tắt): prompt gồm số lượng nốt/track đổi, TÊN track
 * (đã cắt ngắn), phạm vi ô nhịp, thay đổi tempo — KHÔNG gửi nốt, tên
 * người dùng, email hay khoá.
 *
 * BR-79 (AI không load-bearing): Gemini lỗi/quá hạn/trống → suggestion
 * null, endpoint vẫn trả 200; hộp Commit phía client để ô trống.
 *
 * Mô hình đọc từ `GEMINI_MODEL`, khoá từ `GEMINI_API_KEY` — cả hai do
 * `GeminiClient` quản lý (không ghi cứng ở đây).
 */

/** UC-70 1.E1: vượt ngưỡng → không gọi AI, trả câu chung do code sinh. */
export const MAX_NOTES_FOR_AI_SUGGESTION = 300;
export const MAX_TRACKS_FOR_AI_SUGGESTION = 5;

/** Cắt tên track trong tóm tắt (giữ ngắn prompt, BR-80). */
const TRACK_NAME_MAX = 40;

/** BR-39: trần độ dài lời nhắn commit. */
const SUGGESTION_MAX_LENGTH = 200;

/** Lời nhắc cố định (sách vu.md) — AI viết đúng 1 câu, không bịa chi tiết. */
const COMMIT_MESSAGE_PROMPT =
  'Bạn viết lời nhắn commit cho một dự án nhạc MIDI. Dưới đây là tóm tắt thay đổi dạng JSON. ' +
  'Hãy viết đúng một câu tiếng Việt, tối đa 80 ký tự, ở thì hiện tại, không dùng dấu ngoặc kép, ' +
  'không giải thích thêm và không thêm chi tiết nào không có trong dữ liệu. ';

/**
 * Tóm tắt gửi cho Gemini (BR-80): chỉ số và tên track, không nốt.
 * `tracksAdded/Removed/Modified` là danh sách TÊN track (đã cắt ngắn,
 * bỏ xuống dòng); `notesByBarRange` là [ô nhịp thấp nhất, cao nhất].
 */
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

  /**
   * Tính gợi ý cho `POST /ai/commit-message`.
   *
   * Trạng thái không gọi AI (trả `suggestion: null`, luôn HTTP 200):
   * - branch chưa có commit nào (không có base để so) — first commit;
   * - bản nháp không khác gì base;
   * - người dùng chạm trần tần suất (`AiRateLimiter`);
   * - Gemini lỗi/quá hạn/không có khoá (BR-79).
   *
   * Ngoại lệ chỉ còn về quyền (403/409 qua `assertCanEdit`) và dữ liệu
   * (404 khi branch không thuộc project).
   */
  async suggest(
    projectId: string,
    branchId: string | null,
    userId: string,
  ): Promise<{ suggestion: string | null }> {
    await this.access.assertCanEdit(projectId, userId);

    // Draft hiện hành của người dùng nằm trên branch active (drafts là
    // per-user-per-active-branch — `getDraft` là hộp đen chọn branch đó).
    const activeBranch = await this.projects.getActiveBranchForUser(
      projectId,
      userId,
      { accessChecked: true },
    );

    let baseHead: string | null = activeBranch.head_commit_id;
    if (branchId && branchId !== activeBranch.id) {
      // Box Commit mở trên branch khác với branch active: draft không
      // thuộc branch đó, nên chỉ so với head thật của branch kia (đọc từ
      // DB — client không tự khai). Base rỗng → null bên dưới.
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

    // Không có gì để ghi lại (hoặc chỉ khác cách viết như nhau): null,
    // AI không bịa nội dung (nguyên tắc 1, UC-72-style "không bịa").
    if (
      changedNotes === 0 &&
      changedTracks === 0 &&
      diff.metaChanges.length === 0
    ) {
      return { suggestion: null };
    }

    // UC-70 1.E1: thay đổi quá lớn → câu chung do code sinh, không gọi AI.
    if (
      changedNotes > MAX_NOTES_FOR_AI_SUGGESTION ||
      changedTracks > MAX_TRACKS_FOR_AI_SUGGESTION
    ) {
      return {
        suggestion: `Cập nhật lớn: ${changedNotes} nốt, ${changedTracks} track thay đổi`,
      };
    }

    // Bộ đếm tần suất (10 lần/phút/mỗi người, trong bộ nhớ): chạm trần
    // thì bỏ phần AI, không làm chậm hay lỗi request.
    if (!this.rateLimiter.tryConsume(userId)) {
      return { suggestion: null };
    }

    const raw = await this.gemini.generateText(
      COMMIT_MESSAGE_PROMPT + JSON.stringify(buildAiSummary(diff)),
    );
    return { suggestion: this.sanitize(raw) };
  }

  /** Đọc `commits.snapshot` của head commit (UC-70: server tự tính). */
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

  /**
   * Bước 6: làm sạch đầu ra trước khi dùng.
   * Bỏ khoảng trắng đầu cuối, bỏ dấu ngoặc kép, thay xuống dòng bằng
   * dấu cách, cắt tối đa 200 ký tự (BR-39); rỗng → null.
   */
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
