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
import { apiErrorMessage } from "../../../lib/error-message";
import { exportPaginatedCsv, CSV_MAX_ROWS, type CsvColumn } from "../../../lib/to-csv";
import { formatVnd } from "../../../lib/format-vnd";
import { appLocale, formatDateTime } from "../../../lib/format-date";
import { PageHeader } from "../../../components/ui/page-header";
import { RowList, RowHeader, RowItem, RowTitle, RowTime } from "../../../components/ui/row-list";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Dialog, DialogActions } from "../../../components/ui/dialog";
import { EmptyState } from "../../../components/ui/empty-state";
import { INPUT_CLASS } from "../../../components/ui/form";

const PAGE_LIMIT = 20;

const OUTCOMES: { value: AdminTransactionOutcome; label: string }[] = [
  { value: "success", label: "Thành công" },
  { value: "failed", label: "Thất bại" },
  { value: "pending", label: "Chưa hoàn tất" },
];

const KIND_LABELS: Record<string, string> = {
  charge: "Thu tiền",
  refund: "Hoàn tiền",
  compensation: "Đền bù",
};

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

function outcomeBadge(outcome: AdminTransactionOutcome) {
  if (outcome === "success") return <Badge variant="success">Thành công</Badge>;
  if (outcome === "failed") return <Badge variant="danger">Thất bại</Badge>;
  return <Badge variant="warning">Chưa hoàn tất</Badge>;
}

