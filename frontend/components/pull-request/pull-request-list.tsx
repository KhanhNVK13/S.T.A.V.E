"use client";

import { GitPullRequest } from "lucide-react";
import { Badge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";
import { RowHeader, RowItem, RowList, RowTime, RowTitle } from "../ui/row-list";
import { formatRelativeTime } from "../../lib/format-date";
import { formatAuthorName } from "../../lib/format-name";
import type { PullRequestListItem, PullRequestStatus } from "../../lib/api-client";

const COLS = "md:grid-cols-[minmax(0,1fr)_112px_96px_96px]";

export const STATUS_LABEL: Record<PullRequestStatus, string> = {
  open: "Đang mở",
  merged: "Đã hợp nhất",
  closed: "Đã đóng",
};

const STATUS_VARIANT: Record<PullRequestStatus, "success" | "info" | "neutral"> = {
  open: "success",
  merged: "info",
  closed: "neutral",
};

export function PullRequestStatusBadge({ status }: { status: PullRequestStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

function routeLabel(item: PullRequestListItem): string {
  const source = `${item.sourceProjectName ?? "dự án đã xoá"} / ${item.sourceBranchName ?? "nhánh đã xoá"}`;
  const target = `${item.targetProjectName ?? "dự án đã xoá"} / ${item.targetBranchName ?? "nhánh đã xoá"}`;
  return `${source} → ${target}`;
}

export function PullRequestList({ items }: { items: PullRequestListItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={GitPullRequest}
        title="Chưa có pull request nào."
        description="Pull request là đề xuất đưa các thay đổi trong bản fork của bạn trở lại dự án gốc, để chủ dự án xem và hợp nhất."
      />
    );
  }

  return (
    <RowList cols={COLS}>
      <RowHeader>
        <span>Pull request</span>
        <span>Trạng thái</span>
        <span>Commit mới</span>
        <span className="text-right">Tạo lúc</span>
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
            {item.status === "open" && item.hasConflicts && <Badge variant="warning">Có xung đột</Badge>}
            {!item.applicable && <Badge variant="neutral">Không còn áp dụng</Badge>}
          </span>
          <span className="font-mono text-xs text-muted">{item.newCommitCount}</span>
          <RowTime>{formatRelativeTime(item.createdAt)}</RowTime>
        </RowItem>
      ))}
    </RowList>
  );
}
