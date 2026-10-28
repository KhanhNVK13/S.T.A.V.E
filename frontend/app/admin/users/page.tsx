"use client";

import { useEffect, useState } from "react";
import { Search, ShieldAlert } from "lucide-react";
import { RequireAuth } from "../../../components/require-auth";
import { useAuth } from "../../../context/auth-context";
import { apiFetch } from "../../../lib/api-client";
import { PageHeader } from "../../../components/ui/page-header";
import { RowList, RowHeader, RowItem } from "../../../components/ui/row-list";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Avatar } from "../../../components/ui/avatar";
import { FieldError, INPUT_CLASS } from "../../../components/ui/form";
import { EmptyState } from "../../../components/ui/empty-state";
import { Dialog, DialogActions, DialogError } from "../../../components/ui/dialog";
import { apiErrorMessage } from "../../../lib/error-message";
import { Toast } from "../../../components/ui/toast";
import { APP_LOCALE } from "../../../lib/format-date";

interface AdminUserRow {
  id: string;
  displayName: string;
  username: string;
  maskedEmail: string;
  status: "active" | "suspended" | "removed";
  role: "user" | "admin";
  createdAt: string;
  projectCount: number;
  suspension: { reason: string; suspendedAt: string } | null;
}

interface ListUsersResponse {
  total: number;
  page: number;
  limit: number;
  users: AdminUserRow[];
}

type ActionType = "suspend" | "reactivate" | "remove";

/** Người dùng | email | trạng thái | vai trò | thao tác. */
const COLS = "md:grid-cols-[minmax(0,1fr)_200px_80px_112px_92px_auto]";

const PAGE_LIMIT = 20;

