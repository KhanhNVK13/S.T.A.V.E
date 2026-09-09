"use client";

import { useEffect, useState } from "react";
import { Search, ShieldAlert } from "lucide-react";
import { RequireAuth } from "../../../components/require-auth";
import { useAuth } from "../../../context/auth-context";
import { apiFetch, ApiError } from "../../../lib/api-client";
import { PageHeader } from "../../../components/ui/page-header";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Avatar } from "../../../components/ui/avatar";
import { INPUT_CLASS } from "../../../components/ui/form";
import { EmptyState } from "../../../components/ui/empty-state";

interface AdminUserRow {
  id: string;
  displayName: string;
  username: string;
  maskedEmail: string;
  status: "active" | "suspended" | "removed";
  role: "user" | "admin";
  createdAt: string;
}

interface ListUsersResponse {
  total: number;
  page: number;
  limit: number;
  users: AdminUserRow[];
}

type ActionType = "suspend" | "reactivate" | "remove";

function StatusBadge({ status }: { status: AdminUserRow["status"] }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "suspended") return <Badge variant="warning">Suspended</Badge>;
  return <Badge variant="danger">Removed</Badge>;
}

function ActionPanel({
  user,
  action,
  onDone,
  onCancel,
}: {
  user: AdminUserRow;
  action: ActionType;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmUsername, setConfirmUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      if (action === "suspend") {
        await apiFetch(`/admin/users/${user.id}/suspend`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
      } else if (action === "reactivate") {
        await apiFetch(`/admin/users/${user.id}/reactivate`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
      } else {
        await apiFetch(`/admin/users/${user.id}`, {
          method: "DELETE",
          body: JSON.stringify({ reason, confirmUsername }),
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  }

  const title =
    action === "suspend"
      ? `Đình chỉ @${user.username}`
      : action === "reactivate"
        ? `Kích hoạt lại @${user.username}`
        : `Xoá vĩnh viễn @${user.username}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <Card className="w-full max-w-sm p-6">
        <p className="font-semibold text-slate-900">{title}</p>
        {action === "remove" && (
          <p className="mt-1 text-sm text-danger-600">
            Không thể hoàn tác. Gõ lại username <strong>{user.username}</strong> để xác nhận.
          </p>
        )}
        <textarea
          placeholder="Lý do"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className={`${INPUT_CLASS} mt-3 w-full`}
        />
        {action === "remove" && (
          <input
            placeholder="Gõ lại username để xác nhận"
            value={confirmUsername}
            onChange={(e) => setConfirmUsername(e.target.value)}
            className={`${INPUT_CLASS} mt-3 w-full`}
          />
        )}
        {error && <p className="mt-2 text-sm text-danger-600">{error}</p>}
        <div className="mt-4 flex gap-2">
          <Button
            variant={action === "remove" ? "danger" : "primary"}
            onClick={() => void handleConfirm()}
            disabled={
              submitting ||
              !reason ||
              (action === "remove" && confirmUsername !== user.username)
            }
          >
            {submitting ? "Đang xử lý…" : "Xác nhận"}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Huỷ
          </Button>
        </div>
      </Card>
    </div>
  );
}

function AdminUsersTable() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<ListUsersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    user: AdminUserRow;
    action: ActionType;
  } | null>(null);

  async function load() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    try {
      const data = await apiFetch<ListUsersResponse>(
        `/admin/users?${params.toString()}`,
      );
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when status filter changes
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        className="flex flex-wrap gap-2"
      >
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Tìm theo username hoặc email chính xác"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${INPUT_CLASS} w-full pl-9`}
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <Button type="submit" variant="secondary">
          Tìm
        </Button>
      </form>

      {error && <p className="mt-3 text-sm text-danger-600">{error}</p>}

      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Người dùng</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 font-medium">Vai trò</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {result?.users.map((user) => (
              <tr key={user.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar id={user.id} label={user.displayName || user.username} size="sm" />
                    <div>
                      <p className="font-medium text-slate-900">{user.displayName}</p>
                      <p className="text-xs text-slate-500">@{user.username}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{user.maskedEmail}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={user.status} />
                </td>
                <td className="px-4 py-3">
                  {user.role === "admin" ? (
                    <Badge variant="info">Admin</Badge>
                  ) : (
                    <Badge variant="neutral">User</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {user.role !== "admin" && (
                    <div className="flex gap-3">
                      {user.status === "active" && (
                        <button
                          onClick={() => setSelected({ user, action: "suspend" })}
                          className="text-xs font-medium text-warning-600 hover:underline"
                        >
                          Suspend
                        </button>
                      )}
                      {user.status === "suspended" && (
                        <button
                          onClick={() => setSelected({ user, action: "reactivate" })}
                          className="text-xs font-medium text-success-600 hover:underline"
                        >
                          Reactivate
                        </button>
                      )}
                      <button
                        onClick={() => setSelected({ user, action: "remove" })}
                        className="text-xs font-medium text-danger-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result && result.users.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Không có kết quả.</p>
        )}
      </Card>

      {selected && (
        <ActionPanel
          user={selected.user}
          action={selected.action}
          onCancel={() => setSelected(null)}
          onDone={() => {
            setSelected(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  const { profile, loading } = useAuth();

  return (
    <RequireAuth>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <PageHeader title="Quản lý người dùng" />
        {loading ? (
          <p className="text-sm text-slate-500">Đang tải…</p>
        ) : profile?.role !== "admin" ? (
          <EmptyState
            icon={ShieldAlert}
            title="Không có quyền truy cập"
            description="Bạn không có quyền truy cập trang này."
          />
        ) : (
          <AdminUsersTable />
        )}
      </div>
    </RequireAuth>
  );
}
