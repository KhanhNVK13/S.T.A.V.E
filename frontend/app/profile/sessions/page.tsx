"use client";

import { useEffect, useState } from "react";
import { Laptop } from "lucide-react";
import { RequireAuth } from "../../../components/require-auth";
import { apiFetch, ApiError } from "../../../lib/api-client";
import type { SessionInfo } from "../../../lib/types";
import { PageHeader } from "../../../components/ui/page-header";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";

function SessionsList() {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function load() {
    try {
      const data = await apiFetch<SessionInfo[]>("/auth/sessions");
      setSessions(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off fetch on mount
    void load();
  }, []);

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      await apiFetch(`/auth/sessions/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setRevokingId(null);
    }
  }

  if (error) return <p className="text-sm text-danger-600">{error}</p>;
  if (!sessions) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-card border border-slate-200 bg-slate-50" />
        ))}
      </div>
    );
  }

  return (
    <Card className="divide-y divide-slate-100">
      {sessions.map((session) => (
        <div key={session.id} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100">
              <Laptop className="h-4 w-4 text-slate-500" />
            </span>
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                {session.device_label ?? "Thiết bị không xác định"}
                {session.isCurrent && <Badge variant="success">Thiết bị này</Badge>}
              </p>
              <p className="mt-0.5 font-mono text-xs text-slate-500">
                IP: {session.ip_address ?? "?"} · Hoạt động gần nhất:{" "}
                {new Date(session.last_active_at).toLocaleString("vi-VN")}
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
  );
}

export default function SessionsPage() {
  return (
    <RequireAuth>
      <div className="mx-auto max-w-2xl px-4 py-10">
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
