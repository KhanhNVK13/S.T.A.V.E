"use client";

import { useMemo, useState } from "react";
import {
  CornerDownRight,
  Loader2,
  MapPin,
  MessageSquare,
  Send,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type {
  CommentItem,
  DraftNote,
  DraftTrack,
} from "@stave/shared-types";
import { useAuth } from "../../context/auth-context";
import { getProject } from "../../lib/api-client";
import {
  COMMENT_BODY_MAX_LENGTH,
  createComment,
  deleteComment,
  getComments,
} from "../../lib/api-comments";
import { barToTick, tickToBar } from "../../lib/piano-roll-geometry";
import { apiErrorMessage } from "../../lib/error-message";
import { formatRelativeTime } from "../../lib/format-date";
import { useApiResource } from "../../lib/use-api-resource";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { INPUT_CLASS } from "../ui/form";

/**
 * UC-63 — panel "Bình luận ghim" trong editor.
 *
 * - Danh sách bình luận gom theo ô nhịp (bar), hoặc nhóm "Toàn dự án" cho
 *   bình luận không gắn vị trí. Mỗi bình luận neo vào nốt đã xoá hiện nhãn
 *   "Nốt này không còn tồn tại" (noteMissing, BR-68) mà không bị xoá.
 * - Ô soạn mới: giới hạn 1000 ký tự (có đếm số), trả lời 1 cấp, xoá có xác
 *   nhận. Nút "Đi tới ô nhịp" kéo playhead tới bar (barToTick + onSeek).
 *
 * Quyền xoá do backend kiểm (tác giả hoặc owner, BR-69) — phía này chỉ ẩn
 * nút khi chắc chắn không xoá được, không phải biên kiểm.
 */

/** Kiểu thời ký — cùng ký hiệu `timeSignature` của MIDI Editor. */
type TimeSig = [number, number];

interface CommentsPanelProps {
  projectId: string;
  ppq: number;
  timeSignature: TimeSig;
  tracks: DraftTrack[];
  notes: DraftNote[];
  selectedNoteIds: Set<string>;
  onSeek: (tick: number) => void;
  onClose: () => void;
}

export function CommentsPanel({
  projectId,
  ppq,
  timeSignature,
  tracks,
  notes,
  selectedNoteIds,
  onSeek,
  onClose,
}: CommentsPanelProps) {
  const { user } = useAuth();
  const myId = user?.id ?? null;

  // Token bump to re-fetch the list after a mutation (create/delete/reply).
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = () => setRefreshTick((n) => n + 1);

  // Owner detection: getProject (GET /projects/:id) is owner-scoped, so a
  // success means I own the project. Collaborators get a 404 → isOwner=false,
  // which is the correct "only author can delete" behavior today.
  const { data: project } = useApiResource(
    () => getProject(projectId),
    [projectId],
    "",
  );
  const isOwner =
    project !== null &&
    (project as { owner_id?: string }).owner_id === myId;

  const { data: fetched, loading, error: listError } = useApiResource(
    () => getComments(projectId),
    [projectId, refreshTick],
    "Không tải được danh sách bình luận.",
  );
  const items = useMemo(() => (fetched ?? []) as CommentItem[], [fetched]);

  // ── Composer state ─────────────────────────────────────────
  const [body, setBody] = useState("");
  const [anchorTrackId, setAnchorTrackId] = useState<string>("");
  const [anchorBar, setAnchorBar] = useState<string>("");
  const [anchorNoteId, setAnchorNoteId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Reply targeting one top-level comment (single level).
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Delete confirmation (BR-69).
  const [deleteTarget, setDeleteTarget] = useState<CommentItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // The selected note in the roll pre-fills the anchor (if exactly one).
  const prefillNote = useMemo(() => {
    if (selectedNoteIds.size !== 1) return null;
    const id = [...selectedNoteIds][0];
    return notes.find((n) => n.id === id) ?? null;
  }, [selectedNoteIds, notes]);

  const bodyTrimmed = body.trim();
  const bodyLen = body.length;
  const bodyEmpty = bodyTrimmed.length === 0;

  async function handleSubmit() {
    // 4.E1: empty after trim → no-op, no error. 4.E2: over limit is blocked
    // by the maxLength on the textarea; this is the belt-and-braces guard.
    if (bodyEmpty || bodyLen > COMMENT_BODY_MAX_LENGTH) return;

    setSending(true);
    setSendError(null);
    try {
      // If a note is anchored, use its track + bar so the comment sits on it.
      const note = anchorNoteId
        ? notes.find((n) => n.id === anchorNoteId)
        : null;
      const resolvedTrack = note?.trackId ?? (anchorTrackId || undefined);
      const resolvedBar = note
        ? tickToBar(note.start, ppq, timeSignature)
        : anchorBar
          ? Number(anchorBar)
          : undefined;
      await createComment(projectId, {
        body: bodyTrimmed,
        trackId: resolvedTrack,
        bar: resolvedBar,
        noteId: anchorNoteId ?? undefined,
      });
      setBody("");
      setAnchorTrackId("");
      setAnchorBar("");
      setAnchorNoteId(null);
      refresh();
    } catch (err) {
      setSendError(apiErrorMessage(err, "Không đăng được bình luận."));
    } finally {
      setSending(false);
    }
  }

  async function handleReply() {
    if (!replyTo || replyBody.trim().length === 0) return;
    setReplySending(true);
    setReplyError(null);
    try {
      // A reply inherits its anchor from the parent (backend fills it in) —
      // we only send the parent's id.
      await createComment(projectId, {
        body: replyBody.trim(),
        parentId: replyTo.id,
      });
      setReplyTo(null);
      setReplyBody("");
      refresh();
    } catch (err) {
      setReplyError(apiErrorMessage(err, "Không trả lời được bình luận."));
    } finally {
      setReplySending(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteComment(projectId, deleteTarget.id);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setDeleteError(apiErrorMessage(err, "Không xoá được bình luận."));
    } finally {
      setDeleting(false);
    }
  }

  // ── Group by bar (or "whole project") ──────────────────────
  const groups = useMemo(() => {
    type Group = { roots: CommentItem[]; replies: Map<string, CommentItem[]> };
    const byBar = new Map<number | "project", Group>();
    const keyOf = (c: CommentItem): number | "project" =>
      c.bar !== null ? c.bar : "project";

    for (const c of items) {
      const g =
        byBar.get(keyOf(c)) ?? { roots: [], replies: new Map<string, CommentItem[]>() };
      if (!c.parentId) {
        g.roots.push(c);
      } else {
        const bucket = g.replies.get(c.parentId) ?? [];
        bucket.push(c);
        g.replies.set(c.parentId, bucket);
      }
      byBar.set(keyOf(c), g);
    }

    // "Whole project" group always last, bars ascending by number.
    const sorted = [...byBar.entries()].sort((a, b) => {
      if (a[0] === "project") return 1;
      if (b[0] === "project") return -1;
      return (a[0] as number) - (b[0] as number);
    });
    return sorted;
  }, [items]);

  function canDelete(c: CommentItem) {
    return myId !== null && (isOwner || c.author.id === myId);
  }

  function trackName(trackId: string | null | undefined): string {
    if (!trackId) return "Toàn dự án";
    return tracks.find((t) => t.id === trackId)?.name ?? "track";
  }

  const hasAnchor = Boolean(anchorNoteId || anchorTrackId || anchorBar);

  return (
    <div
      className="absolute inset-y-0 right-0 z-30 flex w-[340px] flex-col border-l border-border bg-surface shadow-card"
      role="region"
      aria-label="Bình luận"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-accent" />
          <h2 className="text-[13px] font-semibold">Bình luận</h2>
          {items.length > 0 && (
            <span className="text-xs text-muted">({items.length})</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng panel bình luận"
          title="Đóng"
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-subtle hover:text-foreground"
        >
          <X size={15} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {listError ? (
          <div
            role="alert"
            className="rounded-card border border-danger/30 bg-danger-muted p-3 text-[13px] text-danger"
          >
            <p className="flex items-center gap-1.5 font-medium">
              <TriangleAlert size={14} /> {listError}
            </p>
            <Button
              type="button"
              variant="secondary"
              className="mt-2 h-7 text-xs"
              onClick={refresh}
            >
              Thử lại
            </Button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Đang tải bình luận…
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-card bg-surface-subtle px-3 py-6 text-center text-[13px] text-muted">
            Chưa có bình luận nào. Viết bình luận đầu tiên bên dưới.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(([barKey, g]) => {
              if (g.roots.length === 0 && g.replies.size === 0) return null;
              return (
                <section
                  key={barKey === "project" ? "project" : `bar-${barKey}`}
                >
                  {barKey !== "project" ? (
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-xs font-semibold text-muted">
                        <MapPin size={12} />
                        Ô nhịp {String(barKey)}
                        {g.roots[0]?.trackId && (
                          <span className="font-normal">
                            · {trackName(g.roots[0].trackId)}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onSeek(barToTick(Number(barKey), ppq, timeSignature))
                        }
                        className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent-muted"
                      >
                        Đi tới ô nhịp
                      </button>
                    </div>
                  ) : (
                    <p className="mb-2 text-xs font-semibold text-muted">
                      Toàn dự án
                    </p>
                  )}

                  <div className="flex flex-col gap-2">
                    {/* Replies whose parent has been deleted float up here */}
                    {[...g.replies.values()]
                      .filter((list) => !g.roots.some((r) => r.id === list[0]?.parentId))
                      .flat()
                      .map((r) => (
                        <CommentRow
                          key={r.id}
                          c={r}
                          isReply
                          canDelete={canDelete(r)}
                          onDelete={() => setDeleteTarget(r)}
                        />
                      ))}

                    {g.roots.map((r) => {
                      const replies = g.replies.get(r.id) ?? [];
                      const composing = replyTo?.id === r.id;
                      return (
                        <div key={r.id} className="flex flex-col gap-2">
                          <CommentRow
                            c={r}
                            canDelete={canDelete(r)}
                            onDelete={() => setDeleteTarget(r)}
                            onReply={() => {
                              setReplyTo(r);
                              setReplyBody("");
                              setReplyError(null);
                            }}
                            onSeek={onSeek}
                            ppq={ppq}
                            timeSignature={timeSignature}
                            tracks={tracks}
                          />
                          {replies.map((rp) => (
                            <CommentRow
                              key={rp.id}
                              c={rp}
                              isReply
                              canDelete={canDelete(rp)}
                              onDelete={() => setDeleteTarget(rp)}
                            />
                          ))}
                          {composing && (
                            <div className="ml-6 flex flex-col gap-1.5">
                              {replyError && (
                                <p
                                  role="alert"
                                  className="rounded-card bg-danger-muted px-2.5 py-1.5 text-[12px] text-danger"
                                >
                                  {replyError}
                                </p>
                              )}
                              <textarea
                                name={`reply-${r.id}`}
                                rows={1}
                                maxLength={COMMENT_BODY_MAX_LENGTH}
                                placeholder="Trả lời…"
                                autoFocus
                                value={replyBody}
                                onChange={(e) => setReplyBody(e.target.value)}
                                className={`${INPUT_CLASS} resize-none`}
                              />
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => void handleReply()}
                                  disabled={
                                    replySending || replyBody.trim().length === 0
                                  }
                                  className="h-7 text-xs"
                                >
                                  {replySending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <CornerDownRight size={13} />
                                  )}
                                  Trả lời
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => {
                                    setReplyTo(null);
                                    setReplyBody("");
                                    setReplyError(null);
                                  }}
                                  disabled={replySending}
                                  className="h-7 text-xs"
                                >
                                  Huỷ
                                </Button>
                                <span className="ml-auto text-[11px] text-muted">
                                  {replyBody.length}/{COMMENT_BODY_MAX_LENGTH}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border px-3 py-3">
        {sendError && (
          <p
            role="alert"
            className="mb-2 rounded-card bg-danger-muted px-3 py-2 text-[13px] text-danger"
          >
            {sendError}
          </p>
        )}

        {hasAnchor && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="info">
              Gắn:{" "}
              {anchorNoteId
                ? `nốt ${anchorNoteId.slice(0, 6)}`
                : anchorTrackId
                  ? `${trackName(anchorTrackId)}${anchorBar ? ` · nhịp ${anchorBar}` : ""}`
                  : `nhịp ${anchorBar}`}
            </Badge>
            <button
              type="button"
              onClick={() => {
                setAnchorNoteId(null);
                setAnchorTrackId("");
                setAnchorBar("");
              }}
              className="text-[11px] font-semibold text-muted hover:text-danger"
            >
              Xoá vị trí
            </button>
          </div>
        )}

        {prefillNote && !anchorNoteId && (
          <button
            type="button"
            onClick={() => {
              setAnchorNoteId(prefillNote.id);
              setAnchorTrackId("");
              setAnchorBar(String(tickToBar(prefillNote.start, ppq, timeSignature)));
            }}
            className="mb-2 w-full rounded-card border border-border bg-surface-subtle px-2.5 py-1.5 text-left text-[12px] text-muted transition-colors hover:border-accent/40 hover:text-foreground"
          >
            Gắn vào nốt đang chọn (nhịp{" "}
            {tickToBar(prefillNote.start, ppq, timeSignature)})
          </button>
        )}

        <textarea
          name="comment-body"
          autoComplete="off"
          rows={2}
          maxLength={COMMENT_BODY_MAX_LENGTH}
          placeholder="Viết bình luận…"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (sendError) setSendError(null);
          }}
          className={`${INPUT_CLASS} resize-none`}
        />

        <div className="mt-2 flex items-center gap-2">
          <select
            name="comment-track"
            aria-label="Track (tuỳ chọn)"
            value={
              anchorNoteId
                ? (notes.find((n) => n.id === anchorNoteId)?.trackId ?? "")
                : anchorTrackId
            }
            onChange={(e) => setAnchorTrackId(e.target.value)}
            className={`${INPUT_CLASS} h-7 min-w-0 flex-1 py-0 text-xs`}
          >
            <option value="">Track…</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            inputMode="numeric"
            name="comment-bar"
            aria-label="Ô nhịp (tuỳ chọn)"
            placeholder="Nhịp"
            value={anchorBar}
            onChange={(e) =>
              setAnchorBar(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))
            }
            className={`${INPUT_CLASS} h-7 w-14 py-0 text-xs`}
          />
          <span
            className={`text-[11px] ${
              bodyLen >= COMMENT_BODY_MAX_LENGTH ? "text-danger" : "text-muted"
            }`}
          >
            {bodyLen}/{COMMENT_BODY_MAX_LENGTH}
          </span>
        </div>

        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={sending || bodyEmpty || bodyLen > COMMENT_BODY_MAX_LENGTH}
            className="h-7 gap-1.5 text-xs"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send size={13} />
            )}
            {sending ? "Đang gửi…" : "Bình luận"}
          </Button>
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Xoá bình luận"
        message={
          <span>
            Xoá bình luận của{" "}
            <strong>
              {deleteTarget?.author.displayName?.trim() ||
                deleteTarget?.author.username?.trim() ||
                "người dùng"}
            </strong>
            ? Các trả lời (nếu có) cũng sẽ bị xoá cùng.
          </span>
        }
        confirmLabel="Xoá"
        cancelLabel="Huỷ"
        danger
        loading={deleting}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      />
    </div>
  );
}

// ── Comment row ──────────────────────────────────────────────

function CommentRow({
  c,
  isReply = false,
  canDelete,
  onDelete,
  onReply,
  onSeek,
  ppq,
  timeSignature,
  tracks,
}: {
  c: CommentItem;
  isReply?: boolean;
  canDelete?: boolean;
  onDelete?: () => void;
  onReply?: () => void;
  onSeek?: (tick: number) => void;
  ppq?: number;
  timeSignature?: TimeSig;
  tracks?: DraftTrack[];
}) {
  const authorName =
    c.author.displayName?.trim() || c.author.username?.trim() || "Người dùng";

  return (
    <article
      className={`rounded-card border border-border bg-surface px-3 py-2.5 ${
        isReply ? "ml-6 border-l-2 border-l-accent/40" : ""
      }`}
    >
      <div className="flex items-start gap-2.5">
        <Avatar
          id={c.author.id}
          label={authorName}
          imageUrl={c.author.avatarUrl}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[13px] font-semibold">{authorName}</span>
            <span className="text-[11px] text-muted">
              {formatRelativeTime(c.createdAt)}
            </span>
            {c.bar !== null && <Badge variant="neutral">Nhịp {String(c.bar)}</Badge>}
            {c.trackId && tracks && (
              <Badge variant="neutral">
                {tracks.find((t) => t.id === c.trackId)?.name ?? c.trackId}
              </Badge>
            )}
            {c.noteId && <Badge variant="neutral">Gắn nốt</Badge>}
            {c.noteMissing && (
              <Badge variant="warning">Nốt này không còn tồn tại</Badge>
            )}
          </div>
          <p className="mt-1 break-words text-[13px] leading-snug text-foreground">
            {c.body}
          </p>

          <div className="mt-1.5 flex items-center gap-3">
            {c.bar !== null &&
              onSeek &&
              ppq !== undefined &&
              timeSignature !== undefined && (
                <button
                  type="button"
                  onClick={() =>
                    onSeek(barToTick(c.bar as number, ppq, timeSignature))
                  }
                  className="flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
                >
                  <MapPin size={11} /> Đi tới ô nhịp
                </button>
              )}
            {!isReply && onReply && (
              <button
                type="button"
                onClick={onReply}
                className="flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-foreground"
              >
                <CornerDownRight size={11} /> Trả lời
              </button>
            )}
            {canDelete && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-muted transition-colors hover:text-danger"
              >
                <Trash2 size={11} /> Xoá
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
