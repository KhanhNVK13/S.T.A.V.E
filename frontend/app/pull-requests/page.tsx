"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "../../components/require-auth";
import { PageHeader } from "../../components/ui/page-header";
import { Button } from "../../components/ui/button";
import { Tabs } from "../../components/ui/tabs";
import { PullRequestList, STATUS_LABEL } from "../../components/pull-request/pull-request-list";
import { listPullRequests } from "../../lib/api-client";
import type { PullRequestListItem, PullRequestStatus } from "../../lib/api-client";
import { apiErrorMessage } from "../../lib/error-message";

type View = "incoming" | "created";

const VIEW_TABS: Array<{ id: View; label: string }> = [
  { id: "incoming", label: "Đến tôi" },
  { id: "created", label: "Tôi đã tạo" },
];

const STATUS_TABS: Array<{ id: PullRequestStatus; label: string }> = [
  { id: "open", label: STATUS_LABEL.open },
  { id: "merged", label: STATUS_LABEL.merged },
  { id: "closed", label: STATUS_LABEL.closed },
];

function PullRequestsView() {
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
      setError(apiErrorMessage(err, "Không tải được danh sách pull request."));
    } finally {
      setLoading(false);
    }
  }, [view, status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp danh sách khi đổi bộ lọc
    void load();
  }, [load]);

  return (
    <div className="mx-auto min-h-full max-w-page px-5 py-8">
      <PageHeader
        title="Pull request"
        breadcrumbs={[{ label: "Tài khoản" }]}
        description="Đề xuất đưa thay đổi từ bản fork trở lại dự án gốc, và các đề xuất gửi tới dự án của bạn."
      />

      <Tabs tabs={VIEW_TABS} active={view} onChange={(id) => setView(id as View)} />

      <div className="mt-4 flex flex-col gap-4">
        <Tabs tabs={STATUS_TABS} active={status} onChange={(id) => setStatus(id as PullRequestStatus)} />

        {loading && <div className="h-16 animate-pulse rounded-card border border-border bg-surface-subtle" />}

        {!loading && error && (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/30 bg-danger-muted p-4 text-sm text-danger">
            <p>{error}</p>
            <Button variant="secondary" onClick={() => void load()}>
              Thử lại
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
