/**
 * redesign/use-version-control.ts
 * Toàn bộ state + lời gọi API của nhóm Version Control cho MIDI Editor:
 *   UC-42 Create Commit · UC-43 Commit History · UC-44 Tag · UC-46 Restore.
 *
 * CHƯA làm ở đây (cố ý, để dành phiên sau theo thứ tự đã thống nhất):
 * UC-45 Compare/Diff, UC-47→52 Branch Management, UC-51/86 Merge/Conflict.
 * Vì vậy hook chỉ làm việc trên **branch mặc định** của project — đúng
 * invariant CLAUDE.md 4.2 (project nào cũng có sẵn 1 branch `main`) và đúng
 * phạm vi của `GET|PUT /projects/:id/draft` (cũng thao tác trên branch này).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftSnapshot } from "@stave/shared-types";
import {
  ApiError,
  createCommit,
  getCommitHistory,
  listProjectBranches,
  restoreCommit,
  tagCommit,
} from "../../../lib/api-client";
import type { Branch, CommitWithAuthor } from "../../../lib/api-client";

/**
 * Số commit tải mỗi lần. Response của `GET /commits` kèm nguyên snapshot của
 * từng commit nên không lấy quá nhiều một lúc; `total` vẫn cho biết số thật.
 */
const HISTORY_PAGE_SIZE = 20;

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export interface UseVersionControlOptions {
  projectId: string;
  /**
   * Ghi ngay bản nháp đang sửa xuống `drafts` (huỷ debounce autosave) rồi resolve.
   * Bắt buộc gọi trước khi commit: backend lấy snapshot từ bảng `drafts`, nếu
   * còn thay đổi chưa lưu thì commit sẽ ghi lại bản cũ.
   */
  flushDraft: () => Promise<void>;
  /** Đồng bộ editor về snapshot backend vừa trả sau khi restore (UC-46 POST-4). */
  onSnapshotRestored: (snapshot: DraftSnapshot) => void;
}

export interface VersionControl {
  branch: Branch | null;
  branchError: string | null;
  branchLoading: boolean;

  commits: CommitWithAuthor[];
  total: number;
  historyLoading: boolean;
  historyError: string | null;
  reloadHistory: () => void;

  /** Commit đang là head của branch — mốc so sánh thay đổi trong dialog Commit. */
  headCommit: CommitWithAuthor | null;

  committing: boolean;
  commitError: string | null;
  /** Trả về true nếu tạo commit thành công. */
  commit: (message: string) => Promise<boolean>;
  clearCommitError: () => void;

  tagging: boolean;
  tagError: string | null;
  tag: (commitId: string, name: string) => Promise<boolean>;
  clearTagError: () => void;

  restoring: boolean;
  restoreError: string | null;
  restore: (commitId: string) => Promise<boolean>;
  clearRestoreError: () => void;

  /** Thông báo ngắn sau thao tác thành công (tự ẩn sau vài giây). */
  notice: string | null;
}

