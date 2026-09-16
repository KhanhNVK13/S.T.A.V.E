"use client";

import { useCallback, useEffect, useState } from "react";
import { GitBranch, GitCommitVertical, RotateCcw, Tag as TagIcon } from "lucide-react";
import {
  ApiError,
  getCommitHistory,
  listProjectBranches,
  restoreCommit,
  tagCommit,
} from "../../lib/api-client";
import type { Branch, CommitWithAuthor } from "../../lib/api-client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { INPUT_CLASS } from "../ui/form";
import { RowList, RowHeader, RowItem, RowTime } from "../ui/row-list";
import { Toast } from "../ui/toast";

/** Commit | tác giả | mã | thời điểm | thao tác. */
const COLS = "md:grid-cols-[minmax(0,1fr)_150px_88px_78px_auto]";

const PAGE_SIZE = 20;

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * UC-43 (xem lịch sử commit) + UC-44 (gắn tag) + UC-46 (khôi phục) ở cấp
 * PROJECT — tách khỏi MIDI Editor để xem được lịch sử mà không phải mở trình
 * soạn nhạc.
 *
 * Chỉ chủ dự án gọi được các endpoint này (backend trả 403 cho người khác —
 * đúng SRS: UC-43 actor là User/chủ dự án, còn UC-09 "Guest xem dự án công
 * khai" chỉ gồm playback/mô tả/thống kê). Trang cha chịu trách nhiệm ẩn tab
 * này với người không phải chủ.
 *
 * Hiện chỉ đọc lịch sử của **branch mặc định**: chọn branch là việc của UC-47+
 * (Branch Management) — xem PROJECT_STATE §27 mục C.
 */
export function CommitHistory({ projectId }: { projectId: string }) {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [commits, setCommits] = useState<CommitWithAuthor[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [taggingId, setTaggingId] = useState<string | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagBusy, setTagBusy] = useState(false);

  const [restoreTarget, setRestoreTarget] = useState<CommitWithAuthor | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);

  const loadHistory = useCallback(
    async (branchId: string, targetPage: number) => {
      setLoading(true);
      try {
        const data = await getCommitHistory({
          branchId,
          page: targetPage,
          limit: PAGE_SIZE,
        });
        setCommits(data.items);
        setTotal(data.total);
        setError(null);
      } catch (err) {
        setError(messageOf(err, "Không tải được lịch sử commit."));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const branches = await listProjectBranches(projectId);
        const target = branches.find((b) => b.is_default) ?? branches[0] ?? null;
        if (cancelled) return;
        setBranch(target);
        if (target) {
          await loadHistory(target.id, 1);
        } else {
          setError("Dự án chưa có nhánh nào.");
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(messageOf(err, "Không tải được danh sách nhánh."));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, loadHistory]);

  async function handleTag(commitId: string) {
    const name = tagName.trim();
    if (!name) return;
    setTagBusy(true);
    try {
      await tagCommit(commitId, name);
      setTaggingId(null);
      setTagName("");
      setNotice(`Đã gắn tag "${name}".`);
      if (branch) await loadHistory(branch.id, page);
    } catch (err) {
      setError(messageOf(err, "Không gắn được tag."));
    } finally {
      setTagBusy(false);
    }
  }

  async function handleRestore() {
    if (!restoreTarget || !branch) return;
    setRestoreBusy(true);
    try {
      await restoreCommit(restoreTarget.id, { branch_id: branch.id });
      setRestoreTarget(null);
      setNotice("Đã khôi phục — một commit mới đã được tạo, lịch sử cũ vẫn giữ nguyên.");
      setPage(1);
      await loadHistory(branch.id, 1);
    } catch (err) {
      setError(messageOf(err, "Không khôi phục được phiên bản này."));
    } finally {
      setRestoreBusy(false);
    }
  }

  function goToPage(next: number) {
    if (!branch) return;
    setPage(next);
    void loadHistory(branch.id, next);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading && commits.length === 0) {
    return (
      <RowList>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[68px] animate-pulse items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0"
          >
            <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-surface-subtle" />
            <div className="flex-1">
              <div className="mb-1.5 h-3 w-1/3 rounded bg-surface-subtle" />
              <div className="h-2.5 w-1/4 rounded bg-surface-subtle" />
            </div>
          </div>
        ))}
      </RowList>
    );
  }

  return (
    <>
      {notice && <Toast message={notice} variant="success" onDismiss={() => setNotice(null)} />}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[11px] text-muted">
          <GitBranch className="h-3.5 w-3.5" />
          Nhánh <span className="font-mono text-foreground">{branch?.name ?? "—"}</span>
          {total > 0 && (
            <>
              <span>·</span>
              <span className="font-mono">{total.toLocaleString("vi-VN")}</span> commit
            </>
          )}
        </p>
      </div>

      {error && (
        <div className="mb-3 rounded-card border border-danger/20 bg-danger-muted px-4 py-3">
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      {commits.length === 0 && !error ? (
        <EmptyState
          icon={GitCommitVertical}
          title="Chưa có commit nào."
          description="Mở trình soạn nhạc, thay đổi bản nhạc rồi tạo commit đầu tiên."
        />
      ) : (
        <RowList>
          <RowHeader cols={COLS}>
            <span>Commit</span>
            <span>Tác giả</span>
            <span>Mã</span>
            <span className="text-right">Thời điểm</span>
            <span />
          </RowHeader>

          {commits.map((commit, i) => {
            const isHead = page === 1 && i === 0;
            const authorName =
              commit.author.display_name ?? commit.author.username ?? "Người dùng";
            return (
              <RowItem key={commit.id} cols={COLS}>
                <div className="flex min-w-0 items-start gap-2.5">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      isHead ? "bg-accent" : "bg-border-strong"
                    }`}
                    title={isHead ? "Commit mới nhất của nhánh" : undefined}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{commit.message}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {isHead && <Badge variant="info">Mới nhất</Badge>}
                      {commit.tags.map((tag) => (
                        <Badge key={tag.id} variant="metal">
                          <TagIcon className="h-3 w-3" /> {tag.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <span className="truncate text-[11px] text-muted">{authorName}</span>
                <span className="font-mono text-[11px] text-accent">
                  {commit.id.slice(0, 7)}
                </span>
                <RowTime>
                  {new Date(commit.created_at).toLocaleString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </RowTime>

                <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                  {taggingId === commit.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleTag(commit.id);
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        autoFocus
                        value={tagName}
                        onChange={(e) => setTagName(e.target.value)}
                        placeholder="Tên tag"
                        className={`${INPUT_CLASS} h-8 w-28 font-mono`}
                      />
                      <Button type="submit" disabled={tagBusy || !tagName.trim()}>
                        {tagBusy ? "Đang lưu…" : "Lưu"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setTaggingId(null);
                          setTagName("");
                        }}
                      >
                        Huỷ
                      </Button>
                    </form>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setTaggingId(commit.id);
                          setTagName("");
                        }}
                      >
                        <TagIcon className="h-3.5 w-3.5" /> Gắn tag
                      </Button>
                      <Button variant="secondary" onClick={() => setRestoreTarget(commit)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Khôi phục
                      </Button>
                    </>
                  )}
                </div>
              </RowItem>
            );
          })}
        </RowList>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="secondary" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
            Trước
          </Button>
          <span className="px-2 font-mono text-[11px] text-muted">
            {page} / {totalPages}
          </span>
          <Button
            variant="secondary"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
          >
            Sau
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!restoreTarget}
        title="Khôi phục phiên bản này?"
        message={
          <>
            Bản nhạc sẽ quay về trạng thái của commit{" "}
            <span className="font-mono">{restoreTarget?.id.slice(0, 7)}</span> (
            {restoreTarget?.message}).
            <br />
            <br />
            Lịch sử KHÔNG bị xoá — hệ thống tạo một commit mới mang nội dung cũ, và bản nháp
            đang mở của nhánh này sẽ được đặt lại theo nội dung đó.
          </>
        }
        confirmLabel="Khôi phục"
        loading={restoreBusy}
        onConfirm={() => void handleRestore()}
        onCancel={() => setRestoreTarget(null)}
      />
    </>
  );
}
