"use client";

import { useEffect, useState } from "react";
import { Search, ShieldAlert } from "lucide-react";
import { RequireAuth } from "../../../components/require-auth";
import { useAuth } from "../../../context/auth-context";
import { apiFetch, ApiError } from "../../../lib/api-client";
import { PageHeader } from "../../../components/ui/page-header";
import { Card } from "../../../components/ui/card";
import { RowList, RowHeader, RowItem } from "../../../components/ui/row-list";
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

/** Người dùng | email | trạng thái | vai trò | thao tác. */
const COLS = "md:grid-cols-[minmax(0,1fr)_200px_112px_92px_auto]";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4">
      <Card className="w-full max-w-sm p-6">
        <p className="text-[13px] font-semibold">{title}</p>
        {action === "remove" && (
          <p className="mt-1 text-xs text-danger">
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
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
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
        <div className="relative min-w-[240px] max-w-[380px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            placeholder="Tìm theo username hoặc email chính xác"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${INPUT_CLASS} h-[34px] w-full pl-8`}
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Lọc theo trạng thái"
          className={`${INPUT_CLASS} h-[34px]`}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <Button type="submit" variant="secondary">
          Tìm
        </Button>
      </form>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-3">
        <RowList>
          <RowHeader cols={COLS}>
            <span>Người dùng</span>
            <span>Email</span>
            <span>Trạng thái</span>
            <span>Vai trò</span>
            <span />
          </RowHeader>

          {result?.users.map((user) => (
            <RowItem key={user.id} cols={COLS}>
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar id={user.id} label={user.displayName || user.username} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">{user.displayName}</p>
                  <p className="truncate font-mono text-[10px] text-muted">@{user.username}</p>
                </div>
              </div>
              <span className="truncate font-mono text-[11px] text-muted">{user.maskedEmail}</span>
              <span>
                <StatusBadge status={user.status} />
              </span>
              <span>
                {user.role === "admin" ? (
                  <Badge variant="info">Admin</Badge>
                ) : (
                  <Badge variant="neutral">User</Badge>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                {user.role !== "admin" && (
                  <>
                    {user.status === "active" && (
                      <Button variant="ghost" onClick={() => setSelected({ user, action: "suspend" })}>
                        Tạm khoá
                      </Button>
                    )}
                    {user.status === "suspended" && (
                      <Button
                        variant="ghost"
                        onClick={() => setSelected({ user, action: "reactivate" })}
                      >
                        Mở khoá
                      </Button>
                    )}
                    <Button variant="danger" onClick={() => setSelected({ user, action: "remove" })}>
                      Xoá
                    </Button>
                  </>
                )}
              </div>
            </RowItem>
          ))}

          {result && result.users.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-muted">Không có kết quả.</p>
          )}
        </RowList>
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
      <div className="mx-auto max-w-page px-5 py-8">
        <PageHeader
          breadcrumbs={[{ label: "Quản trị" }]}
          title="Quản lý người dùng"
          description="Tìm, tạm khoá hoặc xoá tài khoản người dùng trên nền tảng."
        />
        {loading ? (
          <p className="text-sm text-muted">Đang tải…</p>
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
