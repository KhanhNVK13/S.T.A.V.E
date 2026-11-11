"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleX, Clock, Loader2, RefreshCw, SearchX, TriangleAlert } from "lucide-react";
import { getMySubscription, getPaymentOrder, syncPaymentOrder } from "../../lib/api-billing";
import { useI18n } from "../../context/i18n-context";
import { ApiError } from "../../lib/api-client";
import { formatVnd } from "../../lib/format-vnd";
import { startPaymentPoll, type PaymentPollState } from "../../lib/payment-result-poller";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { PageHeader } from "../ui/page-header";
import { PRIMARY_LINK } from "./link-styles";

interface PaymentResultViewProps {
  orderCode: number | null;
  returnTo: string | null;
}

export function PaymentResultView({ orderCode, returnTo }: PaymentResultViewProps) {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PaymentPollState>({ phase: "checking", order: null });
  const [activationMissing, setActivationMissing] = useState(false);

  useEffect(() => {
    if (orderCode === null) return;
    return startPaymentPoll({
      getOrder: () => getPaymentOrder(orderCode),
      syncOrder: () => syncPaymentOrder(orderCode),
      onChange: setState,
      isNotFound: (err) => err instanceof ApiError && err.status === 404,
    });
  }, [orderCode, attempt]);

  useEffect(() => {
    if (state.phase !== "success") return;
    let cancelled = false;
    getMySubscription()
      .then((subscription) => {
        if (!cancelled) setActivationMissing(!subscription.hasPaidAccess);
      })
      .catch(() => {
        if (!cancelled) setActivationMissing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.phase]);

  function checkAgain() {
    setState({ phase: "checking", order: null });
    setAttempt((n) => n + 1);
  }

  const phase = orderCode === null ? "notFound" : state.phase;
  const order = state.order;
  const plansHref = returnTo ? `/plans?returnTo=${encodeURIComponent(returnTo)}` : "/plans";

  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <PageHeader title={t("bill.result.title")} />

      {phase === "checking" && (
        <Card role="status" aria-live="polite" className="flex items-start gap-3 p-5">
          <Loader2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-accent" />
          <div>
            <p className="font-semibold">{t("bill.result.checking")}</p>
            <p className="mt-1 text-sm text-muted">{t("bill.result.checkingHint")}</p>
          </div>
        </Card>
      )}

      {phase === "success" && (
        <Card role="status" className="p-5">
          <p className="flex items-center gap-2 font-semibold text-success-foreground">
            <CircleCheck aria-hidden="true" className="h-5 w-5" /> {t("bill.result.success")}
          </p>
          {order && (
            <p className="mt-2 text-sm text-muted">
              {t("bill.result.successBody", { amount: formatVnd(order.amountVnd), plan: order.planName ?? t("bill.result.paidPlan") })}
            </p>
          )}
          {activationMissing && (
            <p role="alert" className="mt-3 rounded-md border border-warning bg-warning-muted p-3 text-sm text-warning-foreground">
              {t("bill.result.activationMissing")}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link href={returnTo ?? "/plans"} className={PRIMARY_LINK}>
              {t("bill.result.continue")}
            </Link>
            <Link href="/billing" className="text-sm text-accent hover:underline">
              {t("bill.result.viewHistory")}
            </Link>
          </div>
        </Card>
      )}

      {phase === "failed" && (
        <Card role="alert" className="p-5">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <CircleX aria-hidden="true" className="h-5 w-5" /> {t("bill.result.failedTitle")}
          </p>
          <p className="mt-2 text-sm text-muted">
            {order?.status === "expired"
              ? t("bill.result.expired")
              : t("bill.result.failedBody")}
          </p>
          <div className="mt-5">
            <Link href={plansHref} className={PRIMARY_LINK}>
              {t("bill.retry")}
            </Link>
          </div>
        </Card>
      )}

      {phase === "waiting" && (
        <Card role="status" className="p-5">
          <p className="flex items-center gap-2 font-semibold">
            <Clock aria-hidden="true" className="h-5 w-5 text-warning-foreground" /> {t("bill.result.waitingTitle")}
          </p>
          <p className="mt-2 text-sm text-muted">
            {t("bill.result.waitingBody")}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={checkAgain}>
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> {t("bill.result.checkAgain")}
            </Button>
            <Link href="/billing" className="text-sm text-accent hover:underline">
              {t("bill.history.link")}
            </Link>
          </div>
        </Card>
      )}

      {phase === "error" && (
        <Card role="alert" className="p-5">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <TriangleAlert aria-hidden="true" className="h-5 w-5" /> {t("bill.result.errorTitle")}
          </p>
          <p className="mt-2 text-sm text-muted">{t("bill.result.errorBody")}</p>
          <Button variant="secondary" className="mt-5" onClick={checkAgain}>
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> {t("bill.result.checkAgain")}
          </Button>
        </Card>
      )}

      {phase === "notFound" && (
        <Card role="alert" className="p-5">
          <p className="flex items-center gap-2 font-semibold">
            <SearchX aria-hidden="true" className="h-5 w-5 text-muted" /> {t("bill.result.notFoundTitle")}
          </p>
          <p className="mt-2 text-sm text-muted">{t("bill.result.notFoundBody")}</p>
          <Link href="/plans" className="mt-4 inline-block text-sm text-accent hover:underline">
            {t("bill.result.backToPlans")}
          </Link>
        </Card>
      )}
    </div>
  );
}
