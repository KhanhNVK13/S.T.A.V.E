"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Eye, Loader2 } from "lucide-react";
import type { ReportDetail, ReportGroup, ReportStatusFilter } from "@stave/shared-types";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { RowItem, RowTime } from "../../../components/ui/row-list";
import { REPORT_REASON_LABEL_KEYS } from "../../../components/moderation/reason-labels";
import { getReportDetails } from "../../../lib/admin-reports-api";
import { useI18n } from "../../../context/i18n-context";
import { DismissForm } from "./dismiss-form";
import { ReportDetailItem, formatWhen } from "./report-detail-item";

export const REPORT_COLS = "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_64px_136px_auto]";

type DetailsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; items: ReportDetail[] }
  | { kind: "error" };

export function ReportGroupRow({
  group,
  status,
  onView,
  onDismissed,
}: {
  group: ReportGroup;
  status: ReportStatusFilter;
  onView: (projectId: string) => void;
  onDismissed: (count: number) => void;
}) {
  const { t, locale } = useI18n();
  const projectId = group.projectExists ? group.projectId : null;
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<DetailsState>({ kind: "idle" });
  const mounted = useRef(true);
  const panelId = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function loadDetails(id: string) {
    setDetails({ kind: "loading" });
    getReportDetails(id, status)
      .then((items) => {
        if (mounted.current) setDetails({ kind: "ready", items });
      })
      .catch(() => {
        if (mounted.current) setDetails({ kind: "error" });
      });
  }

  async function refreshDetails(id: string) {
    try {
      const items = await getReportDetails(id, status);
      if (mounted.current) setDetails({ kind: "ready", items });
    } catch {
      if (mounted.current) setDetails({ kind: "error" });
    }
  }

  function toggle() {
    if (projectId === null) return;
    const next = !expanded;
    setExpanded(next);
    if (next && details.kind === "idle") loadDetails(projectId);
  }

  const count = t("rpt.reportCount", { n: group.reportCount });

  return (
    <>
      <RowItem>
        <div className="flex min-w-0 flex-col gap-1">
          {projectId !== null ? (
            <span className="truncate text-[13px] font-semibold">{group.projectName}</span>
          ) : (
            <>
              <span className="truncate text-[13px] font-semibold">{t("rpt.orphanTitle")}</span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="warning">{t("rpt.orphaned")}</Badge>
                <span className="text-xs text-muted">{t("rpt.orphanedHint")}</span>
              </span>
            </>
          )}
          {group.resolution && (
            <span className="break-words text-xs text-muted">
              {t("rpt.decisionNote", { note: group.resolutionNote || t("rpt.noNote") })}
            </span>
          )}
        </div>

        <span className="truncate text-[13px] text-muted">
          {projectId !== null ? (group.ownerDisplayName ?? t("rpt.ownerUnknown")) : "—"}
        </span>

        <div className="flex flex-wrap gap-1.5">
          {group.reasons.map((entry) => (
            <Badge key={entry.reason} variant="neutral">
              {t(REPORT_REASON_LABEL_KEYS[entry.reason])}
              {entry.count > 1 && <span className="ml-1 font-mono">×{entry.count}</span>}
            </Badge>
          ))}
        </div>

        <span className="font-mono text-xs">{group.reportCount}</span>

        <RowTime>
          <time dateTime={group.latestAt}>{formatWhen(group.latestAt, locale)}</time>
        </RowTime>

        {projectId !== null && (
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <Button variant="ghost" onClick={toggle} aria-expanded={expanded} aria-controls={panelId}>
              {expanded ? (
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {count}
            </Button>
            <Button variant="secondary" onClick={() => onView(projectId)}>
              <Eye aria-hidden="true" className="h-3.5 w-3.5" /> {t("rpt.viewProject")}
            </Button>
          </div>
        )}
      </RowItem>

      {projectId !== null && expanded && (
        <div id={panelId} className="border-b border-border bg-surface-subtle/40 px-3.5 py-3 last:border-b-0">
          {details.kind === "loading" && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-accent" />
              {t("rpt.detailsLoading")}
            </p>
          )}
          {details.kind === "error" && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-xs text-danger"
            >
              <span>{t("rpt.detailsFail")}</span>
              <Button variant="secondary" onClick={() => loadDetails(projectId)}>
                {t("ui.retry")}
              </Button>
            </div>
          )}
          {details.kind === "ready" && status === "open" && (
            <DismissForm
              projectId={projectId}
              items={details.items}
              onRefresh={() => refreshDetails(projectId)}
              onDismissed={onDismissed}
            />
          )}
          {details.kind === "ready" && status !== "open" && (
            <ul className="flex flex-col gap-3">
              {details.items.map((item) => (
                <ReportDetailItem key={item.id} item={item} />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
