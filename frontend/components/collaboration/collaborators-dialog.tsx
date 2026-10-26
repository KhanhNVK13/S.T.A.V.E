"use client";

import { useState } from "react";
import { Loader2, Trash2, UserPlus, Users } from "lucide-react";
import type { CollaboratorItem, CollaboratorPermissionLevel } from "@stave/shared-types";
import {
  inviteCollaborator,
  listCollaborators,
  patchCollaboratorPermission,
  removeCollaborator,
} from "../../lib/api-collab";
import { apiErrorMessage } from "../../lib/error-message";
import { formatRelativeTime } from "../../lib/format-date";
import { useApiResource } from "../../lib/use-api-resource";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Dialog, DialogError } from "../ui/dialog";
import { INPUT_CLASS } from "../ui/form";
import { CollaboratorPermissionSelect, collaboratorDisplayName, PERMISSION_LABELS } from "./collaborator-controls";

/**
 * UC-60/61/62 — hộp thoại "Cộng tác viên", mở từ toolbar editor (chủ dự án)
 * hoặc các trang có quyền xem.
 *
 * - `isOwner` = false: chỉ xem danh sách + quyền hiện tại (dropdown chỉ đọc,
 *   không mời/gỡ) — quyền thật vẫn do backend kiểm (BR-65, 1.E1).
 * - Người đang `pending` được gắn nhãn "Đang chờ", chưa có quyền truy cập.
 * - Đổi quyền (UC-61) thất bại: giữ giá trị cũ, dropdown tự hoàn về (3.E2).
 * - Gỡ (UC-62) qua ConfirmDialog, nêu rõ đóng góp vẫn giữ trong lịch sử.
 */
