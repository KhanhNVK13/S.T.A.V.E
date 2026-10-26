"use client";

import { useState } from "react";
import Link from "next/link";
import { Inbox, Loader2, X } from "lucide-react";
import type { CollaborationInvitation } from "@stave/shared-types";
import {
  acceptInvitation,
  declineInvitation,
  listMyInvitations,
} from "../../lib/api-collab";
import { apiErrorMessage } from "../../lib/error-message";
import { formatRelativeTime } from "../../lib/format-date";
import { useApiResource } from "../../lib/use-api-resource";
import { RequireAuth } from "../../components/require-auth";
import { PERMISSION_LABELS } from "../../components/collaboration/collaborator-controls";
import { PageHeader } from "../../components/ui/page-header";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { EmptyState } from "../../components/ui/empty-state";
import { Toast } from "../../components/ui/toast";

function InvitationsContent() {
  const [attempt, setAttempt] = useState(0);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<CollaborationInvitation | null>(null);

  // useApiResource (khuyến nghị của repo) tải danh sách; tăng `attempt` sau
  // accept/decline để đồng bộ lại — tránh setState đồng bộ trong effect.
  const { data, loading, error: listError } = useApiResource(
    () => listMyInvitations(),
    [attempt],
    "Không tải được danh sách lời mời.",
  );
  const invitations = data ?? [];

  async function handleAccept(invitation: CollaborationInvitation) {
    setActingId(invitation.id);
    setActionError(null);
    try {
      await acceptInvitation(invitation.id);
      setToastMessage(
        invitation.projectName
          ? `Bạn đã là cộng tác viên của dự án “${invitation.projectName}”.`
          : "Bạn đã chấp nhận lời mời.",
      );
      setAttempt((n) => n + 1);
    } catch (err: unknown) {
      setActionError(apiErrorMessage(err, "Không chấp nhận được lời mời."));
    } finally {
      setActingId(null);
    }
  }

  async function confirmDecline() {
    if (!declineTarget) return;
    setActingId(declineTarget.id);
    setActionError(null);
    try {
      await declineInvitation(declineTarget.id);
      setDeclineTarget(null);
      setToastMessage("Đã từ chối lời mời.");
      setAttempt((n) => n + 1);
    } catch (err: unknown) {
      setActionError(apiErrorMessage(err, "Không từ chối được lời mời."));
    } finally {
      setActingId(null);
    }
  }

  function invitationTitle(invitation: CollaborationInvitation): string {
    return invitation.projectName ?? "Dự án";
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8">
      <PageHeader
        title="Lời mời cộng tác"
        description="Các lời mời tham gia dự án mà bạn chưa xử lý. Chấp nhận để được cấp quyền, hoặc từ chối để xoá lời mời."
      />

      {listError ? (
        <div role="alert" className="rounded-card border border-danger/30 bg-danger-muted p-4 text-sm text-danger">
          <p>{listError}</p>
          <div className="mt-3">
            <Button type="button" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Thử lại
            </Button>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" /> Đang tải lời mời…
        </div>
      ) : invitations.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Chưa có lời mời nào"
          description="Khi ai đó mời bạn cộng tác một dự án, lời mời sẽ hiện ở đây."
          action={
            <Link href="/projects">
              <Button variant="secondary">Về dự án của tôi</Button>
            </Link>
          }
        />
      ) : (
        <>
          {actionError && (
            <p role="alert" className="mb-3 rounded-card bg-danger-muted px-3 py-2 text-[13px] text-danger">
              {actionError}
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {invitations.map((invitation) => {
              const busy = actingId === invitation.id;
              return (
                <li
                  key={invitation.id}
                  className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{invitationTitle(invitation)}</span>
                      <Badge variant={invitation.permissionLevel === "edit" ? "info" : "neutral"}>
                        {PERMISSION_LABELS[invitation.permissionLevel]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[13px] text-muted">
                      {invitation.inviterName ? `Mời bởi ${invitation.inviterName}` : "Mời bởi người dùng"} ·{" "}
                      {formatRelativeTime(invitation.invitedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setDeclineTarget(invitation)}
                      disabled={busy}
                      className="gap-1.5"
                    >
                      <X size={14} /> Từ chối
                    </Button>
                    <Button onClick={() => handleAccept(invitation)} disabled={busy} className="gap-1.5">
                      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Chấp nhận
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[13px] text-muted">
            Sau khi chấp nhận, mở dự án qua{" "}
            <Link href="/projects" className="font-semibold text-accent hover:underline">
              Dự án của tôi
            </Link>{" "}
            hoặc trang tổng quan của dự án.
          </p>
        </>
      )}

      <ConfirmDialog
        open={declineTarget !== null}
        title="Từ chối lời mời"
        message={
          declineTarget ? (
            <span>
              Từ chối lời mời tham gia dự án{" "}
              <strong>{declineTarget.projectName ?? "này"}</strong>? Lời mời sẽ bị xoá và bạn không thể
              chấp nhận lại trừ khi được mời lần nữa.
            </span>
          ) : null
        }
        confirmLabel="Từ chối"
        cancelLabel="Giữ lại"
        danger
        loading={declineTarget !== null && actingId === declineTarget.id}
        onConfirm={confirmDecline}
        onCancel={() => setDeclineTarget(null)}
      />

      {toastMessage && (
        <Toast message={toastMessage} variant="success" onDismiss={() => setToastMessage(null)} />
      )}
    </div>
  );
}

export default function InvitationsPage() {
  return (
    <RequireAuth>
      <InvitationsContent />
    </RequireAuth>
  );
}
