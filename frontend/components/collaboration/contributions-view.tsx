"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleUser,
  GitCommitVertical,
  Music2,
  RotateCw,
  TriangleAlert,
  Users,
} from "lucide-react";
import type {
  ContributorSummaryItem,
  ContributionCommitItem,
  ProjectContributionsDto,
} from "@stave/shared-types";
import { getProjectContributions } from "../../lib/api-collab";
import { listProjectBranches } from "../../lib/api-client";
import type { Branch } from "../../lib/api-client";
import { apiErrorMessage } from "../../lib/error-message";
import { formatRelativeTime } from "../../lib/format-date";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { INPUT_CLASS } from "../ui/form";
import { useI18n } from "../../context/i18n-context";
import { tNow } from "../../lib/i18n";

interface ContributionsViewProps {
  projectId: string;
  /** 6: bấm 1 commit → mở trong lịch sử phiên bản (tab "Commit"). */
  onSelectCommit?: (commitId: string) => void;
}

function displayName(c: ContributorSummaryItem): string {
  if (c.isDeletedAccount) return tNow("contrib.deletedUser");
  return c.displayName?.trim() || c.username?.trim() || tNow("contrib.user");
}

/** Một card thống kê của 1 tác giả (số commit, nốt thêm/xoá/sửa, track). */
function ContributorCard({
  contributor,
  selected,
  onSelect,
}: {
  contributor: ContributorSummaryItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const active = contributor.lastActivityAt
    ? formatRelativeTime(contributor.lastActivityAt)
    : t("contrib.unknown");

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-card border bg-surface p-4 text-left transition-colors ${
        selected
          ? "border-accent bg-accent-muted/30"
          : "border-border hover:border-border-strong"
      }`}
    >
      {/* Identity + state badges */}
      <div className="flex items-center gap-3">
        {contributor.isDeletedAccount ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted">
            <CircleUser className="h-4 w-4" />
          </div>
        ) : (
          <Avatar
            id={contributor.userId}
            label={displayName(contributor)}
            imageUrl={contributor.avatarUrl}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-[13px] font-semibold">
              {displayName(contributor)}
            </p>
            {contributor.isOwner && <Badge variant="info">{t("contrib.owner")}</Badge>}
            {contributor.isRemoved && (
              <Badge variant="warning">{t("contrib.left")}</Badge>
            )}
          </div>
          {contributor.username && !contributor.isDeletedAccount && (
            <p className="truncate font-mono text-xs text-muted">
              @{contributor.username}
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted">
            {t("contrib.lastActive", { when: active })}
          </p>
        </div>
      </div>

      {/* 4 stat tiles */}
      <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
        <div className="rounded-md bg-surface-subtle px-1 py-1.5">
          <p className="font-mono text-[15px] font-bold">
            {contributor.totalCommits}
          </p>
          <p className="text-xs leading-tight text-muted">{t("contrib.commits")}</p>
        </div>
        <div className="rounded-md bg-success-muted px-1 py-1.5">
          <p className="font-mono text-[15px] font-bold text-success-foreground">
            +{contributor.notesAdded}
          </p>
          <p className="text-xs leading-tight text-success-foreground">
            {t("contrib.notesAdded")}
          </p>
        </div>
        <div className="rounded-md bg-danger-muted px-1 py-1.5">
          <p className="font-mono text-[15px] font-bold text-danger">
            -{contributor.notesRemoved}
          </p>
          <p className="text-xs leading-tight text-danger">
            {t("contrib.notesRemoved")}
          </p>
        </div>
        <div className="rounded-md bg-warning-muted px-1 py-1.5">
          <p className="font-mono text-[15px] font-bold text-warning-foreground">
            {contributor.notesModified}
          </p>
          <p className="text-xs leading-tight text-warning-foreground">
            {t("contrib.notesModified")}
          </p>
        </div>
      </div>

      {/* Track distribution bars (no chart library — width % divs only). */}
      {contributor.trackDistribution.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("contrib.trackDist")}
          </p>
          {contributor.trackDistribution.map((d) => (
            <div key={d.trackId} className="flex items-center gap-2">
              <span
                className="w-24 shrink-0 truncate text-xs text-muted"
                title={d.trackName}
              >
                {d.trackName}
              </span>
              <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded bg-surface-muted">
                <div
                  className="h-2 rounded bg-accent"
                  style={{ width: `${d.percentage}%` }}
                />
              </div>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted">
                {d.changeCount} · {d.percentage}%
              </span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

/** A single row of the "recent commits" list. */
function CommitRow({
  commit,
  authorName,
  onOpen,
}: {
  commit: ContributionCommitItem;
  authorName: string | null;
  onOpen: (commit: ContributionCommitItem) => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => onOpen(commit)}
      title={t("contrib.openInHistory")}
      className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-surface-subtle"
    >
      <GitCommitVertical className="h-3.5 w-3.5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{commit.message}</p>
        <p className="text-xs text-muted">
          {authorName ?? t("contrib.user")} · {formatRelativeTime(commit.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
        <span className="text-success-foreground">+{commit.notesAdded}</span>
        <span className="text-danger">-{commit.notesRemoved}</span>
        {commit.notesModified > 0 && (
          <span className="text-warning-foreground">
            ~{commit.notesModified}
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * UC-65 — per-author contribution stats for a project. Read-only view
 * (BR-72): everything is derived on-the-fly from commit snapshots.
 *
 * States (all in Vietnamese, no silent failures):
 * - loading: skeleton cards + track bars;
 * - 2.E1: red/yellow warning box + "Thử lại" — NEVER "0 đóng góp";
 * - 4.E1: EmptyState "chưa có dữ liệu".
 */
export function ContributionsView({
  projectId,
  onSelectCommit,
}: ContributionsViewProps) {
  const { t } = useI18n();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [selectedAuthor, setSelectedAuthor] = useState<string>("");

  const [data, setData] = useState<ProjectContributionsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Load contributions for the current filters — also the "Thử lại" action. */
  const loadContributions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getProjectContributions(projectId, {
        branchId: branchId || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined,
        userId: selectedAuthor || undefined,
      });
      setData(result);
    } catch (err) {
      // 2.E1: surface "try again" — never fall back to "0 contributions".
      setData(null);
      setError(
        apiErrorMessage(err, tNow("contrib.loadFail")),
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, branchId, from, to, selectedAuthor]);

  // One effect owns both loads (pattern: async IIFE, setState only after
  // the first await so there is no synchronous set in the effect body).
  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Branch dropdown first (optional filter — a failure just means no
      // filter; the contributions load still runs with an empty list).
      let branchList: Branch[] = [];
      try {
        branchList = await listProjectBranches(projectId);
      } catch {
        branchList = [];
      }
      if (cancelled) return;
      setBranches(branchList);
      void loadContributions();
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, loadContributions]);

  const nameByAuthor = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const c of data?.contributors ?? []) {
      map.set(c.userId, c.isDeletedAccount ? tNow("contrib.deletedUser") : displayName(c));
    }
    return map;
  }, [data]);

  const visibleContributors = useMemo(
    () =>
      selectedAuthor
        ? (data?.contributors ?? []).filter((c) => c.userId === selectedAuthor)
        : (data?.contributors ?? []),
    [data, selectedAuthor],
  );

  function handleAuthorSelect(userId: string) {
    // Click the same card again → clear the single-author filter (5.1).
    setSelectedAuthor((cur) => (cur === userId ? "" : userId));
  }

  // ── Loading: skeleton cards + track bars ───────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 w-44 animate-pulse rounded-md bg-surface-subtle" />
          <div className="h-9 w-40 animate-pulse rounded-md bg-surface-subtle" />
          <div className="h-9 w-40 animate-pulse rounded-md bg-surface-subtle" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-52 animate-pulse rounded-card border border-border bg-surface-subtle"
            />
          ))}
        </div>
      </div>
    );
  }

  // ── 2.E1: error box (never "0 đóng góp") ───────────────────────
  if (error) {
    return (
      <div className="rounded-card border border-danger/20 bg-danger-muted p-8 text-center">
        <TriangleAlert className="mx-auto h-7 w-7 text-danger" />
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {t("contrib.loadFail")}
        </p>
        <p className="mt-1 text-[13px] text-muted">{error}</p>
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => void loadContributions()}>
            <RotateCw className="h-3.5 w-3.5" /> {t("ui.retry")}
          </Button>
        </div>
      </div>
    );
  }

  // ── 4.E1: no contributions yet ─────────────────────────────────
  if (!data || data.contributors.length === 0) {
    return (
      <EmptyState
        icon={Music2}
        title={t("contrib.empty")}
        description={t("contrib.emptyHint")}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Filters: branch / time window / author */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="branch-filter"
          aria-label={t("contrib.filterBranch")}
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className={`${INPUT_CLASS} h-9 w-44`}
        >
          <option value="">{t("contrib.allBranches")}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.is_default ? t("contrib.defaultSuffix") : ""}
            </option>
          ))}
        </select>

        <input
          type="date"
          name="filter-from"
          aria-label={t("contrib.fromDate")}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={`${INPUT_CLASS} h-9 w-40`}
        />
        <span className="text-xs text-muted">{t("contrib.to")}</span>
        <input
          type="date"
          name="filter-to"
          aria-label={t("contrib.toDate")}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className={`${INPUT_CLASS} h-9 w-40`}
        />

        {(branchId || from || to) && (
          <Button
            variant="ghost"
            onClick={() => {
              setBranchId("");
              setFrom("");
              setTo("");
            }}
          >
            {t("contrib.clear")}
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <Users className="h-3.5 w-3.5" />
          {t("contrib.people", { n: data.contributors.length })}
        </div>
      </div>

      {/* Contributor cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {visibleContributors.map((c) => (
          <ContributorCard
            key={c.userId}
            contributor={c}
            selected={selectedAuthor === c.userId}
            onSelect={() => handleAuthorSelect(c.userId)}
          />
        ))}
      </div>

      {/* Recent commits (filtered by the selected author when set) */}
      {data.recentCommits.length > 0 && (
        <section className="rounded-card border border-border bg-surface">
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
              {selectedAuthor
                ? t("contrib.selectedCommits")
                : t("contrib.recentCommits")}
            </h2>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {data.recentCommits.map((commit) => (
              <CommitRow
                key={commit.id}
                commit={commit}
                authorName={nameByAuthor.get(commit.authorId) ?? null}
                onOpen={(c) => onSelectCommit?.(c.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
