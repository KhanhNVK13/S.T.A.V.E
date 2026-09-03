"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "../../../components/require-auth";
import { apiFetch, ApiError } from "../../../lib/api-client";
import type { SessionInfo } from "../../../lib/types";

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

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!sessions) return <p className="text-sm opacity-60">Đang tải…</p>;

  return (
    <ul className="flex flex-col gap-3">
      {sessions.map((session) => (
        <li
          key={session.id}
          className="flex items-center justify-between rounded border border-black/10 px-4 py-3 dark:border-white/10"
        >
          <div>
            <p className="text-sm font-medium">
              {session.device_label ?? "Thiết bị không xác định"}{" "}
              {session.isCurrent && (
                <span className="ml-2 rounded bg-green-600/10 px-2 py-0.5 text-xs text-green-700">
                  Thiết bị này
                </span>
              )}
            </p>
            <p className="text-xs opacity-60">
              IP: {session.ip_address ?? "?"} · Hoạt động gần nhất:{" "}
              {new Date(session.last_active_at).toLocaleString("vi-VN")}
            </p>
          </div>
          {!session.isCurrent && (
            <button
              onClick={() => void handleRevoke(session.id)}
              disabled={revokingId === session.id}
              className="rounded border border-red-600 px-3 py-1 text-sm text-red-600 disabled:opacity-50"
            >
              {revokingId === session.id ? "Đang xoá…" : "Đăng xuất"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function SessionsPage() {
  return (
    <RequireAuth>
      <div className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-2xl font-bold">Thiết bị đang đăng nhập</h1>
        <p className="mt-2 text-sm opacity-60">
          Danh sách phiên đăng nhập của bạn. Có thể đăng xuất từng thiết bị cụ
          thể.
        </p>
        <div className="mt-6">
          <SessionsList />
        </div>
      </div>
    </RequireAuth>
  );
}
