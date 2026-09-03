"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "../../../components/require-auth";
import { useAuth } from "../../../context/auth-context";
import { apiFetch, ApiError } from "../../../lib/api-client";

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
    <div className="mt-3 rounded border border-black/10 p-4 dark:border-white/10">
      <p className="font-medium">{title}</p>
      {action === "remove" && (
        <p className="mt-1 text-sm text-red-600">
          Không thể hoàn tác. Gõ lại username <strong>{user.username}</strong>{" "}
          để xác nhận.
        </p>
      )}
      <textarea
        placeholder="Lý do"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mt-3 w-full rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20"
      />
      {action === "remove" && (
        <input
          placeholder="Gõ lại username để xác nhận"
          value={confirmUsername}
          onChange={(e) => setConfirmUsername(e.target.value)}
          className="mt-3 w-full rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20"
        />
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => void handleConfirm()}
          disabled={
            submitting ||
            !reason ||
            (action === "remove" && confirmUsername !== user.username)
          }
          className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {submitting ? "Đang xử lý…" : "Xác nhận"}
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
        >
          Huỷ
        </button>
      </div>
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
        className="flex gap-2"
      >
        <input
          placeholder="Tìm theo username hoặc email chính xác"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button
          type="submit"
          className="rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20"
        >
          Tìm
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <th className="py-2 pr-4">Username</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Trạng thái</th>
              <th className="py-2 pr-4">Vai trò</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {result?.users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-black/5 dark:border-white/5"
              >
                <td className="py-2 pr-4">{user.username}</td>
                <td className="py-2 pr-4">{user.maskedEmail}</td>
                <td className="py-2 pr-4">{user.status}</td>
                <td className="py-2 pr-4">{user.role}</td>
                <td className="py-2 pr-4">
                  {user.role !== "admin" && (
                    <div className="flex gap-2">
                      {user.status === "active" && (
                        <button
                          onClick={() =>
                            setSelected({ user, action: "suspend" })
                          }
                          className="text-xs underline"
                        >
                          Suspend
                        </button>
                      )}
                      {user.status === "suspended" && (
                        <button
                          onClick={() =>
                            setSelected({ user, action: "reactivate" })
                          }
                          className="text-xs underline"
                        >
                          Reactivate
                        </button>
                      )}
                      <button
                        onClick={() => setSelected({ user, action: "remove" })}
                        className="text-xs text-red-600 underline"
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
          <p className="mt-4 text-sm opacity-60">Không có kết quả.</p>
        )}
      </div>

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
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-bold">Quản lý người dùng</h1>
        {loading ? (
          <p className="mt-6 text-sm opacity-60">Đang tải…</p>
        ) : profile?.role !== "admin" ? (
          <p className="mt-6 text-sm text-red-600">
            Bạn không có quyền truy cập trang này.
          </p>
        ) : (
          <div className="mt-6">
            <AdminUsersTable />
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
