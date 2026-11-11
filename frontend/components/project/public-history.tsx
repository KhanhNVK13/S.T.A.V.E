"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GitCompareArrows, Loader2, LogIn } from "lucide-react";
import { getPublicBranches, getPublicCommits, getPublicDiff } from "../../lib/api-public-history";
import type { PublicBranch, PublicCommitItem } from "../../lib/api-public-history";
import type { SnapshotDiff } from "../../lib/api-client";
import { pitchName } from "../../lib/midi-note-name";
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { formatRelativeTime } from "../../lib/format-date";
import { formatAuthorName } from "../../lib/format-name";
import { useI18n } from "../../context/i18n-context";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { INPUT_CLASS } from "../ui/form";
import { DiffDialogShell } from "./diff-dialog-shell";
import { DIFF_TEXT } from "./diff-ui";
import { buildBarChanges, countAffected } from "./compare-model";
import { SkyEmpty, SkyLoading } from "./sky-state";

const PAGE_SIZE = 20;

function PublicCompare({
  projectId,
  base,
  target,
  onClose,
}: {
  projectId: string;
  base: PublicCommitItem;
  target: PublicCommitItem;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [error, setError] = useState<ErrorSource | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPublicDiff(projectId, base.id, target.id)
      .then((result) => {
        if (!cancelled) {
          setError(null);
          setDiff(result);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorSource(err, "cmp.compareFail"));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, base.id, target.id, reloadKey]);

  const bars = useMemo(() => (diff ? buildBarChanges(diff, "all") : []), [diff]);
  const affected = useMemo(() => (diff ? countAffected(diff) : { bars: 0, tracks: 0 }), [diff]);
  const trackNames = useMemo(() => {
    const names = new Map<string, string>();
    if (diff) {
      for (const track of [...diff.tracksDiff.added, ...diff.tracksDiff.removed]) names.set(track.id, track.name);
      for (const { new: track } of diff.tracksDiff.modified) names.set(track.id, track.name);
    }
    return names;
  }, [diff]);
  const trackLabel = (id: string) => trackNames.get(id) ?? t("gh.someTrack");

  return (
    <DiffDialogShell
      title={t("cmp.title")}
      icon={<GitCompareArrows aria-hidden="true" className="h-4 w-4 text-muted" />}
      onClose={onClose}
      closeLabel={t("cmp.close")}
      header={
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="neutral">
            {t("cmp.base")}: {base.message}
          </Badge>
          <Badge variant="neutral">
            {t("cmp.target")}: {target.message}
          </Badge>
        </div>
      }
    >
      <div className="px-4 py-4 md:px-6 md:py-5">
        {error ? (
          <div role="alert" className="rounded-card border border-danger/30 bg-danger-muted px-4 py-3">
            <p className="text-sm text-danger">{renderError(error)}</p>
            <Button variant="secondary" className="mt-3" onClick={() => setReloadKey((k) => k + 1)}>
              {t("ui.retry")}
            </Button>
          </div>
        ) : !diff ? (
          <p role="status" className="flex items-center gap-2 py-10 text-xs text-muted">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> {t("comparePage.loading")}
          </p>
        ) : diff.areIdentical ? (
          <p className="rounded-card border border-dashed border-border-strong bg-surface-subtle px-4 py-10 text-center text-sm">
            {t("cmp.identical")}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            <dl
              aria-label={t("comparePage.statsLabel")}
              className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-5"
            >
              {[
                [t("comparePage.statAdded"), `+${diff.summary.notes.added}`, DIFF_TEXT.add],
                [t("comparePage.statRemoved"), `−${diff.summary.notes.removed}`, DIFF_TEXT.remove],
                [t("comparePage.statModified"), `~${diff.summary.notes.modified}`, DIFF_TEXT.modify],
                [t("comparePage.statBars"), String(affected.bars), "text-foreground"],
                [t("comparePage.statTracks"), String(affected.tracks), "text-foreground"],
              ].map(([label, value, tone]) => (
                <div key={label} className="bg-surface px-4 py-3">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className={`mt-0.5 font-mono text-2xl font-semibold ${tone}`}>{value}</dd>
                </div>
              ))}
            </dl>
            {diff.summary.tracks.added + diff.summary.tracks.removed + diff.summary.tracks.modified > 0 && (
              <p className="text-xs text-muted">{t("cmp.tracksSummary", diff.summary.tracks)}</p>
            )}
            <section className="overflow-hidden rounded-card border border-border">
              <h3 className="border-b border-border bg-surface-subtle px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-muted">
                {t("comparePage.byBarTitle")}
              </h3>
              {bars.length === 0 ? (
                <p className="px-3.5 py-6 text-center text-xs text-muted">{t("comparePage.barsEmpty")}</p>
              ) : (
                <div className="divide-y divide-border">
                  {bars.map((b) => (
                    <details key={b.bar}>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3.5 py-2.5 text-xs hover:bg-surface-subtle">
                        <Badge variant="neutral">{t("cmp.bar", { n: b.bar })}</Badge>
                        {b.added.length > 0 && <span className={`font-mono ${DIFF_TEXT.add}`}>+{b.added.length}</span>}
                        {b.removed.length > 0 && <span className={`font-mono ${DIFF_TEXT.remove}`}>−{b.removed.length}</span>}
                        {b.modified.length > 0 && <span className={`font-mono ${DIFF_TEXT.modify}`}>~{b.modified.length}</span>}
                      </summary>
                      <ul className="flex flex-col gap-1 px-3.5 pb-3 font-mono text-xs">
                        {b.added.map((n) => (
                          <li key={n.id} className={DIFF_TEXT.add}>
                            + {trackLabel(n.trackId)} · {t("cmp.noteDesc", { pitch: pitchName(n.pitch), start: n.start, duration: n.duration, velocity: n.velocity })}
                          </li>
                        ))}
                        {b.removed.map((n) => (
                          <li key={n.id} className={DIFF_TEXT.remove}>
                            − {trackLabel(n.trackId)} · {t("cmp.noteDesc", { pitch: pitchName(n.pitch), start: n.start, duration: n.duration, velocity: n.velocity })}
                          </li>
                        ))}
                        {b.modified.map((m) => (
                          <li key={m.new.id} className={DIFF_TEXT.modify}>
                            ~ {trackLabel(m.new.trackId)} · {t("cmp.noteDesc", { pitch: pitchName(m.new.pitch), start: m.new.start, duration: m.new.duration, velocity: m.new.velocity })}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </DiffDialogShell>
  );
}

export function PublicHistory({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const [branches, setBranches] = useState<PublicBranch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [commits, setCommits] = useState<PublicCommitItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<ErrorSource | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState<[PublicCommitItem, PublicCommitItem] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPublicBranches(projectId)
      .then((list) => {
        if (!cancelled) setBranches(list);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải trang đầu khi đổi nhánh hoặc thử lại
    setLoading(true);
    setError(null);
    getPublicCommits(projectId, { branchId: branchId || undefined, page: 1, limit: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setCommits(result.items);
        setPage(1);
        setTotalPages(result.totalPages);
        setSelected([]);
      })
      .catch((err) => {
        if (!cancelled) setError(errorSource(err, "gh.loadFail"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, branchId, reloadKey]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const result = await getPublicCommits(projectId, { branchId: branchId || undefined, page: page + 1, limit: PAGE_SIZE });
      setCommits((current) => [...current, ...result.items]);
      setPage(result.page);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(errorSource(err, "gh.loadFail"));
    } finally {
      setLoadingMore(false);
    }
  }, [projectId, branchId, page]);

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      return current.length >= 2 ? [current[1], id] : [...current, id];
    });
  }

  function openCompare() {
    const [a, b] = selected.map((id) => commits.find((c) => c.id === id));
    if (!a || !b) return;
    const [older, newer] = new Date(a.created_at) <= new Date(b.created_at) ? [a, b] : [b, a];
    setComparing([older, newer]);
  }

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name;
  const loginHref = `/login?next=${encodeURIComponent(`/projects/${projectId}`)}`;

  return (
    <section aria-labelledby="gh-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="gh-title" className="text-[15px] font-semibold">
            {t("gh.title")}
          </h2>
          <p className="text-xs text-muted">{t("gh.lead")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {branches.length > 1 && (
            <select
              name="branch"
              aria-label={t("gh.branch")}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className={`${INPUT_CLASS} h-8 w-auto`}
            >
              <option value="">{t("gh.allBranches")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <Button variant="secondary" disabled={selected.length !== 2} onClick={openCompare}>
            <GitCompareArrows aria-hidden="true" className="h-3.5 w-3.5" /> {t("gh.compare")}
          </Button>
          <Link href={loginHref}>
            <Button variant="ghost">
              <LogIn aria-hidden="true" className="h-3.5 w-3.5" /> {t("gh.signInToDo")}
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <SkyLoading label={t("gh.loading")} />
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger/30 bg-danger-muted p-4 text-sm text-danger">
          <span>{renderError(error)}</span>
          <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
            {t("ui.retry")}
          </Button>
        </div>
      ) : commits.length === 0 ? (
        <SkyEmpty title={t("gh.empty")} />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">{t("gh.pickTwo")}</p>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {commits.map((commit) => {
              const name = formatAuthorName(commit.author);
              return (
                <li key={commit.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <input
                    type="checkbox"
                    name={`select-${commit.id}`}
                    checked={selected.includes(commit.id)}
                    onChange={() => toggle(commit.id)}
                    aria-label={t("gh.select", { message: commit.message })}
                    className="h-4 w-4 shrink-0 accent-accent"
                  />
                  <Avatar id={commit.author.id || commit.id} label={name} imageUrl={commit.author.avatar_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{commit.message}</p>
                    <p className="truncate text-xs text-muted">
                      {name} · {formatRelativeTime(commit.created_at)}
                      {!branchId && branchName(commit.branch_id) ? ` · ${branchName(commit.branch_id)}` : ""}
                    </p>
                  </div>
                  <span className="hidden font-mono text-xs text-muted sm:inline">{commit.id.slice(0, 7)}</span>
                </li>
              );
            })}
          </ul>
          {page < totalPages && (
            <div className="mt-3 flex justify-center">
              <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? t("ui.loading") : t("gh.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}

      {comparing && (
        <PublicCompare projectId={projectId} base={comparing[0]} target={comparing[1]} onClose={() => setComparing(null)} />
      )}
    </section>
  );
}
