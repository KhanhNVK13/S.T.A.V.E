"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Loader2, Receipt, RefreshCw, TriangleAlert } from "lucide-react";
import type { EffectiveSubscription, TransactionHistoryItem } from "@stave/shared-types";
import { getMySubscription, listTransactions } from "../../lib/api-billing";
import { DISPLAY_STATUS_LABEL, DISPLAY_STATUS_VARIANT, KIND_LABEL, subscriptionSummary } from "../../lib/billing-history";
import { apiErrorMessage } from "../../lib/error-message";
import { formatDate } from "../../lib/format-date";
import { formatVnd } from "../../lib/format-vnd";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { PageHeader } from "../ui/page-header";
import { RowHeader, RowItem, RowList, RowTime } from "../ui/row-list";
import { PRIMARY_LINK } from "./link-styles";
import { ReportIssueDialog } from "./report-issue-dialog";

const COLS = "md:grid-cols-[96px_minmax(0,1fr)_112px_120px_auto]";

export function BillingHistoryView() {
  const [subscription, setSubscription] = useState<EffectiveSubscription | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);

  const [items, setItems] = useState<TransactionHistoryItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listAttempt, setListAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const [issueTarget, setIssueTarget] = useState<TransactionHistoryItem | null>(null);
  const [issueDrafts, setIssueDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMySubscription()
      .then((result) => {
        if (!cancelled) setSubscription(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setSubscriptionError(apiErrorMessage(err, "Không tải được gói hiện tại."));
      });
    return () => {
      cancelled = true;
    };
  }, [subscriptionAttempt]);

  useEffect(() => {
    let cancelled = false;
    listTransactions()
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((err: unknown) => {
        if (!cancelled) setListError(apiErrorMessage(err, "Không tải được lịch sử giao dịch."));
      });
    return () => {
      cancelled = true;
    };
  }, [listAttempt]);

  function retrySubscription() {
    setSubscriptionError(null);
    setSubscription(null);
    setSubscriptionAttempt((n) => n + 1);
  }

  function retryList() {
    setListError(null);
    setItems(null);
    setNextCursor(null);
    setListAttempt((n) => n + 1);
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await listTransactions(nextCursor);
      setItems((current) => [...(current ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setMoreError(apiErrorMessage(err, "Không tải thêm được giao dịch."));
    } finally {
      setLoadingMore(false);
    }
  }

  function markReported(id: string) {
    setItems((current) => current?.map((item) => (item.id === id ? { ...item, hasOpenIssue: true } : item)) ?? null);
    setIssueDrafts((drafts) => ({ ...drafts, [id]: "" }));
    setIssueTarget(null);
    setNotice("Đã gửi sự cố. Quản trị viên sẽ xử lý và báo lại cho bạn qua thông báo.");
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <PageHeader
        title="Thanh toán"
        description="Gói bạn đang dùng và lịch sử giao dịch."
        action={
          <Link href="/plans" className="text-sm font-semibold text-accent hover:underline">
            Xem các gói
          </Link>
        }
      />

      <Card className="mb-6 flex items-start gap-3 p-4">
        <CreditCard aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
        {subscriptionError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-danger">{subscriptionError}</span>
            <Button variant="secondary" onClick={retrySubscription}>
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Thử lại
            </Button>
          </div>
        ) : !subscription ? (
          <div aria-busy="true" className="w-full animate-pulse space-y-2">
            <div className="h-4 w-40 rounded-md bg-surface-subtle" />
            <div className="h-4 w-56 rounded-md bg-surface-subtle" />
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold">Gói hiện tại: {subscription.plan.name}</p>
            {subscriptionSummary(subscription).map((line) => (
              <p key={line} className="mt-0.5 text-sm text-muted">
                {line}
              </p>
            ))}
          </div>
        )}
      </Card>

      {notice && (
        <p role="status" className="mb-4 rounded-card border border-success bg-success-muted px-3 py-2 text-sm text-success-foreground">
          {notice}
        </p>
      )}

      <h2 className="mb-3 text-sm font-semibold">Lịch sử giao dịch</h2>

      {listError ? (
        <Card role="alert" className="p-5">
          <p className="flex items-center gap-2 text-sm text-danger">
            <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" /> {listError}
          </p>
          <Button variant="secondary" className="mt-3" onClick={retryList}>
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Thử lại
          </Button>
        </Card>
      ) : items === null ? (
        <div aria-busy="true" className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent" /> Đang tải…
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Chưa có giao dịch nào"
          description="Bản ghi sẽ xuất hiện khi bạn bắt đầu đăng ký gói trả phí."
          action={
            <Link href="/plans" className={PRIMARY_LINK}>
              Xem các gói
            </Link>
          }
        />
      ) : (
        <>
          <RowList cols={COLS}>
            <RowHeader>
              <span>Ngày</span>
              <span>Mô tả</span>
              <span className="md:text-right">Số tiền</span>
              <span>Kết quả</span>
              <span className="sr-only">Thao tác</span>
            </RowHeader>
            {items.map((item) => (
              <RowItem key={item.id}>
                <RowTime>{formatDate(item.createdAt)}</RowTime>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                    <span className="truncate">{item.description ?? item.planName ?? "Giao dịch"}</span>
                    {KIND_LABEL[item.kind] && <Badge variant="info">{KIND_LABEL[item.kind]}</Badge>}
                  </span>
                  {item.retryOf && (
                    <span className="text-xs text-muted">Thử lại sau lần thất bại {formatDate(item.retryOf.createdAt)}</span>
                  )}
                </div>
                <span className="text-[13px] font-semibold tabular-nums md:text-right">{formatVnd(item.amountVnd)}</span>
                <span>
                  <Badge variant={DISPLAY_STATUS_VARIANT[item.displayStatus]}>
                    {DISPLAY_STATUS_LABEL[item.displayStatus]}
                  </Badge>
                </span>
                <div className="flex flex-wrap items-center gap-3 md:justify-end">
                  {item.displayStatus === "success" && item.kind === "charge" && (
                    <Link href={`/billing/receipts/${item.id}`} className="text-[13px] text-accent hover:underline">
                      Biên lai
                    </Link>
                  )}
                  <Button variant="ghost" disabled={item.hasOpenIssue} onClick={() => setIssueTarget(item)}>
                    {item.hasOpenIssue ? "Đã có sự cố đang xử lý" : "Báo sự cố"}
                  </Button>
                </div>
              </RowItem>
            ))}
          </RowList>

          {nextCursor && (
            <div className="mt-4 flex flex-col items-center gap-2">
              {moreError && (
                <p role="alert" className="text-sm text-danger">
                  {moreError}
                </p>
              )}
              <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? "Đang tải…" : "Tải thêm"}
              </Button>
            </div>
          )}
        </>
      )}

      {issueTarget && (
        <ReportIssueDialog
          transaction={issueTarget}
          text={issueDrafts[issueTarget.id] ?? ""}
          onTextChange={(text) => setIssueDrafts((drafts) => ({ ...drafts, [issueTarget.id]: text }))}
          onClose={() => setIssueTarget(null)}
          onReported={() => markReported(issueTarget.id)}
        />
      )}
    </div>
  );
}
