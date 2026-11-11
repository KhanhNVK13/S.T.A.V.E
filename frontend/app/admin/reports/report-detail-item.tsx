"use client";

import type { ReportDetail } from "@stave/shared-types";
import { Badge } from "../../../components/ui/badge";
import { REPORT_REASON_LABEL_KEYS } from "../../../components/moderation/reason-labels";
import { useI18n } from "../../../context/i18n-context";

export function formatWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export interface ReportSelection {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

export function ReportDetailItem({ item, selection }: { item: ReportDetail; selection?: ReportSelection }) {
  const { t, locale } = useI18n();
  return (
    <li className="flex gap-3">
      {selection && (
        <input
          type="checkbox"
          name="dismiss-report"
          aria-label={selection.label}
          checked={selection.checked}
          disabled={selection.disabled}
          onChange={(e) => selection.onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge variant="neutral">{t(REPORT_REASON_LABEL_KEYS[item.reason])}</Badge>
          {item.resolution && (
            <Badge variant={item.resolution === "upheld" ? "danger" : "neutral"}>
              {item.resolution === "upheld" ? t("rpt.resUpheld") : t("rpt.resDismissed")}
            </Badge>
          )}
          <span>
            {item.reporter?.displayName
              ? t("rpt.reportedBy", { name: item.reporter.displayName })
              : t("rpt.reporterUnknown")}
          </span>
          <time dateTime={item.createdAt} className="font-mono">
            {formatWhen(item.createdAt, locale)}
          </time>
        </div>
        {item.details ? (
          <p className="whitespace-pre-wrap break-words text-[13px]">{item.details}</p>
        ) : (
          <p className="text-xs text-muted">{t("rpt.noDetails")}</p>
        )}
      </div>
    </li>
  );
}
