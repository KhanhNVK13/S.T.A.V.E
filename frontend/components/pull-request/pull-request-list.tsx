"use client";

import { GitPullRequest } from "lucide-react";
import { Badge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";
import { RowHeader, RowItem, RowList, RowTime, RowTitle } from "../ui/row-list";
import { formatRelativeTime } from "../../lib/format-date";
import { formatAuthorName } from "../../lib/format-name";
import type { PullRequestListItem, PullRequestStatus } from "../../lib/api-client";
import { useI18n } from "../../context/i18n-context";
import { tNow } from "../../lib/i18n";

const COLS = "md:grid-cols-[minmax(0,1fr)_112px_96px_96px]";

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

export function PullRequestList({ items }: { items: PullRequestListItem[] }) {
  const { t } = useI18n();
  if (items.length === 0) {
    return (
      <EmptyState
        icon={GitPullRequest}
        title={t("pr.emptyTitle")}
        description={t("pr.emptyBody")}
      />
    );
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
          />
          <span className="flex flex-wrap items-center gap-1.5">
            <PullRequestStatusBadge status={item.status} />
            {item.status === "open" && item.hasConflicts && <Badge variant="warning">{t("pr.conflicts")}</Badge>}
            {!item.applicable && <Badge variant="neutral">{t("pr.notApplicable")}</Badge>}
          </span>
          <span className="font-mono text-xs text-muted">{item.newCommitCount}</span>
          <RowTime>{formatRelativeTime(item.createdAt)}</RowTime>
        </RowItem>
      ))}
    </RowList>
  );
}
