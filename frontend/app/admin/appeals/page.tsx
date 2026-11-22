"use client";

import { useState } from "react";
import { Gavel, Loader2 } from "lucide-react";
import type { AppealStatus, ModerationAppeal } from "@stave/shared-types";
import { PageHeader } from "../../../components/ui/page-header";
import { Tabs } from "../../../components/ui/tabs";
import { EmptyState } from "../../../components/ui/empty-state";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Toast } from "../../../components/ui/toast";
import { ADMIN_APPEALS_PAGE_SIZE, listAppeals } from "../../../lib/appeals-api";
import { formatDateTime } from "../../../lib/format-date";
import { useApiResource } from "../../../lib/use-api-resource";
import { useI18n } from "../../../context/i18n-context";
import type { TKey } from "../../../lib/i18n";
import { ResolveAppealDialog } from "./resolve-appeal-dialog";

const TABS = [
  { id: "pending", label: "aap.tabPending" },
  { id: "upheld", label: "aap.tabUpheld" },
  { id: "rejected", label: "aap.tabRejected" },
] as const satisfies readonly { id: AppealStatus; label: TKey }[];

export default function AdminAppealsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<AppealStatus>("pending");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [resolving, setResolving] = useState<{ appeal: ModerationAppeal; decision: "uphold" | "reject" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error } = useApiResource(() => listAppeals(tab, page), [tab, page, reload], t("aap.loadError"));

  const activeTab = TABS.find((entry) => entry.id === tab) ?? TABS[0];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.limit || ADMIN_APPEALS_PAGE_SIZE))) : 1;

  function changeTab(id: string) {
    setTab(id as AppealStatus);
    setPage(1);
  }

  return (
    <div>
      <PageHeader title={t("aap.title")} description={t("aap.description")} />

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
              {t("aap.retry")}
            </Button>
          </div>
        ) : data && data.items.length === 0 ? (
          <EmptyState icon={Gavel} title={t("aap.empty")} />
        ) : data ? (
          <>
            <ul className="flex flex-col gap-3">
              {data.items.map((appeal) => (
                <li key={appeal.id}>
                  <Card className="flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-[13px] font-semibold">{appeal.projectName ?? t("aap.unknownProject")}</span>
                      <time dateTime={appeal.createdAt} className="font-mono text-xs text-muted">
                        {formatDateTime(appeal.createdAt)}
                      </time>
                    </div>
                    <p className="text-xs text-muted">{t("aap.by", { name: appeal.appellantDisplayName ?? "—" })}</p>
                    {appeal.removalReason && (
                      <p className="break-words text-xs text-muted">{t("aap.removalReason", { reason: appeal.removalReason })}</p>
                    )}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold">{t("aap.statement")}</span>
                      <p className="whitespace-pre-wrap break-words text-[13px]">{appeal.statement}</p>
                    </div>
                    {appeal.resolutionNote && (
                      <p className="break-words text-xs text-muted">{t("aap.note", { note: appeal.resolutionNote })}</p>
                    )}
                    {appeal.status === "pending" && (
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <Button variant="secondary" onClick={() => setResolving({ appeal, decision: "reject" })}>
                          {t("aap.reject")}
                        </Button>
                        <Button onClick={() => setResolving({ appeal, decision: "uphold" })}>{t("aap.uphold")}</Button>
                      </div>
                    )}
                  </Card>
                </li>
              ))}
            </ul>

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

      {resolving && (
        <ResolveAppealDialog
          appeal={resolving.appeal}
          decision={resolving.decision}
          onClose={() => setResolving(null)}
          onResolved={(message) => {
            setResolving(null);
            setNotice(message);
            setReload((n) => n + 1);
          }}
        />
      )}

      {notice && <Toast message={notice} variant="success" onDismiss={() => setNotice(null)} />}
    </div>
  );
}