export function useVersionControl({
  projectId,
  flushDraft,
  onSnapshotRestored,
}: UseVersionControlOptions): VersionControl {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [branchLoading, setBranchLoading] = useState(true);
  const [branchError, setBranchError] = useState<string | null>(null);

  const [commits, setCommits] = useState<CommitWithAuthor[]>([]);
  const [total, setTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [tagging, setTagging] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * head_commit_id mà client tin là hiện tại — gửi kèm khi commit để backend
   * từ chối (409) nếu branch đã đi tiếp ở nơi khác, thay vì ghi đè ngầm.
   * Giữ ở ref vì handler cần giá trị mới nhất, không cần render lại vì nó.
   */
  const headCommitIdRef = useRef<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setNotice(null);
    }, 4000);
  }, []);

  const loadHistory = useCallback(async (branchId: string) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const page = await getCommitHistory({
        branchId,
        limit: HISTORY_PAGE_SIZE,
      });
      if (!mountedRef.current) return;
      setCommits(page.items);
      setTotal(page.total);
    } catch (err) {
      if (!mountedRef.current) return;
      setHistoryError(messageOf(err, "Không tải được lịch sử phiên bản"));
    } finally {
      if (mountedRef.current) setHistoryLoading(false);
    }
  }, []);

  // ── Nạp branch mặc định rồi nạp lịch sử của nó ────────────────
  // Không setState đồng bộ trong thân effect (ESLint react-hooks/
  // set-state-in-effect chặn) — trạng thái "đang tải" đã là giá trị khởi tạo
  // của useState, mọi thay đổi khác đều nằm trong callback của promise.
  useEffect(() => {
    let cancelled = false;

    listProjectBranches(projectId)
      .then((branches) => {
        if (cancelled) return;
        const target = branches.find((b) => b.is_default) ?? branches[0] ?? null;
        if (!target) {
          setBranchError("Project chưa có branch nào");
          return;
        }
        setBranch(target);
        headCommitIdRef.current = target.head_commit_id;
        void loadHistory(target.id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBranchError(messageOf(err, "Không tải được thông tin branch"));
      })
      .finally(() => {
        if (!cancelled) setBranchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, loadHistory]);

  const reloadHistory = useCallback(() => {
    if (branch) void loadHistory(branch.id);
  }, [branch, loadHistory]);

  const branchId = branch?.id ?? null;

  /** Lấy lại head thật từ server khi branch đã đi tiếp ở nơi khác (409). */
  const refreshHeadFromServer = useCallback(async () => {
    if (!branchId) return;
    try {
      const branches = await listProjectBranches(projectId);
      const fresh = branches.find((b) => b.id === branchId);
      if (fresh && mountedRef.current) {
        setBranch(fresh);
        headCommitIdRef.current = fresh.head_commit_id;
      }
    } catch {
      // Không chặn luồng chính: lần commit sau sẽ báo lại nếu vẫn lệch.
    }
  }, [projectId, branchId]);

  // ── UC-42: tạo commit ─────────────────────────────────────────
  const commit = useCallback(
    async (message: string): Promise<boolean> => {
      if (!branch) {
        setCommitError("Chưa xác định được branch của project");
        return false;
      }
      setCommitting(true);
      setCommitError(null);
      try {
        // Bắt buộc: đẩy bản nháp đang sửa xuống DB trước, vì backend commit
        // snapshot đọc từ bảng `drafts` chứ không phải từ payload này.
        await flushDraft();

        const created = await createCommit({
          branch_id: branch.id,
          message,
          expectedHeadCommitId: headCommitIdRef.current ?? undefined,
        });

        headCommitIdRef.current = created.id;
        if (mountedRef.current) {
          setBranch((prev) =>
            prev ? { ...prev, head_commit_id: created.id } : prev,
          );
        }
        await loadHistory(branch.id);
        showNotice("Đã tạo commit mới");
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          // Branch đã đi tiếp ở nơi khác — lấy lại head thật + lịch sử mới.
          await refreshHeadFromServer();
          await loadHistory(branch.id);
        }
        if (mountedRef.current) {
          setCommitError(messageOf(err, "Không tạo được commit"));
        }
        return false;
      } finally {
        if (mountedRef.current) setCommitting(false);
      }
    },
    [branch, flushDraft, loadHistory, refreshHeadFromServer, showNotice],
  );

  // ── UC-44: gắn tag ────────────────────────────────────────────
  const tag = useCallback(
    async (commitId: string, name: string): Promise<boolean> => {
      setTagging(true);
      setTagError(null);
      try {
        // BR-44 (tên tag unique trong project, 1 tag/commit) do unique
        // constraint dưới DB quyết định — client không tự đoán trùng.
        const created = await tagCommit(commitId, name);
        if (mountedRef.current) {
          setCommits((prev) =>
            prev.map((c) => (c.id === commitId ? { ...c, tags: [created] } : c)),
          );
        }
        showNotice("Đã gắn tag " + created.name);
        return true;
      } catch (err) {
        if (mountedRef.current) {
          setTagError(messageOf(err, "Không gắn được tag"));
        }
        return false;
      } finally {
        if (mountedRef.current) setTagging(false);
      }
    },
    [showNotice],
  );

  // ── UC-46: khôi phục phiên bản cũ ─────────────────────────────
  const restore = useCallback(
    async (commitId: string): Promise<boolean> => {
      if (!branch) {
        setRestoreError("Chưa xác định được branch của project");
        return false;
      }
      setRestoring(true);
      setRestoreError(null);
      try {
        const created = await restoreCommit(commitId, { branch_id: branch.id });

        headCommitIdRef.current = created.id;
        if (mountedRef.current) {
          setBranch((prev) =>
            prev ? { ...prev, head_commit_id: created.id } : prev,
          );
        }
        // Backend đã reset draft về snapshot này trong cùng transaction
        // (RPC create_commit_atomic) — đồng bộ editor theo response thật.
        onSnapshotRestored(created.snapshot);
        await loadHistory(branch.id);
        showNotice("Đã khôi phục — tạo commit mới, lịch sử cũ giữ nguyên");
        return true;
      } catch (err) {
        if (mountedRef.current) {
          setRestoreError(messageOf(err, "Không khôi phục được phiên bản này"));
        }
        return false;
      } finally {
        if (mountedRef.current) setRestoring(false);
      }
    },
    [branch, loadHistory, onSnapshotRestored, showNotice],
  );

  const clearCommitError = useCallback(() => setCommitError(null), []);
  const clearTagError = useCallback(() => setTagError(null), []);
  const clearRestoreError = useCallback(() => setRestoreError(null), []);

  const headCommit =
    commits.find((c) => c.id === branch?.head_commit_id) ?? null;

  return {
    branch,
    branchError,
    branchLoading,
    commits,
    total,
    historyLoading,
    historyError,
    reloadHistory,
    headCommit,
    committing,
    commitError,
    commit,
    clearCommitError,
    tagging,
    tagError,
    tag,
    clearTagError,
    restoring,
    restoreError,
    restore,
    clearRestoreError,
    notice,
  };
}
