"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  Download,
  Loader2,
  Receipt,
} from "lucide-react";
import {
  getAdminTransaction,
  listAdminTransactions,
  type AdminPaymentIssue,
  type AdminTransactionDetail,
  type AdminTransactionItem,
  type AdminTransactionOutcome,
  type AdminTransactionSummary,
} from "../../../lib/api-admin-billing";
import { listSubscriptionPlans } from "../../../lib/api-billing";
import { useI18n, type I18n } from "../../../context/i18n-context";
import { errorSource, renderError, type ErrorSource } from "../../../lib/error-message";
import { exportPaginatedCsv, CSV_MAX_ROWS, type CsvColumn } from "../../../lib/to-csv";
import { formatVnd } from "../../../lib/format-vnd";
import { formatDateTime } from "../../../lib/format-date";
import { PageHeader } from "../../../components/ui/page-header";
import { RowList, RowHeader, RowItem, RowTitle, RowTime } from "../../../components/ui/row-list";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Dialog, DialogActions } from "../../../components/ui/dialog";
import { EmptyState } from "../../../components/ui/empty-state";
import { INPUT_CLASS } from "../../../components/ui/form";

const PAGE_LIMIT = 20;

const OUTCOMES: AdminTransactionOutcome[] = ["success", "failed", "pending"];

function adminKindLabel(kind: string, t: I18n["t"]): string {
  if (kind === "charge") return t("atx.kind.charge");
  if (kind === "refund") return t("atx.kind.refund");
  if (kind === "compensation") return t("atx.kind.compensation");
  return kind;
}

/** Mã | Khách hàng | Gói | Loại | Số tiền | Trạng thái | Thời gian. */
const COLS = "md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_120px_130px_92px_auto]";

interface Filters {
  from: string;
  to: string;
  outcome: string;
  planId: string;
}

const EMPTY_FILTERS: Filters = { from: "", to: "", outcome: "", planId: "" };

function readFilters(params: URLSearchParams): Filters {
  return {
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    outcome: params.get("outcome") ?? "",
    planId: params.get("planId") ?? "",
  };
}

/**
 * `to` là ngày inclusive trên giao diện nhưng backend so `<` (exclusive) — nên
 * chuyển sang đầu ngày kế tiếp để ngày đã chọn được tính trọn.
 */
function toExclusiveBoundary(date: string): string | undefined {
  if (!date) return undefined;
  const next = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(next.getTime())) return undefined;
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

/** Ngày bắt đầu — trả `undefined` nếu giá trị không hợp lệ (URL nhập tay). */
function toStartBoundary(date: string): string | undefined {
  if (!date) return undefined;
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return undefined;
  return start.toISOString();
}

function issueStatusLabel(status: string, t: I18n["t"]): string {
  if (status === "open") return t("atx.issueOpen");
  if (status === "resolved") return t("pi.resolvedBadge");
  return status;
}

function outcomeBadge(outcome: AdminTransactionOutcome, t: I18n["t"]) {
  if (outcome === "success") return <Badge variant="success">{t("atx.outcome.success")}</Badge>;
  if (outcome === "failed") return <Badge variant="danger">{t("atx.outcome.failed")}</Badge>;
  return <Badge variant="warning">{t("atx.outcome.pending")}</Badge>;
}

function SummaryCards({ summary }: { summary: AdminTransactionSummary }) {
  const { t, locale } = useI18n();
  const cards = [
    {
      label: t("atx.sumCharged"),
      value: formatVnd(summary.totalChargeAmount),
      tone: "text-success-foreground",
    },
    {
      label: t("atx.sumRefunded"),
      value: formatVnd(summary.totalRefundAmount),
      tone: "text-warning-foreground",
    },
    {
      label: t("atx.sumSuccess"),
      value: summary.successCount.toLocaleString(locale),
      tone: "text-foreground",
    },
    {
      label: t("atx.sumFailed"),
      value: summary.failedCount.toLocaleString(locale),
      tone: "text-danger",
    },
  ];
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="px-4 py-3">
          <p className="text-xs text-muted">{card.label}</p>
          <p className={`mt-1 font-mono text-[22px] font-semibold tabular-nums ${card.tone}`}>
            {card.value}
          </p>
        </Card>
      ))}
    </div>
  );
}

function CustomerCell({ item }: { item: AdminTransactionItem }) {
  const { t } = useI18n();
  if (item.account) {
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold">
          {item.account.display_name || item.account.username}
        </span>
        <span className="truncate text-xs text-muted">{item.account.email ?? "—"}</span>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge variant="danger">{t("atx.deletedAccount")}</Badge>
        <span className="truncate text-[13px] font-semibold">
          {item.payerName || t("atx.unknownName")}
        </span>
      </span>
      <span className="truncate text-xs text-muted">
        {item.payerEmail ?? "—"}
      </span>
    </div>
  );
}

