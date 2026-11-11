"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "../../components/require-auth";
import { PageHeader } from "../../components/ui/page-header";
import { Tabs } from "../../components/ui/tabs";
import { PullRequestListState, STATUS_KEY } from "../../components/pull-request/pull-request-list";
import { listPullRequests } from "../../lib/api-client";
import type { PullRequestListItem, PullRequestStatus } from "../../lib/api-client";
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { useI18n } from "../../context/i18n-context";

type View = "incoming" | "created";

function PullRequestsView() {
  const { t } = useI18n();
  const [view, setView] = useState<View>("incoming");
  const [status, setStatus] = useState<PullRequestStatus>("open");
  const [items, setItems] = useState<PullRequestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorSource | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listPullRequests({ view, status }));
    } catch (err) {
      setError(errorSource(err, "pr.loadFail"));
    } finally {
      setLoading(false);
    }
  }, [view, status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp danh sách khi đổi bộ lọc
    void load();
  }, [load]);

  const viewTabs: Array<{ id: View; label: string }> = [
    { id: "incoming", label: t("prl.incoming") },
    { id: "created", label: t("prl.created") },
  ];
  const statusTabs: Array<{ id: PullRequestStatus; label: string }> = [
    { id: "open", label: t(STATUS_KEY.open) },
    { id: "merged", label: t(STATUS_KEY.merged) },
    { id: "closed", label: t(STATUS_KEY.closed) },
  ];

  return (
    <div className="mx-auto min-h-full max-w-page px-5 py-8">
      <PageHeader
        title={t("prl.title")}
        breadcrumbs={[{ label: t("nt.crumb") }]}
        description={t("prl.description")}
      />

      <div role="group" aria-label={t("pullRequestsPage.viewLabel")}>
        <Tabs tabs={viewTabs} active={view} onChange={(id) => setView(id as View)} />
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <div role="group" aria-label={t("pullRequestsPage.statusLabel")}>
          <Tabs tabs={statusTabs} active={status} onChange={(id) => setStatus(id as PullRequestStatus)} />
        </div>

        <PullRequestListState loading={loading} error={renderError(error)} items={items} status={status} onRetry={() => void load()} />
      </div>
    </div>
  );
}

export default function PullRequestsPage() {
  return (
    <RequireAuth>
      <PullRequestsView />
    </RequireAuth>
  );
}
