"use client";

import { useEffect, useState } from "react";
import { Laptop, MonitorOff } from "lucide-react";
import { RequireAuth } from "../../../components/require-auth";
import { apiFetch } from "../../../lib/api-client";
import type { SessionInfo } from "../../../lib/types";
import { PageHeader } from "../../../components/ui/page-header";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { EmptyState } from "../../../components/ui/empty-state";
import { RowHeader, RowItem, RowList, RowTime } from "../../../components/ui/row-list";
import { apiErrorMessage } from "../../../lib/error-message";
import { appLocale } from "../../../lib/format-date";
import { useI18n } from "../../../context/i18n-context";
import { tNow } from "../../../lib/i18n";

const COLS = "md:grid-cols-[minmax(0,1fr)_150px_190px_auto]";

function SessionsContent() {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [othersError, setOthersError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await apiFetch<SessionInfo[]>("/auth/sessions");
      setSessions(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(apiErrorMessage(err, tNow("ses.loadFail")));
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off fetch on mount
    void load();
  }, []);

  async function handleRevoke(id: string) {
    setRevokingId(id);
    setActionError(null);
    try {
      await apiFetch(`/auth/sessions/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setActionError(apiErrorMessage(err, tNow("ses.revokeFail")));
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeOthers() {
    setRevokingOthers(true);
    setOthersError(null);
    try {
      await apiFetch("/auth/sessions/revoke-others", { method: "POST" });
      setConfirmOthers(false);
      await load();
    } catch (err) {
      setOthersError(apiErrorMessage(err, tNow("accountPages.revokeOthersFail")));
    } finally {
      setRevokingOthers(false);
    }
  }

  const hasOthers = sessions?.some((session) => !session.isCurrent) ?? false;

  let body: React.ReactNode;
  if (!sessions && loadError) {
    body = (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-danger/30 bg-danger-muted p-4 text-sm text-danger">
        {loadError}
        <Button variant="secondary" onClick={() => void load()}>
          {t("ui.retry")}
        </Button>
      </div>
    );
  } else if (!sessions) {
    body = (
      <div className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-card border border-border bg-surface-subtle" />
        ))}
      </div>
    );
  } else if (sessions.length === 0) {
    body = <EmptyState icon={MonitorOff} title={t("accountPages.sesEmptyTitle")} description={t("accountPages.sesEmptyBody")} />;
  } else {
    body = (
      <>
        {actionError && (
          <p role="alert" className="mb-3 rounded-card bg-danger-muted px-3 py-2 text-sm text-danger">
            {actionError}
          </p>
        )}
        {sessions.length === 1 && <p className="mb-3 text-sm text-muted">{t("ses.only")}</p>}
        <RowList cols={COLS}>
          <RowHeader>
            <span>{t("accountPages.sesColDevice")}</span>
            <span>{t("accountPages.sesColIp")}</span>
            <span>{t("accountPages.sesColActive")}</span>
            <span />
          </RowHeader>
          {sessions.map((session) => (
            <RowItem key={session.id}>
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-subtle">
                  <Laptop aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-[13px] font-semibold">
                    {session.device_label ?? t("ses.unknown")}
                  </span>
                  {session.isCurrent && <Badge variant="success">{t("ses.current")}</Badge>}
                </div>
              </div>
              <span className="truncate font-mono text-xs text-muted">{session.ip_address ?? "?"}</span>
              <RowTime>{new Date(session.last_active_at).toLocaleString(appLocale())}</RowTime>
              <div className="md:flex md:justify-end">
                {session.isCurrent ? (
                  <p className="max-w-[220px] text-xs text-muted">{t("ses.signOutHint")}</p>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => void handleRevoke(session.id)}
                    disabled={revokingId === session.id}
                    className="shrink-0"
                  >
                    {revokingId === session.id ? t("ses.removing") : t("ses.signOut")}
                  </Button>
                )}
              </div>
            </RowItem>
          ))}
        </RowList>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <PageHeader
        title={t("ses.title")}
        description={t("ses.description")}
        breadcrumbs={[{ label: t("profile.tabProfile"), href: "/profile" }, { label: t("ses.crumbDevices") }]}
        action={
          hasOthers ? (
            <Button variant="danger" onClick={() => setConfirmOthers(true)}>
              {t("accountPages.revokeOthers")}
            </Button>
          ) : undefined
        }
      />
      {body}
      <ConfirmDialog
        open={confirmOthers}
        title={t("accountPages.revokeOthersTitle")}
        message={t("accountPages.revokeOthersBody")}
        confirmLabel={t("accountPages.revokeOthers")}
        danger
        loading={revokingOthers}
        error={othersError}
        onConfirm={() => void handleRevokeOthers()}
        onCancel={() => {
          setConfirmOthers(false);
          setOthersError(null);
        }}
      />
    </div>
  );
}

export default function SessionsPage() {
  return (
    <RequireAuth>
      <SessionsContent />
    </RequireAuth>
  );
}