function DetailDialog({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<AdminTransactionDetail | null>(null);
  const [error, setError] = useState<ErrorSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdminTransaction(id)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errorSource(err, "atx.detailFailed"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const tx = detail?.transaction;

  return (
    <Dialog
      title={t("atx.detailTitle")}
      onClose={onClose}
      className="max-w-2xl p-6"
    >
      {error && (
        <p role="alert" className="mb-4 rounded-card bg-danger-muted px-3 py-2 text-sm text-danger">
          {renderError(error)}
        </p>
      )}
      {!detail && !error && (
        <p role="status" className="flex items-center gap-2 text-[13px] text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> {t("bill.loading")}
        </p>
      )}
      {tx && (
        <div className="space-y-5">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-muted">{t("atx.id")}</dt>
              <dd className="font-mono text-xs">{tx.id}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("atx.providerRef")}</dt>
              <dd className="font-mono text-xs">{tx.providerRef ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("atx.orderCode")}</dt>
              <dd className="font-mono text-xs">
                {tx.orderCode === null ? "—" : tx.orderCode}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t("atx.time")}</dt>
              <dd className="font-mono text-xs">{formatDateTime(tx.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("atx.plan")}</dt>
              <dd className="text-xs">{tx.plan?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("atx.kind")}</dt>
              <dd className="text-xs">{adminKindLabel(tx.kind, t)}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("atx.amount")}</dt>
              <dd className="font-mono text-xs tabular-nums">{formatVnd(tx.amountVnd)}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("atx.status")}</dt>
              <dd className="text-xs">{outcomeBadge(tx.outcome, t)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted">{t("atx.payer")}</dt>
              <dd className="text-xs">
                {tx.account ? (
                  <>
                    {tx.account.display_name || tx.account.username}{" "}
                    <span className="text-muted">({tx.account.email ?? "—"})</span>
                  </>
                ) : (
                  <>
                    <Badge variant="danger">{t("atx.deletedAccount")}</Badge>{" "}
                    <span>
                      {tx.payerName || t("atx.unknownName")} · {tx.payerEmail ?? "—"}
                    </span>
                  </>
                )}
              </dd>
            </div>
            {tx.description && (
              <div className="sm:col-span-2">
                <dt className="text-muted">{t("atx.description")}</dt>
                <dd className="text-xs">{tx.description}</dd>
              </div>
            )}
          </dl>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
              {t("atx.issues", { n: detail.issues.length })}
            </h3>
            {detail.issues.length === 0 ? (
              <p className="text-[13px] text-muted">{t("atx.noIssues")}</p>
            ) : (
              <ul className="space-y-2">
                {detail.issues.map((issue: AdminPaymentIssue) => (
                  <li
                    key={issue.id}
                    className="rounded-card border border-border bg-surface-subtle px-3 py-2 text-[13px]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={issue.status === "open" ? "warning" : "neutral"}>
                        {issueStatusLabel(issue.status, t)}
                      </Badge>
                      <span className="font-mono text-xs text-muted">
                        {formatDateTime(issue.created_at)}
                      </span>
                    </div>
                    <p className="mt-1">{issue.description}</p>
                    {issue.note && <p className="mt-1 text-muted">{t("atx.issueNote", { note: issue.note })}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
              {t("atx.related", { n: detail.relatedTransactions.length })}
            </h3>
            {detail.relatedTransactions.length === 0 ? (
              <p className="text-[13px] text-muted">{t("atx.noRelated")}</p>
            ) : (
              <ul className="space-y-2">
                {detail.relatedTransactions.map((related) => (
                  <li
                    key={related.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border px-3 py-2 text-[13px]"
                  >
                    <span className="font-mono text-xs">{related.id}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs tabular-nums">
                        {formatVnd(related.amountVnd)}
                      </span>
                      {outcomeBadge(related.outcome, t)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      <div className="mt-6">
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>
            {t("atx.close")}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}

function buildCsvColumns(t: I18n["t"]): CsvColumn<AdminTransactionItem>[] {
  return [
    { header: t("atx.csv.id"), value: (row) => row.id },
    { header: t("atx.csv.providerRef"), value: (row) => row.providerRef },
    { header: t("atx.csv.orderCode"), value: (row) => row.orderCode },
    { header: t("atx.csv.payerName"), value: (row) => row.payerName ?? row.account?.display_name },
    { header: t("atx.csv.payerEmail"), value: (row) => row.payerEmail ?? row.account?.email },
    { header: t("atx.csv.plan"), value: (row) => row.plan?.name },
    { header: t("atx.csv.kind"), value: (row) => adminKindLabel(row.kind, t) },
    { header: t("atx.csv.amount"), value: (row) => row.amountVnd },
    { header: t("atx.csv.status"), value: (row) => t(`atx.outcome.${row.outcome}`) },
    { header: t("atx.csv.time"), value: (row) => formatDateTime(row.createdAt) },
  ];
}

function AdminTransactionsContent() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => readFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const openId = searchParams.get("open") ?? "";

  const requestFilter = useMemo(() => {
    return {
      from: toStartBoundary(filters.from),
      to: toExclusiveBoundary(filters.to),
      outcome: (filters.outcome || undefined) as AdminTransactionOutcome | undefined,
      planId: filters.planId || undefined,
    };
  }, [filters]);

  /**
   * `loading` suy ra từ so khoá yêu cầu với khoá của lần tải gần nhất (mẫu của
   * `useApiResource`) — không setState trong thân effect.
   */
  const requestKey = JSON.stringify(requestFilter);
  const [page, setPage] = useState<{
    key: string;
    items: AdminTransactionItem[];
    summary: AdminTransactionSummary | null;
    nextCursor: string | null;
  }>({ key: "", items: [], summary: null, nextCursor: null });
  /** Các trang đã nối thêm; gắn khoá để bỏ qua khi bộ lọc đổi. */
  const [extra, setExtra] = useState<{ key: string; items: AdminTransactionItem[] }>({
    key: "",
    items: [],
  });
  const [error, setError] = useState<ErrorSource | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportCount, setExportCount] = useState<number | null>(null);
  const [plans, setPlans] = useState<{ id: string; name: string }[]>([]);

  const loading = page.key !== requestKey;
  const items = loading
    ? []
    : [...page.items, ...(extra.key === requestKey ? extra.items : [])];
  const summary = loading ? null : page.summary;
  const nextCursor = loading ? null : page.nextCursor;

  useEffect(() => {
    let cancelled = false;
    listSubscriptionPlans()
      .then((list) => {
        if (!cancelled) {
          setPlans(list.map((plan) => ({ id: plan.id, name: plan.name })));
        }
      })
      .catch(() => {
        if (!cancelled) setPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listAdminTransactions({ ...requestFilter, limit: PAGE_LIMIT })
      .then((result) => {
        if (cancelled) return;
        setPage({
          key: requestKey,
          items: result.items,
          summary: result.summary,
          nextCursor: result.nextCursor,
        });
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPage({ key: requestKey, items: [], summary: null, nextCursor: null });
        setError(errorSource(err, "atx.listFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [requestFilter, requestKey]);

  function updateParams(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.push(`/admin/transactions?${params.toString()}`);
  }

  /** Đổi bộ lọc → xoá cursor, quay về trang đầu. */
  function changeFilter(key: keyof Filters, value: string) {
    updateParams({
      [key]: value || null,
      cursor: null,
      open: null,
    });
  }

  function changeDate(key: "from" | "to", value: string) {
    changeFilter(key, value);
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const result = await listAdminTransactions({
        ...requestFilter,
        limit: PAGE_LIMIT,
        cursor: nextCursor,
      });
      const previous = extra.key === requestKey ? extra.items : [];
      setExtra({
        key: requestKey,
        items: [...previous, ...result.items],
      });
      setPage((prev) =>
        prev.key === requestKey
          ? { ...prev, nextCursor: result.nextCursor }
          : prev,
      );
      setError(null);
    } catch (err) {
      setError(errorSource(err, "atx.listFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportCount(null);
    try {
      const count = await exportPaginatedCsv(
        (pageCursor) =>
          listAdminTransactions({
            ...requestFilter,
            limit: 100,
            cursor: pageCursor ?? undefined,
          }),
        buildCsvColumns(t),
        t("atx.csv.fileName"),
        (loaded) => setExportCount(loaded),
      );
      setExportCount(count);
    } catch (err) {
      setError(errorSource(err, "atx.exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  const hasFilters = Boolean(
    filters.from || filters.to || filters.outcome || filters.planId,
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: t("adm.navTitle") }, { label: t("atx.title") }]}
        title={t("atx.title")}
        description={t("atx.subtitle")}
        action={
          <Button
            variant="secondary"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            {exporting
              ? exportCount !== null
                ? t("atx.exportingCount", { n: exportCount.toLocaleString(locale) })
                : t("atx.exporting")
              : t("atx.export")}
          </Button>
        }
      />

      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t("atx.from")}
          <input
            type="date"
            name="from"
            autoComplete="off"
            value={filters.from}
            onChange={(e) => changeDate("from", e.target.value)}
            className={`${INPUT_CLASS} h-[34px]`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t("atx.to")}
          <input
            type="date"
            name="to"
            autoComplete="off"
            value={filters.to}
            onChange={(e) => changeDate("to", e.target.value)}
            className={`${INPUT_CLASS} h-[34px]`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t("atx.filterStatus")}
          <select
            name="outcome"
            autoComplete="off"
            value={filters.outcome}
            onChange={(e) => changeFilter("outcome", e.target.value)}
            className={`${INPUT_CLASS} h-[34px]`}
          >
            <option value="">{t("atx.all")}</option>
            {OUTCOMES.map((option) => (
              <option key={option} value={option}>
                {t(`atx.outcome.${option}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t("atx.filterPlan")}
          <select
            name="planId"
            autoComplete="off"
            value={filters.planId}
            onChange={(e) => changeFilter("planId", e.target.value)}
            className={`${INPUT_CLASS} h-[34px]`}
          >
            <option value="">{t("atx.all")}</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => updateParams({ ...EMPTY_FILTERS, cursor: null, open: null })}
          >
            {t("atx.clearFilters")}
          </Button>
        )}
      </form>

      {filters.outcome === "failed" && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
          <AlertTriangle aria-hidden="true" className="h-4 w-4" />
          <span>
            {t("atx.failedHint")}
          </span>
          <Link
            href="/admin/payment-issues"
            className="font-semibold underline underline-offset-2"
          >
            {t("atx.openIssues")}
          </Link>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-xs text-danger"
        >
          <span>{renderError(error)}</span>
          <Button
            variant="secondary"
            onClick={() => updateParams({ cursor: null, open: null })}
          >
            {t("bill.retry")}
          </Button>
        </div>
      )}

      {summary && !error && <SummaryCards summary={summary} />}

      {!summary && !error && loading && (
        <p role="status" className="px-4 py-8 text-center text-[13px] text-muted">
          {t("bill.loading")}
        </p>
      )}

      {summary && !error && items.length === 0 && (
        <EmptyState
          icon={Receipt}
          title={
            hasFilters ? t("atx.emptyFiltered") : t("atx.empty")
          }
          description={
            hasFilters ? t("atx.emptyFilteredBody") : t("atx.emptyBody")
          }
          action={
            hasFilters ? (
              <Button
                variant="secondary"
                onClick={() => updateParams({ ...EMPTY_FILTERS, cursor: null, open: null })}
              >
                {t("atx.clearFilters")}
              </Button>
            ) : undefined
          }
        />
      )}

      {items.length > 0 && (
        <RowList cols={COLS}>
          <RowHeader>
            <span>{t("atx.colId")}</span>
            <span>{t("atx.colCustomer")}</span>
            <span>{t("atx.colPlan")}</span>
            <span>{t("atx.colKindAmount")}</span>
            <span>{t("atx.colStatus")}</span>
            <span />
          </RowHeader>

          {items.map((item) => (
            <RowItem key={item.id}>
              <RowTitle
                href={`/admin/transactions?${new URLSearchParams({
                  ...Object.fromEntries(
                    new URLSearchParams(searchParams.toString()).entries(),
                  ),
                  open: item.id,
                }).toString()}`}
                name={item.providerRef ?? item.id}
                meta={
                  <span className="font-mono">
                    {item.orderCode === null ? item.id : t("atx.order", { code: item.orderCode })}
                  </span>
                }
              />
              <CustomerCell item={item} />
              <span className="truncate text-[13px]">{item.plan?.name ?? "—"}</span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs text-muted">{adminKindLabel(item.kind, t)}</span>
                <span className="font-mono text-[13px] tabular-nums">
                  {formatVnd(item.amountVnd)}
                </span>
              </div>
              <span>{outcomeBadge(item.outcome, t)}</span>
              <RowTime>{formatDateTime(item.createdAt)}</RowTime>
            </RowItem>
          ))}
        </RowList>
      )}

      {nextCursor && (
        <div className="mt-3 flex justify-center">
          <Button
            variant="secondary"
            disabled={loadingMore}
            onClick={() => {
              void loadMore();
            }}
          >
            {loadingMore ? (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            {t("atx.loadMore")}
          </Button>
        </div>
      )}

      {exporting && exportCount !== null && (
        <p role="status" className="mt-2 text-center text-xs text-muted">
          {t("atx.gathering", { n: exportCount.toLocaleString(locale), max: CSV_MAX_ROWS.toLocaleString(locale) })}
        </p>
      )}

      {openId && <DetailDialog id={openId} onClose={() => updateParams({ open: null })} />}
    </div>
  );
}

function TransactionsFallback() {
  const { t } = useI18n();
  return (
    <p role="status" className="px-4 py-8 text-center text-[13px] text-muted">
      {t("bill.loading")}
    </p>
  );
}

export default function AdminTransactionsPage() {
  return (
    <Suspense fallback={<TransactionsFallback />}>
      <AdminTransactionsContent />
    </Suspense>
  );
}
