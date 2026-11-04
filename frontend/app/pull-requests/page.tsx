"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "../../components/require-auth";
import { PageHeader } from "../../components/ui/page-header";
import { Button } from "../../components/ui/button";
import { Tabs } from "../../components/ui/tabs";
import { tNow } from "../../lib/i18n";
import { PullRequestList, STATUS_KEY } from "../../components/pull-request/pull-request-list";
import { listPullRequests } from "../../lib/api-client";
import type { PullRequestListItem, PullRequestStatus } from "../../lib/api-client";
import { apiErrorMessage } from "../../lib/error-message";
import { useI18n } from "../../context/i18n-context";

type View = "incoming" | "created";

function PullRequestsView() {
  const { t } = useI18n();
  const [view, setView] = useState<View>("incoming");
  const [status, setStatus] = useState<PullRequestStatus>("open");
  const [items, setItems] = useState<PullRequestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listPullRequests({ view, status }));
    } catch (err) {
      setError(apiErrorMessage(err, tNow("pr.loadFail")));
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

      <Tabs tabs={viewTabs} active={view} onChange={(id) => setView(id as View)} />

      <div className="mt-4 flex flex-col gap-4">
        <Tabs tabs={statusTabs} active={status} onChange={(id) => setStatus(id as PullRequestStatus)} />

        {loading && <div className="h-16 animate-pulse rounded-card border border-border bg-surface-subtle" />}

        {!loading && error && (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/30 bg-danger-muted p-4 text-sm text-danger">
            <p>{error}</p>
            <Button variant="secondary" onClick={() => void load()}>
              {t("ui.retry")}
            </Button>
          </div>
        )}

        {!loading && !error && <PullRequestList items={items} />}
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