export function CollaboratorsDialog({
  open,
  onClose,
  projectId,
  projectName,
  isOwner,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  isOwner: boolean;
}) {
  const [attempt, setAttempt] = useState(0);

  // UC-60: form mời.
  const [identifier, setIdentifier] = useState("");
  const [permission, setPermission] = useState<CollaboratorPermissionLevel>("edit");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // UC-61: đổi quyền từng hàng.
  const [permissionBusy, setPermissionBusy] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // UC-62: gỡ (qua ConfirmDialog).
  const [removeTarget, setRemoveTarget] = useState<CollaboratorItem | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Danh sách tải bằng useApiResource (khuyến nghị của repo) để tránh setState
  // đồng bộ trong effect. `open` làm dep nên mở hộp = tải mới; tăng `attempt`
  // (nút "Thử lại" / sau mutation) để refetch.
  const { data: fetched, loading, error: listError } = useApiResource(
    () =>
      open
        ? listCollaborators(projectId)
        : Promise.resolve([]),
    [open, attempt, projectId],
    "Không tải được danh sách cộng tác viên.",
  );
  const items = fetched ?? [];

  async function handleInvite() {
    const trimmed = identifier.trim();
    if (!trimmed) {
      setInviteError("Nhập username hoặc email của người bạn muốn mời.");
      return;
    }
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const created = await inviteCollaborator(projectId, { identifier: trimmed, permissionLevel: permission });
      setIdentifier("");
      setInviteSuccess(
        `Đã mời ${created.user.displayName ?? created.user.username ?? "cộng tác viên"}. Họ cần chấp nhận lời mời mới có quyền truy cập.`,
      );
      setAttempt((n) => n + 1);
    } catch (err: unknown) {
      setInviteError(apiErrorMessage(err, "Không mời được cộng tác viên."));
    } finally {
      setInviting(false);
    }
  }

  async function handlePermissionChange(item: CollaboratorItem, level: CollaboratorPermissionLevel) {
    if (level === item.permissionLevel) return;
    setPermissionBusy(item.id);
    setPermissionError(null);
    try {
      await patchCollaboratorPermission(projectId, item.id, level);
      setAttempt((n) => n + 1);
    } catch (err: unknown) {
      // 3.E2: giữ quyền cũ — không refetch nên dropdown tự hoàn về giá trị cũ.
      setPermissionError(apiErrorMessage(err, "Không đổi được quyền. Giá trị cũ được giữ lại."));
    } finally {
      setPermissionBusy(null);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeCollaborator(projectId, removeTarget.id);
      setRemoveTarget(null);
      setAttempt((n) => n + 1);
    } catch (err: unknown) {
      setRemoveError(apiErrorMessage(err, "Không gỡ được cộng tác viên."));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Cộng tác viên"
        className="max-w-lg p-6"
      >
        <p className="-mt-2 mb-4 text-[13px] text-muted">
          Dự án &ldquo;{projectName}&rdquo;{isOwner ? "" : " — bạn đang xem với quyền cộng tác viên"}
        </p>

        {listError ? (
          <div role="alert" className="rounded-card border border-danger/30 bg-danger-muted p-3 text-[13px] text-danger">
            <p>{listError}</p>
            <Button
              type="button"
              variant="secondary"
              className="mt-2 h-7 text-xs"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Thử lại
            </Button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" /> Đang tải danh sách…
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-card bg-surface-subtle px-3 py-2.5 text-[13px] text-muted">
            Chưa có cộng tác viên nào trong dự án.
          </p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
            {items.map((item) => {
              const busy = permissionBusy === item.id;
              return (
                <li key={item.id} className="flex items-center gap-2.5 rounded-card border border-border bg-surface px-3 py-2.5">
                  <Avatar id={item.userId} label={collaboratorDisplayName(item)} imageUrl={item.user.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold">{collaboratorDisplayName(item)}</span>
                      {item.status === "pending" && <Badge variant="warning">Đang chờ</Badge>}
                    </div>
                    <p className="text-xs text-muted">Mời bởi {item.user.username ?? "người dùng"} · {formatRelativeTime(item.createdAt)}</p>
                  </div>

                  {isOwner ? (
                    <CollaboratorPermissionSelect
                      name={`collab-permission-${item.id}`}
                      value={item.permissionLevel}
                      busy={busy}
                      disabled={busy}
                      onChange={(level) => handlePermissionChange(item, level)}
                    />
                  ) : (
                    <span className="text-xs text-muted">
                      {PERMISSION_LABELS[item.permissionLevel]}
                    </span>
                  )}

                  {isOwner && (
                    <button
                      type="button"
                      aria-label={`Gỡ ${collaboratorDisplayName(item)} khỏi dự án`}
                      title={item.status === "pending" ? "Rút lời mời" : "Gỡ quyền cộng tác viên"}
                      className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-danger-muted hover:text-danger"
                      onClick={() => {
                        setRemoveError(null);
                        setRemoveTarget(item);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {permissionError && (
          <p role="alert" className="mt-3 rounded-card bg-danger-muted px-3 py-2 text-[13px] text-danger">
            {permissionError}
          </p>
        )}

        {/* UC-60: mời — chỉ chủ dự án thấy form (non-owner: dropdown chỉ đọc). */}
        {isOwner && !listError && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2.5 text-xs font-semibold text-muted">Mời cộng tác viên mới</p>
            <DialogError message={inviteError} />
            {inviteSuccess && (
              <p className="mb-3 rounded-card bg-success-muted px-3 py-2 text-[13px] text-success-foreground">{inviteSuccess}</p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                name="collaborator-identifier"
                autoComplete="off"
                placeholder="username hoặc email"
                className={`${INPUT_CLASS} flex-1`}
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (inviteError) setInviteError(null);
                }}
              />
              <CollaboratorPermissionSelect
                name="collaborator-permission"
                value={permission}
                onChange={(level) => setPermission(level)}
                className="sm:w-32"
              />
              <Button
                type="button"
                onClick={handleInvite}
                disabled={inviting}
                className="gap-1.5"
              >
                {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus size={14} />}
                {inviting ? "Đang mời…" : "Mời"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Người được mời cần chấp nhận lời mời (trong trang{" "}
              <a href="/invitations" className="font-semibold text-accent hover:underline">
                Lời mời
              </a>
              ) mới có quyền truy cập dự án.
            </p>
          </div>
        )}
        {!isOwner && (
          <p className="mt-4 text-xs text-muted">Bạn đang xem với quyền của cộng tác viên — danh sách chỉ đọc.</p>
        )}
      </Dialog>

      {/* UC-62: xác nhận gỡ. */}
      <ConfirmDialog
        open={removeTarget !== null}
        title={removeTarget?.status === "pending" ? "Rút lời mời" : "Gỡ cộng tác viên"}
        message={
          removeTarget ? (
            removeTarget.status === "pending" ? (
              <span>
                Rút lời mời đang chờ của <strong>{collaboratorDisplayName(removeTarget)}</strong>? Người này chưa
                chấp nhận nên không mất quyền truy cập nào.
              </span>
            ) : (
              <span>
                Gỡ <strong>{collaboratorDisplayName(removeTarget)}</strong> khỏi dự án? Họ sẽ mất quyền truy cập
                ngay. Đóng góp của họ (commit, bình luận) <strong>vẫn được giữ</strong> trong lịch sử dự án.
              </span>
            )
          ) : null
        }
        confirmLabel="Xác nhận"
        cancelLabel="Huỷ"
        danger={removeTarget?.status !== "pending"}
        loading={removing}
        error={removeError}
        onConfirm={confirmRemove}
        onCancel={() => {
          setRemoveTarget(null);
          setRemoveError(null);
        }}
      />
    </>
  );
}

/** Nút kích hoạt sẵn (mang state mở/đóng), gắn 1 điểm vào toolbar editor. */
export function CollaboratorsButton({
  projectId,
  projectName,
  isOwner,
}: {
  projectId: string;
  projectName: string;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} className="gap-1.5" aria-haspopup="dialog">
        <Users size={15} />
        Cộng tác viên
      </Button>
      <CollaboratorsDialog
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
        projectName={projectName}
        isOwner={isOwner}
      />
    </>
  );
}
