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
import { APP_LOCALE } from "../../../lib/format-date";

function SessionsList() {
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
      setLoadError(apiErrorMessage(err, "Không tải được danh sách thiết bị."));
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
      setActionError(apiErrorMessage(err, "Không thu hồi được thiết bị."));
    } finally {
      setRevokingId(null);
    }
  }

  if (!sessions && loadError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">
        {loadError}
        <Button variant="secondary" onClick={() => void load()}>
          Thử lại
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
      <Card className="divide-y divide-border">
        {sessions.map((session) => (
          <div key={session.id} className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle">
                <Laptop className="h-3.5 w-3.5 text-muted" />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[13px] font-semibold">
                  {session.device_label ?? "Thiết bị không xác định"}
                  {session.isCurrent && <Badge variant="success">Thiết bị này</Badge>}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  IP: {session.ip_address ?? "?"} · Hoạt động gần nhất:{" "}
                  {new Date(session.last_active_at).toLocaleString(APP_LOCALE)}
                </p>
              </div>
            </div>
            {!session.isCurrent && (
              <Button
                variant="secondary"
                onClick={() => void handleRevoke(session.id)}
                disabled={revokingId === session.id}
                className="shrink-0"
              >
                {revokingId === session.id ? "Đang xoá…" : "Đăng xuất"}
              </Button>
            )}
          </div>
        ))}
      </Card>
    </>
  );
}

export default function SessionsPage() {
  return (
    <RequireAuth>
      <div className="mx-auto max-w-3xl px-5 py-8">
        <PageHeader
          title="Thiết bị đang đăng nhập"
          description="Danh sách phiên đăng nhập của bạn. Có thể đăng xuất từng thiết bị cụ thể."
          breadcrumbs={[{ label: "Hồ sơ", href: "/profile" }, { label: "Thiết bị" }]}
        />
        <SessionsList />
      </div>
    </RequireAuth>
  );
}
