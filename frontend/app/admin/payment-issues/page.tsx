"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  listAdminPaymentIssues,
  type AdminPaymentIssueItem,
  type PaymentIssueStatus,
} from "../../../lib/api-admin-payment-issues";
import { errorSource, renderError, type ErrorSource } from "../../../lib/error-message";
import { formatDateTime } from "../../../lib/format-date";
import { formatVnd } from "../../../lib/format-vnd";
import { useI18n } from "../../../context/i18n-context";
import { useApiResource } from "../../../lib/use-api-resource";
import { PageHeader } from "../../../components/ui/page-header";
import { Tabs } from "../../../components/ui/tabs";
import { RowList, RowHeader, RowItem, RowTitle, RowTime } from "../../../components/ui/row-list";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";

/** Mã sự cố | Giao dịch | Khách hàng | Người báo | Ngày tạo. */
const COLS = "md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_150px_120px]";

const TABS = [
  { id: "open", label: "pi.tabOpen" },
  { id: "resolved", label: "pi.tabResolved" },
] as const;

function readStatus(params: URLSearchParams): PaymentIssueStatus {
  return params.get("status") === "resolved" ? "resolved" : "open";
}

export default function AdminPaymentIssuesPage() {
  const { t } = useI18n();
  return (
    <Suspense
      fallback={
        <p role="status" className="px-4 py-8 text-center text-[13px] text-muted">
          {t("ui.loading")}
        </p>
      }
    >
      <AdminPaymentIssuesContent />
    </Suspense>
  );
}

function AdminPaymentIssuesContent() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = readStatus(new URLSearchParams(searchParams.toString()));

  const [reloadKey, setReloadKey] = useState(0);
  const [more, setMore] = useState<{
    key: string;
    items: AdminPaymentIssueItem[];
    cursor: string | null;
  } | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<ErrorSource | null>(null);

  const { data, loading, error } = useApiResource(
    () => listAdminPaymentIssues(status),
    [status, reloadKey],
    t("pi.loadFail"),
  );

  const viewKey = `${status}:${reloadKey}`;
  const currentMore = more && more.key === viewKey ? more : null;
  const moreItems = currentMore?.items ?? [];
  const nextCursor = currentMore ? currentMore.cursor : (data?.nextCursor ?? null);

  const loadMore = useCallback(async () => {
    if (!nextCursor || moreLoading) return;
    setMoreLoading(true);
    setMoreError(null);
    try {
      const page = await listAdminPaymentIssues(status, nextCursor);
      setMore((previous) => {
        const base = previous && previous.key === viewKey ? previous.items : [];
        const seen = new Set(base.map((item) => item.id));
        return {
          key: viewKey,
          items: [...base, ...page.items.filter((item) => !seen.has(item.id))],
          cursor: page.nextCursor,
        };
      });
    } catch (err) {
      setMoreError(errorSource(err, "pi.loadFail"));
    } finally {
      setMoreLoading(false);
    }
  }, [nextCursor, moreLoading, status, viewKey]);

  function changeTab(id: string) {
    router.replace(`/admin/payment-issues?status=${id}`);
  }

  const items = data ? [...data.items, ...moreItems] : [];

  return (
    <div>
      <PageHeader title={t("pi.title")} description={t("pi.description")} />

      <Tabs
        tabs={TABS.map((entry) => ({ id: entry.id, label: t(entry.label) }))}
        active={status}
        onChange={changeTab}
      />

      <div
        role="tabpanel"
        aria-label={t(status === "open" ? "pi.tabOpen" : "pi.tabResolved")}
        className="mt-4"
      >
        {loading ? (
          <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent" /> {t("ui.loading")}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-sm text-danger"
          >
            <span>{error}</span>
            <Button variant="secondary" onClick={() => setReloadKey((n) => n + 1)}>
              {t("ui.retry")}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title={t(status === "open" ? "pi.emptyOpenTitle" : "pi.emptyResolvedTitle")}
            description={t(status === "open" ? "pi.emptyOpenDesc" : "pi.emptyResolvedDesc")}
          />
        ) : (
          <>
            <RowList cols={COLS}>
              <RowHeader>
                <span>{t("pi.colIssue")}</span>
                <span>{t("pi.colTransaction")}</span>
                <span>{t("pi.colCustomer")}</span>
                <span>{t("pi.colReporter")}</span>
                <span>{t("pi.colCreated")}</span>
              </RowHeader>
              {items.map((item) => (
                <RowItem key={item.id}>
                  <RowTitle
                    href={`/admin/payment-issues/${item.id}`}
                    name={item.description}
                    meta={<span className="font-mono">{item.id}</span>}
                  />
                  <span className="min-w-0 text-[13px]">
                    {item.transaction ? (
                      <>
                        <span className="font-mono text-xs">
                          {item.transaction.order_code ?? "—"}
                        </span>
                        <span className="ml-2 font-mono text-xs tabular-nums text-muted">
                          {formatVnd(item.transaction.amount_vnd)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    {item.transaction?.account ? (
                      <>
                        <span className="truncate text-[13px] font-semibold">
                          {item.transaction.account.display_name ||
                            item.transaction.account.username}
                        </span>
                        <span className="truncate text-xs text-muted">
                          {item.transaction.account.email ?? "—"}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="danger">{t("pi.accountDeleted")}</Badge>
                          <span className="truncate text-[13px] font-semibold">
                            {item.payerName || t("pi.unknownName")}
                          </span>
                        </span>
                        <span className="truncate text-xs text-muted">
                          {item.payerEmail ?? "—"}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="truncate text-[13px] text-muted">
                    {item.reportedBy
                      ? item.reportedBy.display_name || item.reportedBy.username
                      : t("pi.reportedBySystem")}
                  </span>
                  <RowTime>{formatDateTime(item.createdAt)}</RowTime>
                </RowItem>
              ))}
            </RowList>

            {moreError && (
              <p
                role="alert"
                className="mt-3 rounded-card bg-danger-muted px-3 py-2 text-sm text-danger"
              >
                {renderError(moreError)}
              </p>
            )}

            {nextCursor && (
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" onClick={loadMore} disabled={moreLoading}>
                  {moreLoading ? t("ui.loading") : t("pi.loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