const SUSPEND_CATEGORIES = [
  "Vi phạm nội dung",
  "Spam hoặc quảng cáo",
  "Lạm dụng nền tảng",
  "Gian lận thanh toán",
  "Khác",
] as const;

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
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<string>("");
  const [reason, setReason] = useState("");
  const [confirmUsername, setConfirmUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    const detail = reason.trim();
    if (action === "suspend" && !category) {
      setReasonError("Vui lòng chọn một danh mục vi phạm.");
      return;
    }
    if ((action !== "suspend" || category === "Khác") && !detail) {
      setReasonError("Vui lòng nhập lý do.");
      return;
    }
    const finalReason =
      action === "suspend" ? (detail ? `${category}: ${detail}` : category) : detail;
    setReasonError(null);
    setSubmitting(true);
    try {
      if (action === "suspend") {
        await apiFetch(`/admin/users/${user.id}/suspend`, {
          method: "POST",
          body: JSON.stringify({ reason: finalReason }),
        });
      } else if (action === "reactivate") {
        await apiFetch(`/admin/users/${user.id}/reactivate`, {
          method: "POST",
          body: JSON.stringify({ reason: finalReason }),
        });
      } else {
        await apiFetch(`/admin/users/${user.id}`, {
          method: "DELETE",
          body: JSON.stringify({ reason: finalReason, confirmUsername }),
        });
      }
      onDone(
        action === "suspend"
          ? `Đã tạm khoá @${user.username}. Hành động đã được ghi vào nhật ký quản trị.`
          : action === "reactivate"
            ? `Đã mở khoá @${user.username}. Hành động đã được ghi vào nhật ký quản trị.`
            : `Đã xoá @${user.username}. Hành động đã được ghi vào nhật ký quản trị.`,
      );
    } catch (err) {
      setError(apiErrorMessage(err, "Không thực hiện được thao tác."));
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
    <Dialog
      title={title}
      titleClassName="text-foreground text-base"
      onClose={onCancel}
      closeDisabled={submitting}
      role={action === "remove" ? "alertdialog" : "dialog"}
      className="max-w-sm p-6"
    >
      {action === "remove" && (
        <div className="-mt-2 mb-3 space-y-2 text-xs text-muted">
          <p className="text-danger">
            Không thể hoàn tác. Gõ lại username <strong>{user.username}</strong> để xác nhận.
          </p>
          <p>
            <strong className="text-foreground">Sẽ bị xoá:</strong> thông tin đăng nhập, hồ sơ,
            mọi dự án của người này (kèm commit, nhánh, bản nháp), âm thanh riêng, bản ghi
            nhanh và bình luận.
          </p>
          <p>
            <strong className="text-foreground">Sẽ còn lại:</strong> các commit người này từng
            gửi vào dự án của người khác (tác giả hiện là &quot;Tài khoản đã xoá&quot;) và nhật
            ký quản trị.
          </p>
        </div>
      )}
      {action === "reactivate" && user.suspension && (
        <div className="-mt-2 mb-3 rounded-card border border-border bg-surface-subtle p-3 text-xs text-muted">
          <p>
            Bị tạm khoá lúc{" "}
            <span className="font-mono text-foreground">
              {new Date(user.suspension.suspendedAt).toLocaleString(APP_LOCALE)}
            </span>
          </p>
          <p className="mt-1">
            Lý do: <span className="text-foreground">{user.suspension.reason}</span>
          </p>
        </div>
      )}
      {action === "suspend" && (
        <label className="mb-3 flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">Danh mục vi phạm</span>
          <select
            name="category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setReasonError(null);
            }}
            data-autofocus
            className={`${INPUT_CLASS} w-full`}
          >
            <option value="">Chọn danh mục…</option>
            {SUSPEND_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="mb-3 flex flex-col gap-1.5 text-[13px]">
        <span className="font-medium">{action === "suspend" ? "Chi tiết (tuỳ chọn)" : "Lý do"}</span>
        <textarea
          name="reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setReasonError(null);
          }}
          rows={2}
          data-autofocus={action !== "suspend" ? true : undefined}
          className={`${INPUT_CLASS} w-full`}
        />
        {reasonError && <FieldError>{reasonError}</FieldError>}
      </label>
      {action === "remove" && (
        <label className="mb-3 flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">Username xác nhận</span>
          <input
            value={confirmUsername}
            onChange={(e) => setConfirmUsername(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className={`${INPUT_CLASS} w-full`}
          />
        </label>
      )}
      <DialogError message={error} />
      <DialogActions>
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Huỷ
        </Button>
        <Button
          variant={action === "remove" ? "danger" : "primary"}
          onClick={() => void handleConfirm()}
          disabled={
            submitting ||
            (action === "remove" && confirmUsername !== user.username)
          }
        >
          {submitting ? "Đang xử lý…" : "Xác nhận"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AdminUsersTable() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<ListUsersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    user: AdminUserRow;
    action: ActionType;
  } | null>(null);

  async function load(targetPage = pageNumber) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    params.set("page", String(targetPage));
    params.set("limit", String(PAGE_LIMIT));
    try {
      const data = await apiFetch<ListUsersResponse>(
        `/admin/users?${params.toString()}`,
      );
      setResult(data);
      setPageNumber(targetPage);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Không tải được danh sách người dùng."));
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when status filter changes
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(1);
        }}
        className="flex flex-wrap gap-2"
      >
        <div className="relative min-w-[240px] max-w-[380px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            name="q"
            autoComplete="off"
            spellCheck={false}
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

      {doneMessage && (
        <Toast message={doneMessage} variant="success" onDismiss={() => setDoneMessage(null)} />
      )}
      {error && (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-xs text-danger"
        >
          <span>{error}</span>
          <Button variant="secondary" onClick={() => void load(pageNumber)}>
            Thử lại
          </Button>
        </div>
      )}

      <div className="mt-3">
        <RowList cols={COLS}>
          <RowHeader>
            <span>Người dùng</span>
            <span>Email</span>
            <span>Dự án</span>
            <span>Trạng thái</span>
            <span>Vai trò</span>
            <span />
          </RowHeader>

          {result?.users.map((user) => (
            <RowItem key={user.id}>
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar id={user.id} label={user.displayName || user.username} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">{user.displayName}</p>
                  <p className="truncate font-mono text-xs text-muted">@{user.username}</p>
                </div>
              </div>
              <span className="truncate font-mono text-xs text-muted">{user.maskedEmail}</span>
              <span className="font-mono text-xs tabular-nums text-muted">{user.projectCount}</span>
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
          onDone={(message) => {
            setSelected(null);
            setDoneMessage(message);
            void load();
          }}
        />
      )}

      {result && result.total > PAGE_LIMIT && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>
            Trang <span className="font-mono text-foreground">{pageNumber}</span> /{" "}
            <span className="font-mono">{Math.ceil(result.total / PAGE_LIMIT)}</span> ·{" "}
            <span className="font-mono">{result.total.toLocaleString(APP_LOCALE)}</span> tài khoản
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={pageNumber <= 1}
              onClick={() => void load(pageNumber - 1)}
            >
              Trang trước
            </Button>
            <Button
              variant="secondary"
              disabled={pageNumber >= Math.ceil(result.total / PAGE_LIMIT)}
              onClick={() => void load(pageNumber + 1)}
            >
              Trang sau
            </Button>
          </div>
        </div>
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
