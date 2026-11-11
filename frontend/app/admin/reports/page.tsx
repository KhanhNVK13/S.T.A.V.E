"use client";

import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import type { ReportGroup, ReportStatusFilter } from "@stave/shared-types";
import { PageHeader } from "../../../components/ui/page-header";
import { Tabs } from "../../../components/ui/tabs";
import { RowHeader, RowList } from "../../../components/ui/row-list";
import { EmptyState } from "../../../components/ui/empty-state";
import { Button } from "../../../components/ui/button";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { Toast } from "../../../components/ui/toast";
import { ADMIN_REPORTS_PAGE_SIZE, listReportGroups, restoreReportedProject } from "../../../lib/admin-reports-api";
import { ApiError } from "../../../lib/api-client";
import { useApiResource } from "../../../lib/use-api-resource";
import { useI18n } from "../../../context/i18n-context";
import type { TKey } from "../../../lib/i18n";
import { DismissReportsDialog } from "./dismiss-reports-dialog";
import { ProjectPreviewDialog } from "./project-preview-dialog";
import { RemoveProjectDialog } from "./remove-project-dialog";
import { REPORT_COLS, ReportGroupRow } from "./report-group-row";

const TABS = [
  { id: "open", label: "rpt.tabOpen", emptyTitle: "rpt.emptyOpenTitle", emptyDesc: "rpt.emptyOpenDesc" },
  { id: "upheld", label: "rpt.tabUpheld", emptyTitle: "rpt.emptyUpheldTitle", emptyDesc: "rpt.emptyUpheldDesc" },
  {
    id: "dismissed",
    label: "rpt.tabDismissed",
    emptyTitle: "rpt.emptyDismissedTitle",
    emptyDesc: "rpt.emptyDismissedDesc",
  },
] as const satisfies readonly {
  id: ReportStatusFilter;
  label: TKey;
  emptyTitle: TKey;
  emptyDesc: TKey;
}[];

export default function AdminReportsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<ReportStatusFilter>("open");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ReportGroup | null>(null);
  const [dismissing, setDismissing] = useState<ReportGroup | null>(null);
  const [restoring, setRestoring] = useState<ReportGroup | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error } = useApiResource(
    () => listReportGroups(tab, page),
    [tab, page, reload],
    t("rpt.loadFail"),
  );

  const activeTab = TABS.find((entry) => entry.id === tab) ?? TABS[0];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.limit || ADMIN_REPORTS_PAGE_SIZE))) : 1;

  function changeTab(id: string) {
    setTab(id as ReportStatusFilter);
    setPage(1);
  }

  function finish(message: string) {
    setRemoving(null);
    setDismissing(null);
    setNotice(message);
    setReload((n) => n + 1);
  }

  async function confirmRestore() {
    if (!restoring?.projectId) return;
    setRestoreBusy(true);
    setRestoreError(null);
    try {
      await restoreReportedProject(restoring.projectId);
      setRestoring(null);
      setNotice(t("rpt.restoreDone"));
      setReload((n) => n + 1);
    } catch (err) {
      setRestoreError(err instanceof ApiError && err.status === 410 ? t("rpt.restoreExpired") : t("rpt.restoreErr"));
    } finally {
      setRestoreBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={t("rpt.admTitle")} description={t("rpt.admDesc")} />

      <Tabs tabs={TABS.map((entry) => ({ id: entry.id, label: t(entry.label) }))} active={tab} onChange={changeTab} />

      <div role="tabpanel" aria-label={t(activeTab.label)} className="mt-4">
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
            <Button variant="secondary" onClick={() => setReload((n) => n + 1)}>
              {t("ui.retry")}
            </Button>
          </div>
        ) : data && data.items.length === 0 ? (
          <EmptyState icon={Flag} title={t(activeTab.emptyTitle)} description={t(activeTab.emptyDesc)} />
        ) : data ? (
          <>
            <RowList cols={REPORT_COLS}>
              <RowHeader>
                <span>{t("rpt.colProject")}</span>
                <span>{t("rpt.colOwner")}</span>
                <span>{t("rpt.colReasons")}</span>
                <span>{t("rpt.colReports")}</span>
                <span>{t("rpt.colLatest")}</span>
                <span />
              </RowHeader>
              {data.items.map((group) => (
                <ReportGroupRow
                  key={`${tab}:${page}:${group.projectId ?? "orphan"}`}
                  group={group}
                  status={tab}
                  onView={setViewing}
                  onRemove={setRemoving}
                  onDismiss={setDismissing}
                  onRestore={(target) => {
                    setRestoreError(null);
                    setRestoring(target);
                  }}
                />
              ))}
            </RowList>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
                  {t("rpt.prev")}
                </Button>
                <span className="font-mono text-xs text-muted">{t("rpt.pageOf", { page, total: totalPages })}</span>
                <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((n) => n + 1)}>
                  {t("rpt.next")}
                </Button>
              </div>
            )}
          </>
        ) : null}
      </div>

      {viewing && <ProjectPreviewDialog projectId={viewing} onClose={() => setViewing(null)} />}

      {removing?.projectId && (
        <RemoveProjectDialog
          projectId={removing.projectId}
          projectName={removing.projectName ?? ""}
          onClose={() => setRemoving(null)}
          onRemoved={() => finish(t("rpt.rmDone"))}
        />
      )}

      {dismissing?.projectId && (
        <DismissReportsDialog
          projectId={dismissing.projectId}
          projectName={dismissing.projectName ?? ""}
          onClose={() => setDismissing(null)}
          onDismissed={() => finish(t("rpt.dismissDone"))}
        />
      )}

      <ConfirmDialog
        open={restoring !== null}
        title={t("rpt.restoreTitle", { name: restoring?.projectName ?? "" })}
        message={t("rpt.restoreMsg")}
        confirmLabel={t("rpt.restoreConfirm")}
        loading={restoreBusy}
        error={restoreError}
        onConfirm={confirmRestore}
        onCancel={() => setRestoring(null)}
      />

      {notice && <Toast message={notice} variant="success" onDismiss={() => setNotice(null)} />}
    </div>
  );
}
