"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GitPullRequest } from "lucide-react";
import { Button } from "../ui/button";
import { Tabs } from "../ui/tabs";
import { getPullRequestTargetBranches, listProjectPullRequests } from "../../lib/api-client";
import type { PullRequestListItem, PullRequestStatus } from "../../lib/api-client";
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { NewPullRequestDialog } from "./new-pull-request-dialog";
import { PullRequestListState, STATUS_KEY } from "./pull-request-list";
import { useI18n } from "../../context/i18n-context";

export function ProjectPullRequests({
  projectId,
  canCreate,
}: {
  projectId: string;
  canCreate: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [status, setStatus] = useState<PullRequestStatus>("open");
  const [items, setItems] = useState<PullRequestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorSource | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isFork, setIsFork] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listProjectPullRequests(projectId, status));
    } catch (err) {
      setError(errorSource(err, "pr.loadFail"));
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

  const statusTabs: Array<{ id: PullRequestStatus; label: string }> = [
    { id: "open", label: t(STATUS_KEY.open) },
    { id: "merged", label: t(STATUS_KEY.merged) },
    { id: "closed", label: t(STATUS_KEY.closed) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs tabs={statusTabs} active={status} onChange={(id) => setStatus(id as PullRequestStatus)} />
        {canCreate && isFork && (
          <Button onClick={() => setDialogOpen(true)}>
            <GitPullRequest className="h-3.5 w-3.5" /> {t("pr.new")}
          </Button>
        )}
      </div>

      <PullRequestListState loading={loading} error={renderError(error)} items={items} status={status} onRetry={() => void load()} />

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
