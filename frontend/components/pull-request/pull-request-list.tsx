"use client";

import { GitPullRequest } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { RowHeader, RowItem, RowList, RowTime, RowTitle } from "../ui/row-list";
import { formatRelativeTime } from "../../lib/format-date";
import { formatAuthorName } from "../../lib/format-name";
import type { PullRequestListItem, PullRequestStatus } from "../../lib/api-client";
import { useI18n } from "../../context/i18n-context";
import { tNow } from "../../lib/i18n";

const COLS = "md:grid-cols-[minmax(0,1fr)_minmax(0,auto)_96px_96px]";

const STATUS_VARIANT: Record<PullRequestStatus, "success" | "info" | "neutral"> = {
  open: "success",
  merged: "info",
  closed: "neutral",
};

export const STATUS_KEY = {
  open: "pr.statusOpen",
  merged: "pr.statusMerged",
  closed: "pr.statusClosed",
} as const;

const EMPTY_KEYS = {
  open: ["pullRequestsPage.emptyOpenTitle", "pullRequestsPage.emptyOpenBody"],
  merged: ["pullRequestsPage.emptyMergedTitle", "pullRequestsPage.emptyMergedBody"],
  closed: ["pullRequestsPage.emptyClosedTitle", "pullRequestsPage.emptyClosedBody"],
} as const;

export function PullRequestStatusBadge({ status }: { status: PullRequestStatus }) {
  const { t } = useI18n();
  return <Badge variant={STATUS_VARIANT[status]}>{t(STATUS_KEY[status])}</Badge>;
}

function routeLabel(item: PullRequestListItem): string {
  const deletedProject = tNow("pr.deletedProject");
  const deletedBranch = tNow("pr.deletedBranch");
  const source = `${item.sourceProjectName ?? deletedProject} / ${item.sourceBranchName ?? deletedBranch}`;
  const target = `${item.targetProjectName ?? deletedProject} / ${item.targetBranchName ?? deletedBranch}`;
  return `${source} → ${target}`;
}

export function PullRequestList({ items, status }: { items: PullRequestListItem[]; status?: PullRequestStatus }) {
  const { t } = useI18n();
  if (items.length === 0) {
    const [titleKey, bodyKey] = status ? EMPTY_KEYS[status] : (["pr.emptyTitle", "pr.emptyBody"] as const);
    return <EmptyState icon={GitPullRequest} title={t(titleKey)} description={t(bodyKey)} />;
  }

  return (
    <RowList cols={COLS}>
      <RowHeader>
        <span>{t("pr.colPr")}</span>
        <span>{t("pr.colStatus")}</span>
        <span>{t("pr.colNew")}</span>
        <span className="text-right">{t("pr.colCreated")}</span>
      </RowHeader>
      {items.map((item) => (
        <RowItem key={item.id}>
          <RowTitle
            href={`/pull-requests/${item.id}`}
            name={`#${item.number} ${item.title}`}
            meta={`${formatAuthorName(item.author)} · ${routeLabel(item)}`}
            leading={<GitPullRequest aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />}
          />
          <span className="flex flex-wrap items-center gap-1.5">
            <PullRequestStatusBadge status={item.status} />
            {item.status === "open" && item.hasConflicts && <Badge variant="warning">{t("pr.conflicts")}</Badge>}
            {!item.applicable && <Badge variant="neutral">{t("pr.notApplicable")}</Badge>}
          </span>
          <span className="font-mono text-xs text-muted">
            <span className="md:hidden">{t("pr.dlgNewCommits", { n: item.newCommitCount })}</span>
            <span className="hidden md:inline">{item.newCommitCount}</span>
          </span>
          <RowTime>{formatRelativeTime(item.createdAt)}</RowTime>
        </RowItem>
      ))}
    </RowList>
  );
}

export function PullRequestListState({
  loading,
  error,
  items,
  status,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  items: PullRequestListItem[];
  status: PullRequestStatus;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  if (loading) {
    return (
      <div role="status" aria-label={t("pullRequestsPage.loading")} className="overflow-hidden rounded-card border border-border">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-[68px] animate-pulse items-center gap-3 border-b border-border bg-surface-subtle/40 px-3.5 last:border-b-0 motion-reduce:animate-none">
            <div className="h-4 w-4 rounded bg-surface-muted" />
            <div className="h-3 w-2/5 rounded bg-surface-muted" />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/30 bg-danger-muted p-4 text-sm text-danger">
        <p>{error}</p>
        <Button variant="secondary" onClick={onRetry}>
          {t("ui.retry")}
        </Button>
      </div>
    );
  }
  return <PullRequestList items={items} status={status} />;
}
