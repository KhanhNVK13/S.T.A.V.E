"use client";

import { useEffect, useRef, useState } from "react";
import { DISMISS_REASON_MAX_LENGTH, type ReportDetail } from "@stave/shared-types";
import { Button } from "../../../components/ui/button";
import { INPUT_CLASS } from "../../../components/ui/form";
import { ApiError } from "../../../lib/api-client";
import { dismissReports } from "../../../lib/admin-reports-api";
import { useI18n } from "../../../context/i18n-context";
import { ReportDetailItem } from "./report-detail-item";

type Notice = "new" | "changed";

function readNewReportIds(err: ApiError): string[] {
  const ids = (err.body as { newReportIds?: unknown } | undefined)?.newReportIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

export function DismissForm({
  projectId,
  items,
  onRefresh,
  onDismissed,
}: {
  projectId: string;
  items: ReportDetail[];
  onRefresh: () => Promise<void>;
  onDismissed: (count: number) => void;
}) {
  const { t } = useI18n();
  const pending = items.filter((item) => item.status === "pending");
  const [deselected, setDeselected] = useState<ReadonlySet<string>>(new Set());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const selectedIds = pending.filter((item) => !deselected.has(item.id)).map((item) => item.id);
  const trimmed = reason.trim();
  const tooLong = trimmed.length > DISMISS_REASON_MAX_LENGTH;
  const canSubmit = selectedIds.length > 0 && trimmed.length > 0 && !tooLong && !submitting;

  function toggle(id: string, checked: boolean) {
    setDeselected((current) => {
      const next = new Set(current);
      if (checked) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!canSubmit || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await dismissReports(projectId, { reportIds: selectedIds, reason: trimmed });
      if (!mounted.current) return;
      onDismissed(result.dismissedCount);
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof ApiError && err.status === 409) {
        setNotice(readNewReportIds(err).length > 0 ? "new" : "changed");
        await onRefresh();
      } else {
        setError(t("rpt.dismissFail"));
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {pending.map((item, index) => (
          <ReportDetailItem
            key={item.id}
            item={item}
            selection={{
              checked: !deselected.has(item.id),
              disabled: submitting,
              label: t("rpt.selectReport", { n: index + 1 }),
              onChange: (checked) => toggle(item.id, checked),
            }}
          />
        ))}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
        className="flex flex-col gap-2 border-t border-border pt-3"
      >
        <p className="text-xs text-muted">{t("rpt.dismissIntro")}</p>

        {notice && (
          <div role="alert" className="rounded-card bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
            {t(notice === "new" ? "rpt.dismissNew" : "rpt.dismissChanged")}
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-card bg-danger-muted px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">{t("rpt.dismissReasonLabel")}</span>
          <textarea
            name="dismiss-reason"
            autoComplete="off"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("rpt.dismissReasonPlaceholder")}
            disabled={submitting}
            aria-invalid={tooLong || undefined}
            className={`${INPUT_CLASS} w-full resize-y`}
          />
        </label>
        <div className="flex items-start justify-between gap-3 text-xs">
          <span className={tooLong ? "text-danger" : "text-muted"}>
            {tooLong
              ? t("rpt.dismissTooLong", { max: DISMISS_REASON_MAX_LENGTH })
              : !canSubmit && !submitting
                ? t("rpt.dismissHint")
                : ""}
          </span>
          <span className={`font-mono ${tooLong ? "text-danger" : "text-muted"}`}>
            {t("rpt.counter", { n: trimmed.length, max: DISMISS_REASON_MAX_LENGTH })}
          </span>
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {submitting ? t("rpt.dismissing") : t("rpt.dismissButton")}
          </Button>
        </div>
      </form>
    </div>
  );
}
