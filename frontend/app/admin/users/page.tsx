"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { apiFetch } from "../../../lib/api-client";
import { PageHeader } from "../../../components/ui/page-header";
import { RowList, RowHeader, RowItem } from "../../../components/ui/row-list";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Avatar } from "../../../components/ui/avatar";
import { FieldError, INPUT_CLASS } from "../../../components/ui/form";
import { Dialog, DialogActions, DialogError } from "../../../components/ui/dialog";
import { apiErrorMessage } from "../../../lib/error-message";
import { Toast } from "../../../components/ui/toast";
import { useI18n } from "../../../context/i18n-context";
import { tNow, type TKey } from "../../../lib/i18n";

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
  { id: "content", label: "au.catContent" },
  { id: "spam", label: "au.catSpam" },
  { id: "abuse", label: "au.catAbuse" },
  { id: "fraud", label: "au.catFraud" },
  { id: "other", label: "au.catOther" },
] as const satisfies readonly { id: string; label: TKey }[];

function StatusBadge({ status }: { status: AdminUserRow["status"] }) {
  const { t } = useI18n();
  if (status === "active") return <Badge variant="success">{t("au.stActive")}</Badge>;
  if (status === "suspended") return <Badge variant="warning">{t("au.stSuspended")}</Badge>;
  return <Badge variant="danger">{t("au.stRemoved")}</Badge>;
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
  const { t, tx, locale } = useI18n();
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
      setReasonError(t("au.pickCategory"));
      return;
    }
    if ((action !== "suspend" || category === "other") && !detail) {
      setReasonError(t("au.reasonRequired"));
      return;
    }
    const categoryLabel = SUSPEND_CATEGORIES.find((c) => c.id === category)?.label;
    const categoryText = categoryLabel ? t(categoryLabel) : category;
    const finalReason =
      action === "suspend" ? (detail ? `${categoryText}: ${detail}` : categoryText) : detail;
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
          ? t("au.doneSuspend", { name: user.username })
          : action === "reactivate"
            ? t("au.doneReactivate", { name: user.username })
            : t("au.doneRemove", { name: user.username }),
      );
    } catch (err) {
      setError(apiErrorMessage(err, t("au.actionFail")));
    } finally {
      setSubmitting(false);
    }
  }

  const title =
    action === "suspend"
      ? t("au.titleSuspend", { name: user.username })
      : action === "reactivate"
        ? t("au.titleReactivate", { name: user.username })
        : t("au.titleRemove", { name: user.username });

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
            {tx("au.removeWarn", { name: <strong>{user.username}</strong> })}
          </p>
          <p>
            <strong className="text-foreground">{t("au.willDeleteLabel")}</strong> {t("au.willDelete")}
          </p>
          <p>
            <strong className="text-foreground">{t("au.willRemainLabel")}</strong> {t("au.willRemain")}
          </p>
        </div>
      )}
      {action === "reactivate" && user.suspension && (
        <div className="-mt-2 mb-3 rounded-card border border-border bg-surface-subtle p-3 text-xs text-muted">
          <p>
            {tx("au.suspendedAt", { when: <span className="font-mono text-foreground">{new Date(user.suspension.suspendedAt).toLocaleString(locale)}</span> })}
          </p>
          <p className="mt-1">
            {t("au.reason")} <span className="text-foreground">{user.suspension.reason}</span>
          </p>
        </div>
      )}
      {action === "suspend" && (
        <label className="mb-3 flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">{t("au.category")}</span>
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
            <option value="">{t("au.pickCategoryOpt")}</option>
            {SUSPEND_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {t(c.label)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="mb-3 flex flex-col gap-1.5 text-[13px]">
        <span className="font-medium">{action === "suspend" ? t("au.detail") : t("au.reasonLabel")}</span>
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
          <span className="font-medium">{t("au.confirmUsername")}</span>
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
          {t("ui.cancel")}
        </Button>
        <Button
          variant={action === "remove" ? "danger" : "primary"}
          onClick={() => void handleConfirm()}
          disabled={
            submitting ||
            (action === "remove" && confirmUsername !== user.username)
          }
        >
          {submitting ? t("ui.processing") : t("ui.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AdminUsersTable() {
  const { t, locale } = useI18n();
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
      setError(apiErrorMessage(err, tNow("au.loadFail")));
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
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            name="q"
            autoComplete="off"
            spellCheck={false}
            placeholder={t("au.searchPlaceholder")}
            aria-label={t("au.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${INPUT_CLASS} h-[34px] w-full pl-8`}
          />
        </div>
        <select
          name="status-filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label={t("au.filterStatus")}
          className={`${INPUT_CLASS} h-[34px]`}
        >
          <option value="">{t("au.allStatuses")}</option>
          <option value="active">{t("au.stActive")}</option>
          <option value="suspended">{t("au.stSuspended")}</option>
        </select>
        <Button type="submit" variant="secondary">
          {t("au.search")}
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
            {t("ui.retry")}
          </Button>
        </div>
      )}

      <div className="mt-3">
        <RowList cols={COLS}>
          <RowHeader>
            <span>{t("au.colUser")}</span>
            <span>{t("au.colEmail")}</span>
            <span>{t("au.colProjects")}</span>
            <span>{t("au.colStatus")}</span>
            <span>{t("au.colRole")}</span>
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
              <span className="font-mono text-xs tabular-nums text-muted">
                <span className="font-sans md:hidden">{t("au.colProjects")}: </span>
                {user.projectCount}
              </span>
              <span>
                <StatusBadge status={user.status} />
              </span>
              <span>
                {user.role === "admin" ? (
                  <Badge variant="info">{t("au.roleAdmin")}</Badge>
                ) : (
                  <Badge variant="neutral">{t("au.roleUser")}</Badge>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                {user.role !== "admin" && (
                  <>
                    {user.status === "active" && (
                      <Button variant="ghost" onClick={() => setSelected({ user, action: "suspend" })}>
                        {t("au.suspend")}
                      </Button>
                    )}
                    {user.status === "suspended" && (
                      <Button
                        variant="ghost"
                        onClick={() => setSelected({ user, action: "reactivate" })}
                      >
                        {t("au.reactivate")}
                      </Button>
                    )}
                    <Button variant="danger" onClick={() => setSelected({ user, action: "remove" })}>
                      {t("au.remove")}
                    </Button>
                  </>
                )}
              </div>
            </RowItem>
          ))}

          {!result && !error && (
            <p role="status" className="px-4 py-8 text-center text-[13px] text-muted">
              {t("ui.loading")}
            </p>
          )}

          {result && result.users.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-muted">{t("au.noResults")}</p>
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
            {t("au.page", { page: pageNumber, pages: Math.ceil(result.total / PAGE_LIMIT), total: result.total.toLocaleString(locale) })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={pageNumber <= 1}
              onClick={() => void load(pageNumber - 1)}
            >
              {t("au.prev")}
            </Button>
            <Button
              variant="secondary"
              disabled={pageNumber >= Math.ceil(result.total / PAGE_LIMIT)}
              onClick={() => void load(pageNumber + 1)}
            >
              {t("au.next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  const { t } = useI18n();
  // require-auth và kiểm quyền admin do layout /admin đảm nhiệm (cùng auth
  // context — không thêm network, không nhấp nháy). Bố cục (menu + khung) do
  // layout cung cấp, trang chỉ render nội dung bên phải.
  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: t("au.crumb") }]}
        title={t("au.title")}
        description={t("au.description")}
      />
      <AdminUsersTable />
    </div>
  );
}
