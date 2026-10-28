"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GitPullRequest } from "lucide-react";
import { Button } from "../ui/button";
import { Tabs } from "../ui/tabs";
import { getPullRequestTargetBranches, listProjectPullRequests } from "../../lib/api-client";
import type { PullRequestListItem, PullRequestStatus } from "../../lib/api-client";
import { apiErrorMessage } from "../../lib/error-message";
import { NewPullRequestDialog } from "./new-pull-request-dialog";
import { PullRequestList, STATUS_LABEL } from "./pull-request-list";

const STATUS_TABS: Array<{ id: PullRequestStatus; label: string }> = [
  { id: "open", label: STATUS_LABEL.open },
  { id: "merged", label: STATUS_LABEL.merged },
  { id: "closed", label: STATUS_LABEL.closed },
];

export function ProjectPullRequests({
  projectId,
  canCreate,
}: {
  projectId: string;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<PullRequestStatus>("open");
  const [items, setItems] = useState<PullRequestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isFork, setIsFork] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listProjectPullRequests(projectId, status));
    } catch (err) {
      setError(apiErrorMessage(err, "Không tải được danh sách pull request."));
    } finally {
      setLoading(false);
    }
  }, [projectId, status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp danh sách khi đổi bộ lọc
    void load();
  }, [load]);

  useEffect(() => {
    if (!canCreate) return;
    let cancelled = false;
    getPullRequestTargetBranches(projectId)
      .then(() => {
        if (!cancelled) setIsFork(true);
      })
      .catch(() => {
        if (!cancelled) setIsFork(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, canCreate]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs tabs={STATUS_TABS} active={status} onChange={(id) => setStatus(id as PullRequestStatus)} />
        {canCreate && isFork && (
          <Button onClick={() => setDialogOpen(true)}>
            <GitPullRequest className="h-3.5 w-3.5" /> Pull request mới
          </Button>
        )}
      </div>

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

      {dialogOpen && (
        <NewPullRequestDialog
          projectId={projectId}
          onClose={() => setDialogOpen(false)}
          onCreated={(id) => router.push(`/pull-requests/${id}`)}
        />
      )}
    </div>
  );
}
