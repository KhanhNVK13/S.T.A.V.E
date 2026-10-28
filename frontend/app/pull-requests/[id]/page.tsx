"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { GitMerge, Trash2, TriangleAlert } from "lucide-react";
import { RequireAuth } from "../../../components/require-auth";
import { useAuth } from "../../../context/auth-context";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { INPUT_CLASS } from "../../../components/ui/form";
import { Toast } from "../../../components/ui/toast";
import { MergeConflictDialog } from "../../../components/project/merge-conflict-dialog";
import { PrDiffView } from "../../../components/pull-request/pr-diff-view";
import { PullRequestStatusBadge } from "../../../components/pull-request/pull-request-list";
import {
  closePullRequest,
  commentPullRequest,
  deletePullRequestComment,
  getPullRequest,
  mergePullRequest,
  resolvePullRequestConflicts,
} from "../../../lib/api-client";
import type { ConflictChoice, MergeConflictResult, PullRequestComment, PullRequestDetail } from "../../../lib/api-client";
import { apiErrorMessage } from "../../../lib/error-message";
import { formatRelativeTime } from "../../../lib/format-date";
import { formatAuthorName } from "../../../lib/format-name";

const COMMENT_MAX = 2000;

function PullRequestView({ id }: { id: string }) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<PullRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "danger" } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const [mergeOpen, setMergeOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<MergeConflictResult | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeComment, setCloseComment] = useState("");

  const [commentBody, setCommentBody] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PullRequestComment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await getPullRequest(id));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Không tải được pull request."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp chi tiết lần đầu
    void load();
  }, [load]);

  async function handleMerge() {
    setMerging(true);
    setMergeError(null);
    try {
      const result = await mergePullRequest(id);
      setMergeOpen(false);
      if ("hasConflicts" in result) {
        setConflicts(result);
        return;
      }
      setToast({ message: "Đã hợp nhất pull request.", variant: "success" });
      await load();
    } catch (err) {
      setMergeError(apiErrorMessage(err, "Không hợp nhất được pull request."));
    } finally {
      setMerging(false);
    }
  }

  async function handleResolve(resolutions: { noteId: string; choice: ConflictChoice }[]) {
    setMerging(true);
    setResolveError(null);
    try {
      await resolvePullRequestConflicts(id, resolutions);
      setConflicts(null);
      setToast({ message: "Đã giải quyết xung đột và hợp nhất pull request.", variant: "success" });
      await load();
    } catch (err) {
      setResolveError(apiErrorMessage(err, "Không hoàn tất được việc hợp nhất."));
    } finally {
      setMerging(false);
    }
  }

  async function handleClose() {
    setClosing(true);
    setCloseError(null);
    try {
      await closePullRequest(id, closeComment.trim() || undefined);
      setCloseOpen(false);
      setCloseComment("");
      setToast({ message: "Đã đóng pull request.", variant: "success" });
      await load();
    } catch (err) {
      setCloseError(apiErrorMessage(err, "Không đóng được pull request."));
    } finally {
      setClosing(false);
    }
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    const body = commentBody.trim();
    if (body.length === 0) return;
    setCommenting(true);
    setCommentError(null);
    try {
      await commentPullRequest(id, body);
      setCommentBody("");
      await load();
    } catch (err) {
      setCommentError(apiErrorMessage(err, "Không gửi được bình luận. Nội dung của bạn vẫn được giữ lại."));
    } finally {
      setCommenting(false);
    }
  }

  async function handleDeleteComment() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deletePullRequestComment(id, pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (err) {
      setDeleteError(apiErrorMessage(err, "Không xoá được bình luận."));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-8">
        <div className="h-7 w-2/5 animate-pulse rounded bg-surface-subtle" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-8">
        <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/30 bg-danger-muted p-4 text-sm text-danger">
          <p>{error ?? "Không tải được pull request."}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              Thử lại
            </Button>
            <Link href="/pull-requests">
              <Button variant="ghost">Về danh sách pull request</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { pullRequest: pr, analysis, permissions } = detail;
  const isOpen = pr.status === "open";
  const sourceLabel = `${pr.source_project_name ?? "dự án đã xoá"} / ${pr.source_branch_name ?? "nhánh đã xoá"}`;
  const targetLabel = `${pr.target_project_name ?? "dự án đã xoá"} / ${pr.target_branch_name ?? "nhánh đã xoá"}`;
  const hasConflicts = (analysis?.conflictsCount ?? 0) > 0;

  return (
    <div className="mx-auto min-h-full max-w-4xl px-5 py-8">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">
          <Link href="/pull-requests" className="hover:underline">
            Pull request
          </Link>{" "}
          <span className="text-muted">/</span> #{pr.number}
        </p>
        <h1 className="mb-1 mt-0.5 flex flex-wrap items-center gap-2 text-[26px] font-semibold leading-tight tracking-tight">
          {pr.title}
          <PullRequestStatusBadge status={pr.status} />
        </h1>
        <p className="text-sm text-muted">
          {formatAuthorName(pr.author)} đề xuất đưa <span className="font-mono text-foreground">{sourceLabel}</span> vào{" "}
          <span className="font-mono text-foreground">{targetLabel}</span> · {formatRelativeTime(pr.created_at)}
        </p>
        {pr.description && <p className="mt-3 whitespace-pre-wrap text-sm">{pr.description}</p>}
      </div>

      {isOpen && !pr.applicable && (
        <div role="status" className="mb-5 flex items-start gap-2 rounded-card border border-warning/30 bg-warning-muted p-3 text-[13px] text-warning-foreground">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Pull request này không thể hợp nhất nữa vì dự án hoặc nhánh liên quan không còn tồn tại. Bản ghi và thảo luận vẫn được giữ lại.
        </div>
      )}

      {detail.analysisError && (
        <div role="alert" className="mb-5 rounded-card border border-danger/30 bg-danger-muted p-3 text-[13px] text-danger">
          Không so sánh được hai nhánh lúc này. Hãy tải lại trang.
        </div>
      )}

      {isOpen && hasConflicts && (
        <div role="status" className="mb-5 flex items-start gap-2 rounded-card border border-warning/30 bg-warning-muted p-3 text-[13px] text-warning-foreground">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Có {analysis?.conflictsCount} nốt xung đột. Cần chọn giữ bên nào cho từng nốt trước khi hợp nhất.
        </div>
      )}

      {(permissions.canMerge || permissions.canClose) && (
        <div className="mb-6 flex flex-wrap gap-2">
          {permissions.canMerge && pr.applicable && (
            <Button
              onClick={() => {
                setMergeError(null);
                setMergeOpen(true);
              }}
            >
              <GitMerge className="h-3.5 w-3.5" /> Duyệt và hợp nhất
            </Button>
          )}
          {permissions.canClose && (
            <Button
              variant="secondary"
              onClick={() => {
                setCloseError(null);
                setCloseOpen(true);
              }}
            >
              {user?.id === detail.pullRequest.author?.id && !permissions.canMerge ? "Rút lại" : "Đóng không hợp nhất"}
            </Button>
          )}
        </div>
      )}

      {analysis && (
        <>
          <section className="mb-6">
            <h2 className="mb-2 text-[13px] font-bold">Thay đổi được đề xuất</h2>
            <PrDiffView diff={analysis.summary} />
          </section>

          <section className="mb-6">
            <h2 className="mb-2 text-[13px] font-bold">{analysis.newCommits.length} commit mới</h2>
            <ul className="overflow-hidden rounded-card border border-border bg-surface">
              {analysis.newCommits.map((commit) => (
                <li key={commit.id} className="flex items-baseline justify-between gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0">
                  <span className="min-w-0 truncate text-[13px]">{commit.message}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {formatAuthorName(commit.author)} · {formatRelativeTime(commit.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section>
        <h2 className="mb-2 text-[13px] font-bold">Thảo luận ({detail.comments.length})</h2>
        {detail.comments.length === 0 ? (
          <p className="mb-3 text-[13px] text-muted">Chưa có bình luận nào.</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2">
            {detail.comments.map((comment) => {
              const canDelete = user?.id === comment.author_id || permissions.canMerge;
              return (
                <li key={comment.id} className="rounded-card border border-border bg-surface px-3.5 py-3">
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted">
                    <span>
                      <span className="font-semibold text-foreground">{formatAuthorName(comment.author)}</span> ·{" "}
                      {formatRelativeTime(comment.created_at)}
                    </span>
                    {canDelete && (
                      <button
                        type="button"
                        aria-label="Xoá bình luận"
                        title="Xoá bình luận"
                        onClick={() => {
                          setDeleteError(null);
                          setPendingDelete(comment);
                        }}
                        className="rounded p-1 text-muted hover:bg-surface-subtle hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-[13px]">{comment.body}</p>
                </li>
              );
            })}
          </ul>
        )}

        {permissions.canComment ? (
          <form onSubmit={(e) => void handleComment(e)} className="flex flex-col gap-2">
            <label className="text-xs font-semibold" htmlFor="pr-comment">
              Viết bình luận
            </label>
            <textarea
              id="pr-comment"
              name="comment"
              rows={3}
              maxLength={COMMENT_MAX}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              className={INPUT_CLASS}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-muted">
                {commentBody.length}/{COMMENT_MAX}
              </span>
              <Button type="submit" disabled={commenting || commentBody.trim().length === 0}>
                {commenting ? "Đang gửi…" : "Bình luận"}
              </Button>
            </div>
            {commentError && (
              <p role="alert" className="text-xs text-danger">
                {commentError}
              </p>
            )}
          </form>
        ) : (
          <Badge variant="neutral">Bạn không thể bình luận trong pull request này</Badge>
        )}
      </section>

      <ConfirmDialog
        open={mergeOpen}
        title="Hợp nhất pull request?"
        message={
          <>
            {analysis?.newCommits.length ?? 0} commit mới sẽ được đưa vào <strong>{targetLabel}</strong>, giữ nguyên tác giả
            của từng commit. Bản fork không bị thay đổi.
            {hasConflicts && " Có xung đột nên bạn sẽ được yêu cầu chọn giữ bên nào cho từng nốt."}
          </>
        }
        confirmLabel="Hợp nhất"
        loading={merging}
        error={mergeError}
        onConfirm={() => void handleMerge()}
        onCancel={() => setMergeOpen(false)}
      />

      <ConfirmDialog
        open={closeOpen}
        title="Đóng pull request?"
        message={
          <>
            Hai dự án sẽ không thay đổi. Pull request đã đóng không thể mở lại; muốn đề xuất lại phải tạo pull request mới.
            <label htmlFor="pr-close-comment" className="mt-3 block text-xs font-semibold text-foreground">
              Bình luận (tuỳ chọn)
            </label>
            <textarea
              id="pr-close-comment"
              name="close-comment"
              rows={3}
              maxLength={COMMENT_MAX}
              value={closeComment}
              onChange={(e) => setCloseComment(e.target.value)}
              className={`${INPUT_CLASS} mt-1 w-full`}
            />
          </>
        }
        confirmLabel="Đóng pull request"
        danger
        loading={closing}
        error={closeError}
        onConfirm={() => void handleClose()}
        onCancel={() => setCloseOpen(false)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Xoá bình luận?"
        message="Bình luận sẽ bị xoá vĩnh viễn."
        confirmLabel="Xoá"
        danger
        loading={deleting}
        error={deleteError}
        onConfirm={() => void handleDeleteComment()}
        onCancel={() => setPendingDelete(null)}
      />

      {conflicts && (
        <MergeConflictDialog
          result={conflicts}
          sourceName={sourceLabel}
          targetName={targetLabel}
          submitting={merging}
          error={resolveError}
          onCancel={() => {
            setConflicts(null);
            setResolveError(null);
          }}
          onResolve={(resolutions) => void handleResolve(resolutions)}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />}
    </div>
  );
}

export default function PullRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireAuth>
      <PullRequestView id={id} />
    </RequireAuth>
  );
}
