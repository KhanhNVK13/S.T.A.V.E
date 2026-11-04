"use client";

import { useEffect, useState } from "react";
import { Laptop } from "lucide-react";
import { RequireAuth } from "../../../components/require-auth";
import { apiFetch } from "../../../lib/api-client";
import type { SessionInfo } from "../../../lib/types";
import { PageHeader } from "../../../components/ui/page-header";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { apiErrorMessage } from "../../../lib/error-message";
import { appLocale } from "../../../lib/format-date";
import { useI18n } from "../../../context/i18n-context";
import { tNow } from "../../../lib/i18n";

function SessionsList() {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

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

  if (!sessions && loadError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">
        {loadError}
        <Button variant="secondary" onClick={() => void load()}>
          {t("ui.retry")}
        </Button>
      </div>
    );
  }
  if (!sessions) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-card border border-border bg-surface-subtle" />
        ))}
      </div>
    );
  }

  return (
    <>
      {actionError && (
        <p role="alert" className="mb-3 rounded-card bg-danger-muted px-3 py-2 text-sm text-danger">
          {actionError}
        </p>
      )}
      {sessions.length === 1 && (
        <p className="mb-3 text-sm text-muted">
          {t("ses.only")}
        </p>
      )}
      <Card className="divide-y divide-border">
        {sessions.map((session) => (
          <div key={session.id} className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle">
                <Laptop className="h-3.5 w-3.5 text-muted" />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[13px] font-semibold">
                  {session.device_label ?? t("ses.unknown")}
                  {session.isCurrent && <Badge variant="success">{t("ses.current")}</Badge>}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  {t("ses.meta", { ip: session.ip_address ?? "?", when: new Date(session.last_active_at).toLocaleString(appLocale()) })}
                </p>
              </div>
            </div>
            {session.isCurrent ? (
              <p className="max-w-[220px] text-xs text-muted">
                {t("ses.signOutHint")}
              </p>
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
        ))}
      </Card>
    </>
  );
}

export default function SessionsPage() {
  const { t } = useI18n();
  return (
    <RequireAuth>
      <div className="mx-auto max-w-3xl px-5 py-8">
        <PageHeader
          title={t("ses.title")}
          description={t("ses.description")}
          breadcrumbs={[{ label: t("profile.tabProfile"), href: "/profile" }, { label: t("ses.crumbDevices") }]}
        />
        <SessionsList />
      </div>
    </RequireAuth>
  );
}
