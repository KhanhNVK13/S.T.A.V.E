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
import { RemoveDialog } from "./remove-dialog";
import { RestoreDialog } from "./restore-dialog";

export const REPORT_COLS = "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_64px_136px_auto]";

type DetailsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; items: ReportDetail[] }
  | { kind: "error" };

function formatWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export function ReportGroupRow({
  group,
  status,
  onView,
  onRemoved,
  onRestored,
}: {
  group: ReportGroup;
  status: ReportStatusFilter;
  onView: (projectId: string) => void;
  onRemoved: () => void;
  onRestored: () => void;
}) {
  const { t, locale } = useI18n();
  const projectId = group.projectExists ? group.projectId : null;
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<DetailsState>({ kind: "idle" });
  const [removeOpen, setRemoveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
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
          {group.hiddenAt ? (
            <span className="break-words text-xs text-warning-foreground">
              {group.restorable
                ? t("rmv.removedLabel", {
                    date: formatWhen(group.retainedUntil ?? group.hiddenAt, locale),
                  })
                : t("rmv.deadlinePassed")}
            </span>
          ) : null}
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
            {status === "open" && (
              <Button variant="danger" onClick={() => setRemoveOpen(true)}>
                {t("rmv.removeButton")}
              </Button>
            )}
            {status === "upheld" && group.restorable !== false && group.hiddenAt !== undefined && (
              <Button variant="secondary" onClick={() => setRestoreOpen(true)}>
                {t("rmv.restoreButton")}
              </Button>
            )}
          </div>
        )}
      </RowItem>

      {removeOpen && projectId !== null && (
        <RemoveDialog projectId={projectId} onClose={() => setRemoveOpen(false)} onRemoved={onRemoved} />
      )}
      {restoreOpen && projectId !== null && (
        <RestoreDialog projectId={projectId} onClose={() => setRestoreOpen(false)} onRestored={onRestored} />
      )}

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
          {details.kind === "ready" && (
            <ul className="flex flex-col gap-3">
              {details.items.map((item) => (
                <li key={item.id} className="flex flex-col gap-1.5">
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
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
