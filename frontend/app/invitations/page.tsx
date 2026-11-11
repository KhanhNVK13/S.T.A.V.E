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
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { formatRelativeTime } from "../../lib/format-date";
import { useApiResource } from "../../lib/use-api-resource";
import { RequireAuth } from "../../components/require-auth";
import { PERMISSION_KEYS } from "../../components/collaboration/collaborator-controls";
import { PageHeader } from "../../components/ui/page-header";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { EmptyState } from "../../components/ui/empty-state";
import { RowHeader, RowItem, RowList, RowTime } from "../../components/ui/row-list";
import { Toast } from "../../components/ui/toast";
import { useI18n } from "../../context/i18n-context";

const COLS = "md:grid-cols-[minmax(0,1fr)_110px_110px_auto]";

function InvitationsContent() {
  const { t, tx } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ErrorSource | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<CollaborationInvitation | null>(null);

  // useApiResource (khuyến nghị của repo) tải danh sách; tăng `attempt` sau
  // accept/decline để đồng bộ lại — tránh setState đồng bộ trong effect.
  const { data, loading, error: listError } = useApiResource(
    () => listMyInvitations(),
    [attempt],
    t("inv.loadFail"),
  );
  const invitations = data ?? [];

  async function handleAccept(invitation: CollaborationInvitation) {
    setActingId(invitation.id);
    setActionError(null);
    try {
      await acceptInvitation(invitation.id);
      setToastMessage(
        invitation.projectName
          ? t("inv.joined", { name: invitation.projectName })
          : t("inv.accepted"),
      );
      setAttempt((n) => n + 1);
    } catch (err: unknown) {
      setActionError(errorSource(err, "inv.acceptFail"));
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
      setToastMessage(t("inv.declined"));
      setAttempt((n) => n + 1);
    } catch (err: unknown) {
      setActionError(errorSource(err, "inv.declineFail"));
    } finally {
      setActingId(null);
    }
  }

  function invitationTitle(invitation: CollaborationInvitation): string {
    return invitation.projectName ?? t("inv.project");
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8">
      <PageHeader
        title={t("inv.title")}
        description={t("inv.description")}
      />

      {listError ? (
        <div role="alert" className="rounded-card border border-danger/30 bg-danger-muted p-4 text-sm text-danger">
          <p>{listError}</p>
          <div className="mt-3">
            <Button type="button" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              {t("ui.retry")}
            </Button>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent" /> {t("inv.loading")}
        </div>
      ) : invitations.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t("inv.emptyTitle")}
          description={t("inv.emptyBody")}
          action={
            <Link href="/projects">
              <Button variant="secondary">{t("inv.toMine")}</Button>
            </Link>
          }
        />
      ) : (
        <>
          {actionError && (
            <p role="alert" className="mb-3 rounded-card bg-danger-muted px-3 py-2 text-[13px] text-danger">
              {renderError(actionError)}
            </p>
          )}
          <RowList cols={COLS}>
            <RowHeader>
              <span>{t("accountPages.invColProject")}</span>
              <span>{t("accountPages.invColAccess")}</span>
              <span>{t("accountPages.invColSent")}</span>
              <span />
            </RowHeader>
            {invitations.map((invitation) => {
              const busy = actingId === invitation.id;
              return (
                <RowItem key={invitation.id}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-semibold">{invitationTitle(invitation)}</span>
                    <span className="truncate text-xs text-muted">
                      {invitation.inviterName
                        ? t("inv.invitedBy", { name: invitation.inviterName })
                        : t("inv.invitedByUser")}
                    </span>
                  </div>
                  <span>
                    <Badge variant={invitation.permissionLevel === "edit" ? "info" : "neutral"}>
                      {t(PERMISSION_KEYS[invitation.permissionLevel])}
                    </Badge>
                  </span>
                  <RowTime>{formatRelativeTime(invitation.invitedAt)}</RowTime>
                  <div className="flex shrink-0 items-center gap-2 md:justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => setDeclineTarget(invitation)}
                      disabled={busy}
                      className="gap-1.5"
                    >
                      <X aria-hidden="true" size={14} /> {t("inv.decline")}
                    </Button>
                    <Button onClick={() => handleAccept(invitation)} disabled={busy} className="gap-1.5">
                      {busy && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
                      {t("inv.accept")}
                    </Button>
                  </div>
                </RowItem>
              );
            })}
          </RowList>
          <p className="mt-4 text-[13px] text-muted">
            {tx("inv.after", { link: <Link href="/projects" className="font-semibold text-accent hover:underline">{t("nav.projects")}</Link> })}
          </p>
        </>
      )}

      <ConfirmDialog
        open={declineTarget !== null}
        title={t("inv.declineTitle")}
        message={
          declineTarget ? (
            <span>
              {tx("inv.declineBody", { name: <strong>{declineTarget.projectName ?? t("inv.this")}</strong> })}
            </span>
          ) : null
        }
        confirmLabel={t("inv.decline")}
        cancelLabel={t("inv.keep")}
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