function SummaryCards({ summary }: { summary: AdminTransactionSummary }) {
  const locale = appLocale();
  const cards = [
    {
      label: "Tổng tiền thu thành công",
      value: formatVnd(summary.totalChargeAmount),
      tone: "text-success-foreground",
    },
    {
      label: "Tổng tiền hoàn trả",
      value: formatVnd(summary.totalRefundAmount),
      tone: "text-warning-foreground",
    },
    {
      label: "Giao dịch thành công",
      value: summary.successCount.toLocaleString(locale),
      tone: "text-foreground",
    },
    {
      label: "Giao dịch thất bại",
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
        <Badge variant="danger">Tài khoản đã xoá</Badge>
        <span className="truncate text-[13px] font-semibold">
          {item.payerName || "Không rõ tên"}
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
  const [detail, setDetail] = useState<AdminTransactionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdminTransaction(id)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(apiErrorMessage(err, "Không tải được chi tiết giao dịch."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const tx = detail?.transaction;

  return (
    <Dialog
      title="Chi tiết giao dịch"
      onClose={onClose}
      className="max-w-2xl p-6"
    >
      {error && (
        <p role="alert" className="mb-4 rounded-card bg-danger-muted px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {!detail && !error && (
        <p role="status" className="flex items-center gap-2 text-[13px] text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Đang tải…
        </p>
      )}
      {tx && (
        <div className="space-y-5">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-muted">Mã giao dịch</dt>
              <dd className="font-mono text-xs">{tx.id}</dd>
            </div>
            <div>
              <dt className="text-muted">Mã đối tác thanh toán</dt>
              <dd className="font-mono text-xs">{tx.providerRef ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Mã đơn</dt>
              <dd className="font-mono text-xs">
                {tx.orderCode === null ? "—" : tx.orderCode}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Thời gian</dt>
              <dd className="font-mono text-xs">{formatDateTime(tx.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">Gói</dt>
              <dd className="text-xs">{tx.plan?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Loại</dt>
              <dd className="text-xs">{KIND_LABELS[tx.kind] ?? tx.kind}</dd>
            </div>
            <div>
              <dt className="text-muted">Số tiền</dt>
              <dd className="font-mono text-xs tabular-nums">{formatVnd(tx.amountVnd)}</dd>
            </div>
            <div>
              <dt className="text-muted">Trạng thái</dt>
              <dd className="text-xs">{outcomeBadge(tx.outcome)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted">Người thanh toán</dt>
              <dd className="text-xs">
                {tx.account ? (
                  <>
                    {tx.account.display_name || tx.account.username}{" "}
                    <span className="text-muted">({tx.account.email ?? "—"})</span>
                  </>
                ) : (
                  <>
                    <Badge variant="danger">Tài khoản đã xoá</Badge>{" "}
                    <span>
                      {tx.payerName || "Không rõ tên"} · {tx.payerEmail ?? "—"}
                    </span>
                  </>
                )}
              </dd>
            </div>
            {tx.description && (
              <div className="sm:col-span-2">
                <dt className="text-muted">Mô tả</dt>
                <dd className="text-xs">{tx.description}</dd>
              </div>
            )}
          </dl>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
              Sự cố thanh toán ({detail.issues.length})
            </h3>
            {detail.issues.length === 0 ? (
              <p className="text-[13px] text-muted">Không có sự cố ghi nhận.</p>
            ) : (
              <ul className="space-y-2">
                {detail.issues.map((issue: AdminPaymentIssue) => (
                  <li
                    key={issue.id}
                    className="rounded-card border border-border bg-surface-subtle px-3 py-2 text-[13px]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={issue.status === "open" ? "warning" : "neutral"}>
                        {issue.status === "open" ? "Đang mở" : issue.status}
                      </Badge>
                      <span className="font-mono text-xs text-muted">
                        {formatDateTime(issue.created_at)}
                      </span>
                    </div>
                    <p className="mt-1">{issue.description}</p>
                    {issue.note && <p className="mt-1 text-muted">Ghi chú: {issue.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
              Giao dịch liên quan ({detail.relatedTransactions.length})
            </h3>
            {detail.relatedTransactions.length === 0 ? (
              <p className="text-[13px] text-muted">Không có giao dịch liên quan.</p>
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
                      {outcomeBadge(related.outcome)}
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
            Đóng
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}

const CSV_COLUMNS: CsvColumn<AdminTransactionItem>[] = [
  { header: "Mã giao dịch", value: (row) => row.id },
  { header: "Mã đối tác thanh toán", value: (row) => row.providerRef },
  { header: "Mã đơn", value: (row) => row.orderCode },
  { header: "Tên người trả", value: (row) => row.payerName ?? row.account?.display_name },
  { header: "Email người trả", value: (row) => row.payerEmail ?? row.account?.email },
  { header: "Gói", value: (row) => row.plan?.name },
  { header: "Loại", value: (row) => KIND_LABELS[row.kind] ?? row.kind },
  { header: "Số tiền (VND)", value: (row) => row.amountVnd },
  { header: "Trạng thái", value: (row) => row.outcome },
  { header: "Thời gian", value: (row) => formatDateTime(row.createdAt) },
];

function AdminTransactionsContent() {
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
  const [error, setError] = useState<string | null>(null);
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
        setError(apiErrorMessage(err, "Không tải được danh sách giao dịch."));
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
      setError(apiErrorMessage(err, "Không tải được danh sách giao dịch."));
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
        CSV_COLUMNS,
        "giao-dich-stave",
        (loaded) => setExportCount(loaded),
      );
      setExportCount(count);
    } catch (err) {
      setError(apiErrorMessage(err, "Không xuất được file CSV."));
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
        breadcrumbs={[{ label: "Quản trị" }, { label: "Giao dịch" }]}
        title="Giao dịch"
        description="Tra cứu toàn bộ giao dịch thanh toán của hệ thống."
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
              ? `Đang tải…${exportCount !== null ? ` (${exportCount.toLocaleString(appLocale())})` : ""}`
              : "Xuất CSV"}
          </Button>
        }
      />

      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="flex flex-col gap-1 text-xs text-muted">
          Từ ngày
          <input
            type="date"
            name="from"
            value={filters.from}
            onChange={(e) => changeDate("from", e.target.value)}
            className={`${INPUT_CLASS} h-[34px]`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Đến ngày
          <input
            type="date"
            name="to"
            value={filters.to}
            onChange={(e) => changeDate("to", e.target.value)}
            className={`${INPUT_CLASS} h-[34px]`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Trạng thái
          <select
            name="outcome"
            value={filters.outcome}
            onChange={(e) => changeFilter("outcome", e.target.value)}
            className={`${INPUT_CLASS} h-[34px]`}
          >
            <option value="">Tất cả</option>
            {OUTCOMES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Gói
          <select
            name="planId"
            value={filters.planId}
            onChange={(e) => changeFilter("planId", e.target.value)}
            className={`${INPUT_CLASS} h-[34px]`}
          >
            <option value="">Tất cả</option>
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
            Xoá bộ lọc
          </Button>
        )}
      </form>

      {filters.outcome === "failed" && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
          <AlertTriangle aria-hidden="true" className="h-4 w-4" />
          <span>
            Đang lọc các giao dịch thất bại. Xem danh sách sự cố thanh toán để xử lý
            các đơn chưa được kích hoạt.
          </span>
          <Link
            href="/admin/payment-issues"
            className="font-semibold underline underline-offset-2"
          >
            Mở trang sự cố thanh toán
          </Link>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-xs text-danger"
        >
          <span>{error}</span>
          <Button
            variant="secondary"
            onClick={() => updateParams({ cursor: null, open: null })}
          >
            Thử lại
          </Button>
        </div>
      )}

      {summary && !error && <SummaryCards summary={summary} />}

      {!summary && !error && loading && (
        <p role="status" className="px-4 py-8 text-center text-[13px] text-muted">
          Đang tải…
        </p>
      )}

      {summary && !error && items.length === 0 && (
        <EmptyState
          icon={Receipt}
          title={
            hasFilters
              ? "Không có giao dịch nào khớp bộ lọc"
              : "Chưa có giao dịch nào"
          }
          description={
            hasFilters
              ? "Hãy nới bộ lọc (khoảng ngày, trạng thái hoặc gói) để xem thêm kết quả."
              : "Khi có người dùng đăng ký gói trả phí, giao dịch sẽ xuất hiện tại đây."
          }
          action={
            hasFilters ? (
              <Button
                variant="secondary"
                onClick={() => updateParams({ ...EMPTY_FILTERS, cursor: null, open: null })}
              >
                Xoá bộ lọc
              </Button>
            ) : undefined
          }
        />
      )}

      {items.length > 0 && (
        <RowList cols={COLS}>
          <RowHeader>
            <span>Mã giao dịch</span>
            <span>Khách hàng</span>
            <span>Gói</span>
            <span>Loại / Số tiền</span>
            <span>Trạng thái</span>
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
                    {item.orderCode === null ? item.id : `Đơn ${item.orderCode}`}
                  </span>
                }
              />
              <CustomerCell item={item} />
              <span className="truncate text-[13px]">{item.plan?.name ?? "—"}</span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs text-muted">{KIND_LABELS[item.kind] ?? item.kind}</span>
                <span className="font-mono text-[13px] tabular-nums">
                  {formatVnd(item.amountVnd)}
                </span>
              </div>
              <span>{outcomeBadge(item.outcome)}</span>
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
            Tải thêm
          </Button>
        </div>
      )}

      {exporting && exportCount !== null && (
        <p role="status" className="mt-2 text-center text-xs text-muted">
          Đang gom dữ liệu: {exportCount.toLocaleString(appLocale())} /{" "}
          {CSV_MAX_ROWS.toLocaleString(appLocale())} dòng
        </p>
      )}

      {openId && <DetailDialog id={openId} onClose={() => updateParams({ open: null })} />}
    </div>
  );
}

export default function AdminTransactionsPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-4 py-8 text-center text-[13px] text-muted">
          Đang tải…
        </p>
      }
    >
      <AdminTransactionsContent />
    </Suspense>
  );
}
