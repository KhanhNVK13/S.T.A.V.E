"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Printer, RefreshCw, TriangleAlert } from "lucide-react";
import { getTransactionReceipt } from "../../lib/api-billing";
import { useI18n } from "../../context/i18n-context";
import { displayStatusLabel } from "../../lib/billing-history";
import { formatDateTime } from "../../lib/format-date";
import { formatVnd } from "../../lib/format-vnd";
import { useApiResource } from "../../lib/use-api-resource";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

const PRINT_CSS = `@media print {
  #app-sidebar, aside, nav, header, footer, [data-print-hide] { display: none !important; }
  html, body, main { height: auto !important; overflow: visible !important; }
}`;

export function ReceiptView({ id }: { id: string }) {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const { data, loading, error } = useApiResource(
    () => getTransactionReceipt(id),
    [id, attempt],
    t("bill.receipt.loadFailed"),
  );

  return (
    <div className="mx-auto max-w-xl px-5 py-8 print:max-w-none print:p-0">
      <style>{PRINT_CSS}</style>
      <div data-print-hide className="mb-4 flex items-center justify-between gap-3">
        <Link href="/billing" className="text-sm text-accent hover:underline">
          {t("bill.receipt.back")}
        </Link>
        {data?.available && (
          <Button onClick={() => window.print()}>
            <Printer aria-hidden="true" className="h-3.5 w-3.5" /> {t("bill.receipt.print")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent" /> {t("bill.loading")}
        </div>
      ) : error || !data ? (
        <Card role="alert" className="p-5">
          <p className="flex items-center gap-2 text-sm text-danger">
            <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" /> {error ?? t("bill.receipt.loadFailedShort")}
          </p>
          <Button variant="secondary" className="mt-3" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> {t("bill.retry")}
          </Button>
        </Card>
      ) : (
        <Card className="p-6 print:border-0 print:p-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">STAVE</p>
          <h1 className="mt-1 text-xl font-semibold">{data.available ? t("bill.receipt.title") : t("bill.receipt.detailsTitle")}</h1>

          {!data.available && (
            <p role="status" className="mt-3 rounded-md border border-warning bg-warning-muted p-3 text-sm text-warning-foreground">
              {t("bill.receipt.unavailable")}
            </p>
          )}

          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
            <dt className="text-muted">{t("bill.receipt.orderCode")}</dt>
            <dd className="font-mono">{data.receipt?.orderCode ?? data.details.orderCode ?? "—"}</dd>
            <dt className="text-muted">{t("bill.receipt.time")}</dt>
            <dd className="font-mono">{formatDateTime(data.details.createdAt)}</dd>
            <dt className="text-muted">{t("bill.receipt.content")}</dt>
            <dd>{data.details.description ?? "—"}</dd>
            <dt className="text-muted">{t("bill.receipt.plan")}</dt>
            <dd>{data.details.planName ?? "—"}</dd>
            {data.receipt && (
              <>
                <dt className="text-muted">{t("bill.receipt.payer")}</dt>
                <dd>{data.receipt.payerName ?? "—"}</dd>
              </>
            )}
            <dt className="text-muted">{t("bill.receipt.status")}</dt>
            <dd>{displayStatusLabel(data.details.displayStatus)}</dd>
            <dt className="text-muted">{t("bill.receipt.amount")}</dt>
            <dd className="text-base font-semibold tabular-nums">{formatVnd(data.details.amountVnd)}</dd>
          </dl>

          {data.available && (
            <p className="mt-6 text-xs text-muted">
              {t("bill.receipt.footer")}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
