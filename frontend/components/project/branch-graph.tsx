"use client";

import { Tag as TagIcon } from "lucide-react";
import type { Branch, BranchHistoryCommit } from "../../lib/api-client";
import { APP_LOCALE } from "../../lib/format-date";

const MAX_COMMITS = 60;
const LANE_W = 22;
const ROW_H = 32;
const PAD = 14;
const RADIUS = 5;

const LANE_COLORS = [
  "var(--accent)",
  "var(--success)",
  "var(--warning)",
  "var(--metal)",
  "var(--border-strong)",
];

function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

export function BranchGraph({
  branches,
  commits,
}: {
  branches: Branch[];
  commits: Map<string, BranchHistoryCommit>;
}) {
  const lanes = new Map(branches.map((b, i) => [b.id, i]));
  const all = [...commits.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const rows = all.slice(0, MAX_COMMITS);
  const rowOf = new Map(rows.map((c, i) => [c.id, i]));
  const heads = new Set(branches.map((b) => b.head_commit_id).filter((id): id is string => !!id));

  const laneCount = Math.max(1, branches.length);
  const width = PAD * 2 + (laneCount - 1) * LANE_W;
  const height = rows.length * ROW_H;
  const x = (lane: number) => PAD + lane * LANE_W;
  const y = (row: number) => row * ROW_H + ROW_H / 2;
  const laneOf = (c: BranchHistoryCommit) => lanes.get(c.branch_id) ?? 0;

  function curve(fromX: number, fromY: number, toX: number, toY: number): string {
    if (fromX === toX) return `M ${fromX} ${fromY} L ${toX} ${toY}`;
    const mid = (fromY + toY) / 2;
    return `M ${fromX} ${fromY} C ${fromX} ${mid}, ${toX} ${mid}, ${toX} ${toY}`;
  }

  const edges: React.ReactNode[] = [];
  rows.forEach((commit, row) => {
    const lane = laneOf(commit);
    const cx = x(lane);
    const cy = y(row);
    if (commit.parent_commit_id) {
      const parentRow = rowOf.get(commit.parent_commit_id);
      if (parentRow !== undefined) {
        const parent = rows[parentRow];
        edges.push(
          <path
            key={`p-${commit.id}`}
            d={curve(cx, cy, x(laneOf(parent)), y(parentRow))}
            fill="none"
            strokeWidth={2}
            style={{ stroke: laneColor(lane) }}
          />,
        );
      } else {
        edges.push(
          <path
            key={`p-${commit.id}`}
            d={`M ${cx} ${cy} L ${cx} ${height}`}
            fill="none"
            strokeWidth={2}
            strokeDasharray="2 4"
            style={{ stroke: laneColor(lane) }}
          />,
        );
      }
    }
    if (commit.merged_from_commit_id) {
      const sourceRow = rowOf.get(commit.merged_from_commit_id);
      if (sourceRow !== undefined) {
        const source = rows[sourceRow];
        edges.push(
          <path
            key={`m-${commit.id}`}
            d={curve(cx, cy, x(laneOf(source)), y(sourceRow))}
            fill="none"
            strokeWidth={2}
            strokeDasharray="4 3"
            style={{ stroke: laneColor(laneOf(source)) }}
          />,
        );
      }
    }
  });

  if (rows.length === 0) {
    return (
      <p className="rounded-card border border-border bg-surface-subtle px-4 py-3 text-xs text-muted">
        Chưa có commit nào để vẽ đồ thị. Mở trình soạn nhạc và commit để bắt đầu.
      </p>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface">
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-b border-border bg-surface-subtle px-3.5 py-2.5 text-xs">
        {branches.map((b, i) => (
          <li key={b.id} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: laneColor(i) }}
              aria-hidden="true"
            />
            <span className="font-mono">{b.name}</span>
            {b.is_default && <span className="text-muted">(mặc định)</span>}
          </li>
        ))}
      </ul>

      <div className="flex overflow-x-auto px-1 py-1">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="shrink-0"
          aria-hidden="true"
        >
          {edges}
          {rows.map((commit, row) => {
            const color = laneColor(laneOf(commit));
            const isHead = heads.has(commit.id);
            return (
              <circle
                key={commit.id}
                cx={x(laneOf(commit))}
                cy={y(row)}
                r={RADIUS}
                strokeWidth={2}
                style={{ stroke: color, fill: isHead ? color : "var(--surface)" }}
              />
            );
          })}
        </svg>

        <ul className="min-w-0 flex-1" aria-label="Các commit, mới nhất trước">
          {rows.map((commit) => (
            <li
              key={commit.id}
              className="flex items-center gap-2 pl-2 text-xs"
              style={{ height: ROW_H }}
            >
              <span className="truncate font-medium">{commit.message}</span>
              {commit.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="flex shrink-0 items-center gap-0.5 rounded bg-surface-muted px-1.5 py-0.5 text-muted"
                >
                  <TagIcon className="h-3 w-3" /> {tag.name}
                </span>
              ))}
              <span className="ml-auto shrink-0 font-mono text-accent">{commit.id.slice(0, 7)}</span>
              <span className="hidden shrink-0 text-muted sm:inline">
                {new Date(commit.created_at).toLocaleString(APP_LOCALE, {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {all.length > MAX_COMMITS && (
        <p className="border-t border-border px-3.5 py-2 text-xs text-muted">
          Hiển thị {MAX_COMMITS} commit mới nhất trong tổng số {all.length}.
        </p>
      )}
    </div>
  );
}
