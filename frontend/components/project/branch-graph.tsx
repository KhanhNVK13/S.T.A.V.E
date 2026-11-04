"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import Link from "next/link";
import { History, Tag as TagIcon } from "lucide-react";
import type { Branch, BranchHistoryCommit } from "../../lib/api-client";
import { formatAuthorName } from "../../lib/format-name";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { SkyEmpty } from "./sky-state";
import { useI18n } from "../../context/i18n-context";

const MAX_COMMITS = 60;
const STEP_X = 48;
const LANE_H = 60;
const PAD_X = 30;
const PAD_Y = 22;
const STAFF_GAP = 4;
const LABEL_W = 128;

const LANE_COLORS = [
  "var(--accent)",
  "var(--success)",
  "var(--metal)",
  "var(--warning)",
  "var(--muted-foreground)",
];

function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

function dust(width: number, height: number) {
  const out: { x: number; y: number; r: number; o: number }[] = [];
  let a = 0x9e3779b9;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const count = Math.min(90, Math.round(width / 28));
  for (let i = 0; i < count; i++) {
    out.push({ x: rand() * width, y: rand() * height, r: 0.5 + rand() * 0.8, o: 0.15 + rand() * 0.25 });
  }
  return out;
}

export function BranchGraph({
  projectId,
  branches,
  commits,
}: {
  projectId: string;
  branches: Branch[];
  commits: Map<string, BranchHistoryCommit>;
}) {
  const { t, locale } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const starsRef = useRef<SVGGElement>(null);
  const edgesRef = useRef<SVGGElement>(null);

  const orderedBranches = useMemo(
    () => [...branches].sort((a, b) => Number(b.is_default) - Number(a.is_default)),
    [branches],
  );
  const lanes = useMemo(() => new Map(orderedBranches.map((b, i) => [b.id, i])), [orderedBranches]);
  const all = useMemo(
    () =>
      [...commits.values()].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [commits],
  );
  const rows = useMemo(() => all.slice(0, MAX_COMMITS).reverse(), [all]);
  const colOf = useMemo(() => new Map(rows.map((c, i) => [c.id, i])), [rows]);
  const heads = useMemo(
    () => new Set(branches.map((b) => b.head_commit_id).filter((id): id is string => !!id)),
    [branches],
  );
  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  const laneCount = Math.max(1, orderedBranches.length);
  const width = PAD_X * 2 + Math.max(0, rows.length - 1) * STEP_X;
  const height = PAD_Y * 2 + (laneCount - 1) * LANE_H + STAFF_GAP * 4;
  const x = (col: number) => PAD_X + col * STEP_X;
  const laneY = (lane: number) => PAD_Y + STAFF_GAP * 2 + lane * LANE_H;
  const laneOf = (c: BranchHistoryCommit) => lanes.get(c.branch_id) ?? 0;
  const backdrop = useMemo(() => dust(width, height), [width, height]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [rows.length]);

  useLayoutEffect(() => {
    if (rows.length === 0 || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timing = { duration: 800, easing: "cubic-bezier(0, 0, 0.2, 1)", fill: "backwards" as const };
    edgesRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], timing);
    starsRef.current?.querySelectorAll(":scope > g > g").forEach((node, i) => {
      node.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { ...timing, delay: Math.min(i, 30) * 25 },
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (rows.length === 0) {
    return (
      <SkyEmpty compact title={t("bgraph.empty")} />
    );
  }

  const selected = selectedId ? (commits.get(selectedId) ?? null) : null;

  function curve(fromX: number, fromY: number, toX: number, toY: number): string {
    if (fromY === toY) return `M ${fromX} ${fromY} L ${toX} ${toY}`;
    const mid = (fromX + toX) / 2;
    return `M ${fromX} ${fromY} C ${mid} ${fromY}, ${mid} ${toY}, ${toX} ${toY}`;
  }

  const edges: React.ReactNode[] = [];
  rows.forEach((commit, col) => {
    const lane = laneOf(commit);
    const cx = x(col);
    const cy = laneY(lane);
    if (commit.parent_commit_id) {
      const parentCol = colOf.get(commit.parent_commit_id);
      if (parentCol !== undefined) {
        const parent = rows[parentCol];
        edges.push(
          <path
            key={`p-${commit.id}`}
            d={curve(x(parentCol), laneY(laneOf(parent)), cx, cy)}
            fill="none"
            strokeWidth={1.4}
            style={{ stroke: laneColor(lane) }}
          />,
        );
      } else {
        edges.push(
          <path
            key={`p-${commit.id}`}
            d={`M 0 ${cy} L ${cx} ${cy}`}
            fill="none"
            strokeWidth={1.4}
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
            strokeWidth={1.4}
            strokeDasharray="4 3"
            style={{ stroke: laneColor(laneOf(source)) }}
          />,
        );
      }
    }
  });

  function onStarKey(e: KeyboardEvent<SVGGElement>, col: number) {
    let next = col;
    if (e.key === "ArrowRight") next = Math.min(rows.length - 1, col + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, col - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = rows.length - 1;
    else return;
    e.preventDefault();
    const target = scrollRef.current?.querySelectorAll<SVGGElement>("[data-star]")[next];
    target?.focus();
  }

  const tabStop = selectedId ? (colOf.get(selectedId) ?? rows.length - 1) : rows.length - 1;

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
            aria-label={t("bgraph.graphLabel")}
          >
            <g aria-hidden="true">
              {backdrop.map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r={d.r} className="fill-foreground" opacity={d.o} />
              ))}
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
            </g>
            <g ref={edgesRef} aria-hidden="true">
              {edges}
            </g>
            <g ref={starsRef}>
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
                    data-star
                    role="button"
                    tabIndex={col === tabStop ? 0 : -1}
                    aria-pressed={isSelected}
                    aria-label={t("bgraph.commitLabel", { id: commit.id.slice(0, 7), message: commit.message, branch: branchName.get(commit.branch_id) ?? "" })}
                    className="group cursor-pointer outline-none"
                    onClick={() => setSelectedId(commit.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(commit.id);
                      } else onStarKey(e, col);
                    }}
                  >
                    <g>
                      <circle r={16} fill="transparent" />
                      <circle r={isHead ? 12 : 9} style={{ fill: color }} opacity={0.16} />
                      <circle
                        r={isHead ? 5.5 : 4.2}
                        strokeWidth={1.6}
                        style={{ stroke: color, fill: isMerge ? "var(--background)" : color }}
                      />
                      <circle
                        r={10}
                        fill="none"
                        strokeWidth={1.4}
                        className={`stroke-foreground motion-safe:transition-opacity motion-safe:duration-300 ${
                          isSelected ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      <circle
                        r={14}
                        fill="none"
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        className="stroke-accent opacity-0 group-focus-visible:opacity-100"
                      />
                    </g>
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
            <Link href={`/projects/${projectId}?tab=commits&branch=${selected.branch_id}`}>
              <Button variant="secondary" title={t("bgraph.historyTitle")}>
                <History className="h-3.5 w-3.5" /> {t("bgraph.history")}
              </Button>
            </Link>
          </>
        ) : (
          <p className="text-muted">
            {t("bgraph.hint")}
          </p>
        )}
      </div>

      {all.length > MAX_COMMITS && (
        <p className="border-t border-border px-3.5 py-2 text-xs text-muted">
          {t("bgraph.showing", { max: MAX_COMMITS, total: all.length })}
        </p>
      )}
    </div>
  );
}
