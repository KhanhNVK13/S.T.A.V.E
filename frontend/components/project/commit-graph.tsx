"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import Link from "next/link";
import { GitCompareArrows, History, Tag as TagIcon } from "lucide-react";
import type { Branch, BranchHistoryCommit } from "../../lib/api-client";
import { formatAuthorName } from "../../lib/format-name";
import { formatRelativeTime } from "../../lib/format-date";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { SkyEmpty } from "./sky-state";
import { CommitCompare } from "./commit-compare";
import { useI18n } from "../../context/i18n-context";

const MAX_COMMITS = 200;
const STEP_X = 48;
const LANE_H = 60;
const PAD_X = 30;
const PAD_Y = 24;
const STAFF_GAP = 4;
const LABEL_W = 136;

const LANE_COLORS = [
  "var(--foreground)",
  "var(--accent)",
  "var(--success)",
  "var(--metal)",
  "var(--muted-foreground)",
];

function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

function curve(fromX: number, fromY: number, toX: number, toY: number): string {
  if (fromY === toY) return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  const mid = (fromX + toX) / 2;
  return `M ${fromX} ${fromY} C ${mid} ${fromY}, ${mid} ${toY}, ${toX} ${toY}`;
}

export function CommitGraph({
  projectId,
  branches,
  commits,
  emptyAction,
}: {
  projectId: string;
  branches: Branch[];
  commits: Map<string, BranchHistoryCommit>;
  emptyAction?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comparing, setComparing] = useState<{ base: BranchHistoryCommit; target: BranchHistoryCommit } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const orderedBranches = useMemo(
    () => [...branches].sort((a, b) => Number(b.is_default) - Number(a.is_default)),
    [branches],
  );
  const lanes = useMemo(() => new Map(orderedBranches.map((b, i) => [b.id, i])), [orderedBranches]);
  const total = commits.size;
  const rows = useMemo(
    () =>
      [...commits.values()]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, MAX_COMMITS)
        .reverse(),
    [commits],
  );
  const colOf = useMemo(() => new Map(rows.map((c, i) => [c.id, i])), [rows]);
  const heads = useMemo(
    () => new Set(branches.map((b) => b.head_commit_id).filter((id): id is string => !!id)),
    [branches],
  );
  const activeHead = useMemo(
    () => branches.find((b) => b.is_active)?.head_commit_id ?? null,
    [branches],
  );
  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [rows.length]);

  if (rows.length === 0) {
    return <SkyEmpty compact title={t("bgraph.empty")} action={emptyAction} />;
  }

  const laneCount = Math.max(1, orderedBranches.length);
  const width = PAD_X * 2 + Math.max(0, rows.length - 1) * STEP_X;
  const height = PAD_Y * 2 + (laneCount - 1) * LANE_H + STAFF_GAP * 4;
  const x = (col: number) => PAD_X + col * STEP_X;
  const laneY = (lane: number) => PAD_Y + STAFF_GAP * 2 + lane * LANE_H;
  const laneOf = (c: BranchHistoryCommit) => lanes.get(c.branch_id) ?? 0;

  const selected = selectedId ? (commits.get(selectedId) ?? null) : null;
  const selectedParent = selected?.parent_commit_id ? (commits.get(selected.parent_commit_id) ?? null) : null;
  const tabStop = selectedId ? (colOf.get(selectedId) ?? rows.length - 1) : rows.length - 1;

  const edges: ReactNode[] = [];
  rows.forEach((commit, col) => {
    const lane = laneOf(commit);
    const cx = x(col);
    const cy = laneY(lane);
    if (commit.parent_commit_id) {
      const parentCol = colOf.get(commit.parent_commit_id);
      if (parentCol !== undefined) {
        edges.push(
          <path
            key={`p-${commit.id}`}
            d={curve(x(parentCol), laneY(laneOf(rows[parentCol])), cx, cy)}
            fill="none"
            strokeWidth={1.5}
            style={{ stroke: laneColor(lane) }}
          />,
        );
      } else {
        edges.push(
          <path
            key={`p-${commit.id}`}
            d={`M 0 ${cy} L ${cx} ${cy}`}
            fill="none"
            strokeWidth={1.5}
            strokeDasharray="2 4"
            style={{ stroke: laneColor(lane) }}
          />,
        );
      }
    }
    if (commit.merged_from_commit_id) {
      const sourceCol = colOf.get(commit.merged_from_commit_id);
      if (sourceCol !== undefined) {
        const source = rows[sourceCol];
        edges.push(
          <path
            key={`m-${commit.id}`}
            d={curve(x(sourceCol), laneY(laneOf(source)), cx, cy)}
            fill="none"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            style={{ stroke: laneColor(laneOf(source)) }}
          />,
        );
      }
    }
  });

  function focusCol(col: number) {
    scrollRef.current?.querySelectorAll<SVGGElement>("[data-commit]")[col]?.focus();
  }

  function nearestInLane(col: number, lane: number): number {
    let best = -1;
    let bestDist = Infinity;
    rows.forEach((c, i) => {
      if (laneOf(c) !== lane) return;
      const dist = Math.abs(i - col);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }

  function onCommitKey(e: KeyboardEvent<SVGGElement>, col: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = Math.min(rows.length - 1, col + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, col - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = rows.length - 1;
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const lane = laneOf(rows[col]) + (e.key === "ArrowDown" ? 1 : -1);
      if (lane >= 0 && lane < laneCount) next = nearestInLane(col, lane);
      if (next < 0) return;
    } else return;
    e.preventDefault();
    focusCol(next);
  }

  function describe(commit: BranchHistoryCommit): string {
    const flags = [
      heads.has(commit.id) ? t("projectPage.graphFlagHead") : "",
      commit.merged_from_commit_id ? t("projectPage.graphFlagMerge") : "",
      commit.id === activeHead ? t("projectPage.graphFlagActive") : "",
    ].join("");
    return `${t("projectPage.graphCommitLabel", {
      id: commit.id.slice(0, 7),
      message: commit.message,
      branch: branchName.get(commit.branch_id) ?? "",
      author: formatAuthorName(commit.author),
      when: formatRelativeTime(commit.created_at),
    })}${flags}`;
  }

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface-subtle">
      <div className="flex">
        <ul
          className="relative z-10 shrink-0 border-r border-border bg-surface-subtle"
          style={{ width: LABEL_W, height }}
          aria-label={t("bgraph.branches")}
        >
          {orderedBranches.map((b, i) => (
            <li
              key={b.id}
              className="absolute left-0 right-0 flex items-center gap-1.5 px-3 text-xs"
              style={{ top: laneY(i) - 10, height: 20 }}
              title={b.is_default ? t("bgraph.defaultSuffix", { name: b.name }) : b.name}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: laneColor(i) }}
                aria-hidden="true"
              />
              <span className="truncate font-mono">{b.name}</span>
              {b.is_active && (
                <span className="shrink-0 text-accent" title={t("projectPage.graphActiveTitle")}>
                  ●<span className="sr-only">{t("projectPage.graphActiveTitle")}</span>
                </span>
              )}
            </li>
          ))}
        </ul>

        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block"
            role="group"
            aria-label={t("projectPage.graphLabel")}
          >
            <g aria-hidden="true">
              {orderedBranches.map((b, lane) =>
                [-2, -1, 0, 1, 2].map((k) => (
                  <line
                    key={`${b.id}-${k}`}
                    x1={0}
                    x2={width}
                    y1={laneY(lane) + k * STAFF_GAP}
                    y2={laneY(lane) + k * STAFF_GAP}
                    className="stroke-border"
                    strokeWidth={1}
                    opacity={0.8}
                  />
                )),
              )}
              {edges}
            </g>
            <g>
              {rows.map((commit, col) => {
                const lane = laneOf(commit);
                const color = laneColor(lane);
                const isHead = heads.has(commit.id);
                const isMerge = !!commit.merged_from_commit_id;
                const isSelected = commit.id === selectedId;
                return (
                  <g
                    key={commit.id}
                    transform={`translate(${x(col)} ${laneY(lane)})`}
                    data-commit
                    role="button"
                    tabIndex={col === tabStop ? 0 : -1}
                    aria-pressed={isSelected}
                    aria-label={describe(commit)}
                    className="group cursor-pointer outline-none"
                    onClick={() => setSelectedId(commit.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(commit.id);
                      } else onCommitKey(e, col);
                    }}
                  >
                    <circle r={16} fill="transparent" />
                    <circle r={isHead ? 12 : 9} style={{ fill: color }} opacity={0.18} />
                    <circle
                      r={isHead ? 5.5 : 4.2}
                      strokeWidth={1.6}
                      style={{ stroke: color, fill: isMerge ? "var(--background)" : color }}
                    />
                    {isHead && (
                      <circle r={9} fill="none" strokeWidth={1.2} style={{ stroke: color }} />
                    )}
                    {commit.id === activeHead && (
                      <text
                        y={-18}
                        textAnchor="middle"
                        className="fill-foreground font-mono text-xs"
                        fontSize={12}
                        aria-hidden="true"
                      >
                        {t("projectPage.graphHead")}
                      </text>
                    )}
                    <circle
                      r={14}
                      fill="none"
                      strokeWidth={1.6}
                      className={`stroke-foreground motion-safe:transition-opacity motion-safe:duration-200 ${
                        isSelected ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <circle
                      r={17}
                      fill="none"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      className="stroke-accent opacity-0 group-focus-visible:opacity-100"
                    />
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      <div
        aria-live="polite"
        className="flex min-h-[64px] flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-3.5 py-3 text-xs"
      >
        {selected ? (
          <>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{selected.message}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
                <span className="font-mono text-accent">{selected.id.slice(0, 7)}</span>
                <span>{formatAuthorName(selected.author)}</span>
                <span className="font-mono">{branchName.get(selected.branch_id)}</span>
                <span>
                  {new Date(selected.created_at).toLocaleString(locale, {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {selected.tags.map((tag) => (
                  <Badge key={tag.id} variant="neutral">
                    <TagIcon className="h-3 w-3" /> {tag.name}
                  </Badge>
                ))}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={!selectedParent}
                title={selectedParent ? t("projectPage.graphCompareTitle") : t("projectPage.graphCompareNone")}
                onClick={() => selectedParent && setComparing({ base: selectedParent, target: selected })}
              >
                <GitCompareArrows className="h-3.5 w-3.5" /> {t("projectPage.graphCompare")}
              </Button>
              <Link href={`/projects/${projectId}?tab=commits&branch=${selected.branch_id}`}>
                <Button variant="secondary" title={t("bgraph.historyTitle")}>
                  <History className="h-3.5 w-3.5" /> {t("bgraph.history")}
                </Button>
              </Link>
            </div>
          </>
        ) : (
          <p className="text-muted">{t("projectPage.graphHint")}</p>
        )}
      </div>

      {total > MAX_COMMITS && (
        <p className="border-t border-border px-3.5 py-2 text-xs text-muted">
          {t("bgraph.showing", { max: MAX_COMMITS, total })}
        </p>
      )}

      {comparing && (
        <CommitCompare
          projectId={projectId}
          base={comparing.base}
          target={comparing.target}
          onClose={() => setComparing(null)}
        />
      )}
    </div>
  );
}
