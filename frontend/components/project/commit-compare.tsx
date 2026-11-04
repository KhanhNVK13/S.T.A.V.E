"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, GitCompareArrows, Loader2, Play, Square } from "lucide-react";
import type { DraftNote, DraftSnapshot, DraftTrack } from "@stave/shared-types";
import { compareCommits, getCommit } from "../../lib/api-client";
import type { SnapshotDiff, SnapshotMetaChange } from "../../lib/api-client";
import { pitchName } from "../../lib/midi-note-name";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { DiffDialogShell } from "./diff-dialog-shell";
import { BLACK_KEYS, buildBarChanges, buildGridNotes, countAffected } from "./compare-model";
import type { GridNote, NoteKind } from "./compare-model";
import { INPUT_CLASS } from "../ui/form";
import { apiErrorMessage } from "../../lib/error-message";
import { appLocale } from "../../lib/format-date";
import { tNow } from "../../lib/i18n";
import { useI18n } from "../../context/i18n-context";
import { resolveAndLoadCustomSounds } from "../../lib/custom-sound-buffers";
import { SnapshotPlayer } from "../../lib/snapshot-player";

/** Thông tin tối thiểu để hiện tiêu đề 1 phiên bản trong màn so sánh. */
export interface CompareSide {
  id: string;
  message: string;
  created_at: string;
}

/** Bề ngang 1 nốt đen trên lưới (px) và chiều cao 1 cao độ (px). */
const PX_PER_QUARTER = 20;
const ROW_H = 8;

const KIND_CLASS: Record<NoteKind, string> = {
  added: "fill-success stroke-success",
  removed: "fill-danger/25 stroke-danger",
  modified: "fill-warning stroke-warning",
  unchanged: "fill-border-strong stroke-none",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(appLocale(), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPan(pan: number) {
  if (Math.abs(pan) < 0.005) return tNow("cmp.panCenter");
  return `${pan < 0 ? tNow("cmp.panLeft") : tNow("cmp.panRight")} ${Math.round(Math.abs(pan) * 100)}`;
}

function describeMeta(change: SnapshotMetaChange) {
  const show = (v: unknown) =>
    Array.isArray(v) ? v.join("/") : v === undefined || v === null ? "—" : String(v);
  const label =
    change.field === "tempo" ? tNow("cmp.fieldTempo") : change.field === "timeSignature" ? tNow("cmp.fieldTimeSig") : "PPQ";
  return { label, from: show(change.old), to: show(change.new) };
}

/** Liệt kê từng thuộc tính track đổi — để người dùng thấy ĐỔI GÌ, không chỉ "track đã sửa". */
function trackFieldChanges(a: DraftTrack, b: DraftTrack) {
  const out: { label: string; from: string; to: string }[] = [];
  if (a.name !== b.name) out.push({ label: tNow("cmp.fieldName"), from: a.name, to: b.name });
  if ((a.instrument ?? null) !== (b.instrument ?? null))
    out.push({
      label: tNow("cmp.fieldInstrument"),
      from: a.instrument ?? tNow("cmp.default"),
      to: b.instrument ?? tNow("cmp.default"),
    });
  if (a.volume !== b.volume)
    out.push({
      label: tNow("cmp.fieldVolume"),
      from: `${Math.round(a.volume * 100)}%`,
      to: `${Math.round(b.volume * 100)}%`,
    });
  if (a.pan !== b.pan) out.push({ label: "Pan", from: formatPan(a.pan), to: formatPan(b.pan) });
  if (a.muted !== b.muted)
    out.push({ label: tNow("cmp.fieldMute"), from: a.muted ? tNow("cmp.on") : tNow("cmp.off"), to: b.muted ? tNow("cmp.on") : tNow("cmp.off") });
  if (a.solo !== b.solo)
    out.push({ label: "Solo", from: a.solo ? tNow("cmp.on") : tNow("cmp.off"), to: b.solo ? tNow("cmp.on") : tNow("cmp.off") });
  if (a.color !== b.color) out.push({ label: tNow("cmp.fieldColor"), from: a.color, to: b.color });
  if (a.order !== b.order)
    out.push({ label: tNow("cmp.fieldOrder"), from: String(a.order + 1), to: String(b.order + 1) });
  if (!sameSoundMap(a.soundMap, b.soundMap))
    out.push({ label: tNow("cmp.fieldSounds"), from: describeSoundMap(a.soundMap), to: describeSoundMap(b.soundMap) });
  return out;
}

function sameSoundMap(a: DraftTrack["soundMap"], b: DraftTrack["soundMap"]) {
  const keys = Object.keys(a ?? {});
  return keys.length === Object.keys(b ?? {}).length && keys.every((k) => a![k] === b?.[k]);
}

function describeSoundMap(map: DraftTrack["soundMap"]) {
  const pitches = Object.keys(map ?? {}).map(Number).sort((x, y) => x - y);
  return pitches.length === 0 ? tNow("cmp.none") : tNow("cmp.soundNotes", { list: pitches.map(pitchName).join(", ") });
}

function describeNote(n: DraftNote) {
  return tNow("cmp.noteDesc", { pitch: pitchName(n.pitch), start: n.start, duration: n.duration, velocity: n.velocity });
}

/**
 * UC-45 — so sánh 2 phiên bản ở mức từng nốt (BR-46, BR-28).
 *
 * Toàn bộ phép so sánh do backend tính (`GET /commits/diff`); ở đây chỉ tải
 * thêm snapshot của 2 commit để vẽ được cả những nốt KHÔNG đổi lên lưới (bước 4
 * yêu cầu phân biệt added/removed/changed/unchanged) — không tự tính diff lần
 * hai ở client.
 *
 */
export function CommitCompare({
  projectId,
  base: initialBase,
  target: initialTarget,
  onClose,
}: {
  projectId: string;
  base: CompareSide;
  target: CompareSide;
  onClose: () => void;
}) {
  const { t: tt } = useI18n();
  const [base, setBase] = useState(initialBase);
  const [target, setTarget] = useState(initialTarget);
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [baseSnap, setBaseSnap] = useState<DraftSnapshot | null>(null);
  const [targetSnap, setTargetSnap] = useState<DraftSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackFilter, setTrackFilter] = useState<string>("all");
  const [changedOnly, setChangedOnly] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const playerRef = useRef<SnapshotPlayer | null>(null);
  const [playing, setPlaying] = useState<"base" | "target" | null>(null);
  const [playBusy, setPlayBusy] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  const stopPlayback = useCallback(() => {
    playerRef.current?.stop();
    setPlaying(null);
    setPlayBusy(false);
  }, []);

  useEffect(() => {
    const player = new SnapshotPlayer();
    playerRef.current = player;
    return () => {
      player.stop();
      playerRef.current = null;
    };
  }, []);

  async function togglePlay(side: "base" | "target") {
    if (playing === side) {
      stopPlayback();
      return;
    }
    const snap = side === "base" ? baseSnap : targetSnap;
    const player = playerRef.current;
    if (!snap || !player) return;
    stopPlayback();
    setPlayError(null);
    setPlayBusy(true);
    try {
      const customBuffers = await resolveAndLoadCustomSounds(projectId, snap).catch(
        () => new Map<string, AudioBuffer>(),
      );
      const started = await player.play(snap, customBuffers, () => {
        setPlaying(null);
        setPlayBusy(false);
      });
      if (!started) {
        setPlayError(tt("cmp.nothingToPlay"));
        setPlayBusy(false);
        return;
      }
      setPlaying(side);
    } catch (err) {
      setPlayError(apiErrorMessage(err, tt("cmp.playFail")));
    } finally {
      setPlayBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    // 2.E1: tải riêng từng commit để báo đúng phiên bản nào không đọc được,
    // thay vì một câu lỗi chung chung.
    const load = async () => {
      setLoading(true);
      setError(null);
      const [b, t] = await Promise.allSettled([getCommit(base.id), getCommit(target.id)]);
      if (cancelled) return;
      if (b.status === "rejected" || t.status === "rejected") {
        const which = [
          b.status === "rejected" ? tNow("cmp.baseVersion", { id: base.id.slice(0, 7) }) : null,
          t.status === "rejected" ? tNow("cmp.targetVersion", { id: target.id.slice(0, 7) }) : null,
        ]
          .filter(Boolean)
          .join(tNow("cmp.and"));
        setError(tNow("cmp.readFail", { which }));
        setLoading(false);
        return;
      }
      try {
        const result = await compareCommits(base.id, target.id);
        if (cancelled) return;
        setBaseSnap(b.value.snapshot);
        setTargetSnap(t.value.snapshot);
        setDiff(result);
      } catch (err) {
        if (!cancelled)
          setError(apiErrorMessage(err, tNow("cmp.compareFail")));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [base.id, target.id, reloadKey]);



  function swap() {
    stopPlayback();
    setBase(target);
    setTarget(base);
  }

  const allTracks = useMemo(() => {
    const map = new Map<string, DraftTrack>();
    for (const t of baseSnap?.tracks ?? []) map.set(t.id, t);
    for (const t of targetSnap?.tracks ?? []) map.set(t.id, t);
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [baseSnap, targetSnap]);

  const gridNotes = useMemo<GridNote[]>(() => {
    if (!diff || !baseSnap || !targetSnap) return [];
    return buildGridNotes(diff, baseSnap, targetSnap, trackFilter, changedOnly);
  }, [diff, baseSnap, targetSnap, trackFilter, changedOnly]);

  const bars = useMemo(() => (diff ? buildBarChanges(diff, trackFilter) : []), [diff, trackFilter]);
  const affected = useMemo(() => (diff ? countAffected(diff) : { bars: 0, tracks: 0 }), [diff]);

  const trackName = (id: string) => allTracks.find((t) => t.id === id)?.name ?? "Track";

  const nothingReported =
    diff &&
    !diff.areIdentical &&
    diff.summary.notes.totalChanges === 0 &&
    diff.summary.tracks.added + diff.summary.tracks.removed + diff.summary.tracks.modified === 0 &&
    diff.metaChanges.length === 0;

  const trackChangeCount = diff
    ? diff.summary.tracks.added + diff.summary.tracks.removed + diff.summary.tracks.modified
    : 0;

  const header = (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <VersionChip label={tt("cmp.base")} side={base} />
        <Button variant="ghost" onClick={swap} title={tt("cmp.swapTitle")} disabled={loading}>
          <ArrowLeftRight aria-hidden="true" className="h-3.5 w-3.5" /> {tt("cmp.swap")}
        </Button>
        <VersionChip label={tt("cmp.target")} side={target} />
      </div>
      {baseSnap && targetSnap && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(["base", "target"] as const).map((side) => (
            <Button
              key={side}
              variant="secondary"
              disabled={playBusy && playing !== side}
              onClick={() => void togglePlay(side)}
              aria-pressed={playing === side}
            >
              {playing === side ? (
                <Square aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <Play aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {playing === side ? tt("cmp.stop") : side === "base" ? tt("cmp.listenBase") : tt("cmp.listenTarget")}
            </Button>
          ))}
          {playBusy && <span className="text-xs text-muted">{tt("cmp.preparing")}</span>}
          {playError && (
            <span role="alert" className="text-xs text-danger">
              {playError}
            </span>
          )}
        </div>
      )}
    </>
  );

  return (
    <DiffDialogShell
      title={tt("cmp.title")}
      icon={<GitCompareArrows aria-hidden="true" className="h-4 w-4 text-muted" />}
      onClose={onClose}
      closeLabel={tt("cmp.close")}
      header={header}
    >
      <div className="px-4 py-4 md:px-6 md:py-5">
        {loading ? (
          <p role="status" className="flex items-center gap-2 py-10 text-xs text-muted">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> {tt("comparePage.loading")}
          </p>
        ) : error ? (
          <div role="alert" className="rounded-card border border-danger/30 bg-danger-muted px-4 py-3">
            <p className="text-sm text-danger">{error}</p>
            <Button variant="secondary" className="mt-3" onClick={() => setReloadKey((k) => k + 1)}>
              {tt("ui.retry")}
            </Button>
          </div>
        ) : diff?.areIdentical ? (
          <p className="rounded-card border border-dashed border-border-strong bg-surface-subtle px-4 py-10 text-center text-sm">
            {tt("cmp.identical")}
          </p>
        ) : diff ? (
          <div className="flex flex-col gap-5">
            <dl
              aria-label={tt("comparePage.statsLabel")}
              className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-5"
            >
              <Stat label={tt("comparePage.statAdded")} value={`+${diff.summary.notes.added}`} tone="text-success-foreground" />
              <Stat label={tt("comparePage.statRemoved")} value={`−${diff.summary.notes.removed}`} tone="text-danger" />
              <Stat label={tt("comparePage.statModified")} value={`~${diff.summary.notes.modified}`} tone="text-warning-foreground" />
              <Stat label={tt("comparePage.statBars")} value={String(affected.bars)} />
              <Stat label={tt("comparePage.statTracks")} value={String(affected.tracks)} />
            </dl>

            {nothingReported && <p className="text-xs text-muted">{tt("cmp.internalOnly")}</p>}

            <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex min-w-0 flex-col gap-5">
                {(diff.metaChanges.length > 0 || trackChangeCount > 0) && (
                  <section className="overflow-hidden rounded-card border border-border">
                    <h3 className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-subtle px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-muted">
                      {tt("cmp.projectChanges")}
                      {trackChangeCount > 0 && (
                        <Badge variant="neutral">{tt("cmp.tracksSummary", diff.summary.tracks)}</Badge>
                      )}
                    </h3>
                    <ul className="divide-y divide-border text-xs">
                      {diff.metaChanges.map((c) => {
                        const d = describeMeta(c);
                        return (
                          <li key={c.field} className="flex flex-wrap gap-2 px-3.5 py-2">
                            <span className="font-semibold">{d.label}</span>
                            <span className="font-mono text-muted">
                              {d.from} → {d.to}
                            </span>
                          </li>
                        );
                      })}
                      {diff.tracksDiff.added.map((t) => (
                        <li key={`a-${t.id}`} className="flex flex-wrap items-center gap-2 px-3.5 py-2">
                          <Badge variant="success">{tt("cmp.trackAdded")}</Badge>
                          <span className="font-semibold">{t.name}</span>
                          <span className="text-muted">
                            {t.instrument ?? tt("cmp.defaultInstrument")} · {tt("cmp.noteCount", { n: diff.tracksDiff.noteCounts[t.id] ?? 0 })}
                          </span>
                        </li>
                      ))}
                      {diff.tracksDiff.removed.map((t) => (
                        <li key={`r-${t.id}`} className="flex flex-wrap items-center gap-2 px-3.5 py-2">
                          <Badge variant="danger">{tt("cmp.trackRemoved")}</Badge>
                          <span className="font-semibold">{t.name}</span>
                          <span className="text-muted">
                            {t.instrument ?? tt("cmp.defaultInstrument")} · {tt("cmp.noteCount", { n: diff.tracksDiff.noteCounts[t.id] ?? 0 })}
                          </span>
                        </li>
                      ))}
                      {diff.tracksDiff.modified.map(({ old, new: next }) => (
                        <li key={`m-${next.id}`} className="flex flex-col gap-1 px-3.5 py-2">
                          <span className="flex items-center gap-2">
                            <Badge variant="warning">{tt("cmp.trackModified")}</Badge>
                            <span className="font-semibold">{next.name}</span>
                          </span>
                          <span className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
                            {trackFieldChanges(old, next).map((f) => (
                              <span key={f.label}>
                                {f.label}:{" "}
                                <span className="font-mono">
                                  {f.from} → {f.to}
                                </span>
                              </span>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section aria-labelledby="compare-roll-title" className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <h3 id="compare-roll-title" className="text-sm font-semibold">
                      {tt("comparePage.rollTitle")}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                        <input
                          type="checkbox"
                          name="changed-only"
                          checked={changedOnly}
                          onChange={(e) => setChangedOnly(e.target.checked)}
                          className="h-4 w-4 accent-accent"
                        />
                        {tt("comparePage.changedOnly")}
                      </label>
                      <select
                        name="track-filter"
                        value={trackFilter}
                        onChange={(e) => setTrackFilter(e.target.value)}
                        className={`${INPUT_CLASS} h-8 w-auto`}
                        aria-label={tt("cmp.filterTrack")}
                      >
                        <option value="all">{tt("cmp.allTracks")}</option>
                        {allTracks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div
                    role="group"
                    aria-label={tt("comparePage.legendLabel")}
                    className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted"
                  >
                    <Legend kind="added" label={tt("cmp.legendAdded")} />
                    <Legend kind="removed" label={tt("cmp.legendRemoved")} />
                    <Legend kind="modified" label={tt("cmp.legendModified")} />
                    <Legend kind="unchanged" label={tt("cmp.legendUnchanged")} />
                  </div>
                  {targetSnap && <DiffGrid notes={gridNotes} meta={targetSnap.meta} summary={diff.summary.notes} />}
                </section>
              </div>

              <section aria-labelledby="compare-bars-title" className="min-w-0 overflow-hidden rounded-card border border-border">
                <h3
                  id="compare-bars-title"
                  className="border-b border-border bg-surface-subtle px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-muted"
                >
                  {tt("comparePage.byBarTitle")}
                </h3>
                {bars.length === 0 ? (
                  <p className="px-3.5 py-6 text-center text-xs text-muted">{tt("comparePage.barsEmpty")}</p>
                ) : (
                  <div className="divide-y divide-border">
                    {bars.map((b) => (
                      <details key={b.bar} className="group">
                        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3.5 py-2.5 text-xs hover:bg-surface-subtle">
                          <Badge variant="neutral">{tt("cmp.bar", { n: b.bar })}</Badge>
                          <span className="sr-only">
                            {tt("comparePage.barSummary", {
                              n: b.bar,
                              added: b.added.length,
                              removed: b.removed.length,
                              modified: b.modified.length,
                            })}
                          </span>
                          {b.added.length > 0 && (
                            <span aria-hidden="true" className="font-mono text-success-foreground">+{b.added.length}</span>
                          )}
                          {b.removed.length > 0 && (
                            <span aria-hidden="true" className="font-mono text-danger">−{b.removed.length}</span>
                          )}
                          {b.modified.length > 0 && (
                            <span aria-hidden="true" className="font-mono text-warning-foreground">~{b.modified.length}</span>
                          )}
                        </summary>
                        <ul className="flex flex-col gap-1 px-3.5 pb-3 font-mono text-xs">
                          {b.added.map((n) => (
                            <li key={n.id} className="text-success-foreground">
                              + {trackName(n.trackId)} · {describeNote(n)}
                            </li>
                          ))}
                          {b.removed.map((n) => (
                            <li key={n.id} className="text-danger">
                              − {trackName(n.trackId)} · {describeNote(n)}
                            </li>
                          ))}
                          {b.modified.map((m) => (
                            <li key={m.new.id} className="text-warning-foreground">
                              ~ {trackName(m.new.trackId)} · {describeNote(m.old)} → {describeNote(m.new)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </DiffDialogShell>
  );
}

function Stat({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 font-mono text-2xl font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

function VersionChip({ label, side }: { label: string; side: CompareSide }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-surface-subtle px-2 py-1">
      <span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span>
      <span className="font-mono text-accent">{side.id.slice(0, 7)}</span>
      <span className="truncate">{side.message}</span>
      <span className="font-mono text-xs text-muted">{formatTime(side.created_at)}</span>
    </span>
  );
}

const LEGEND_SWATCH: Record<NoteKind, string> = {
  added: "bg-success border border-success",
  removed: "border-[1.5px] border-dashed border-danger bg-danger/25",
  modified: "bg-warning border border-warning",
  unchanged: "bg-border-strong",
};

function Legend({ kind, label }: { kind: NoteKind; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`inline-block h-2.5 w-4 rounded-sm ${LEGEND_SWATCH[kind]}`} />
      {label}
    </span>
  );
}

const KIND_LABEL_KEY = {
  added: "comparePage.noteAdded",
  removed: "comparePage.noteRemoved",
  modified: "comparePage.noteModified",
  unchanged: "comparePage.noteUnchanged",
} as const;

function DiffGrid({
  notes,
  meta,
  summary,
}: {
  notes: GridNote[];
  meta: DraftSnapshot["meta"];
  summary: { added: number; removed: number; modified: number };
}) {
  const { t: tt } = useI18n();
  if (notes.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border-strong px-4 py-8 text-center text-xs text-muted">
        {tt("cmp.gridEmpty")}
      </p>
    );
  }

  const ppq = meta.ppq || 480;
  const [num = 4, den = 4] = meta.timeSignature ?? [4, 4];
  const ticksPerBar = ppq * (num / den) * 4;
  const pxPerTick = PX_PER_QUARTER / ppq;

  let minPitch = 127;
  let maxPitch = 0;
  let endTick = 0;
  for (const g of notes) {
    for (const n of g.old ? [g.note, g.old] : [g.note]) {
      minPitch = Math.min(minPitch, n.pitch);
      maxPitch = Math.max(maxPitch, n.pitch);
      endTick = Math.max(endTick, n.start + n.duration);
    }
  }
  minPitch = Math.max(0, minPitch - 2);
  maxPitch = Math.min(127, maxPitch + 2);
  const barCount = Math.max(1, Math.ceil(endTick / ticksPerBar));
  const width = barCount * ticksPerBar * pxPerTick;
  const RULER = 20;
  const height = (maxPitch - minPitch + 1) * ROW_H + RULER;
  const y = (pitch: number) => RULER + (maxPitch - pitch) * ROW_H;
  const labelEvery = Math.max(1, Math.ceil(44 / (ticksPerBar * pxPerTick)));
  const beatsPerBar = Math.max(1, Math.round(num));
  const beatWidth = ticksPerBar / beatsPerBar;

  const order: NoteKind[] = ["unchanged", "removed", "modified", "added"];
  const sorted = [...notes].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const rows = Array.from({ length: maxPitch - minPitch + 1 }, (_, i) => maxPitch - i);

  return (
    <div
      role="region"
      tabIndex={0}
      aria-label={tt("comparePage.rollRegion")}
      className="max-h-[min(52vh,480px)] overflow-auto rounded-card border border-border bg-background"
    >
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={tt("comparePage.rollLabel", summary)}
        className="block min-w-full"
      >
        {rows.map((pitch) =>
          BLACK_KEYS.has(pitch % 12) ? (
            <rect key={pitch} x={0} y={y(pitch)} width={width} height={ROW_H} className="fill-surface-subtle" />
          ) : null,
        )}
        {Array.from({ length: barCount * beatsPerBar + 1 }).map((_, i) => {
          const x = i * beatWidth * pxPerTick;
          const isBar = i % beatsPerBar === 0;
          const barIndex = i / beatsPerBar;
          return (
            <g key={i}>
              <line
                x1={x}
                x2={x}
                y1={isBar ? 0 : RULER}
                y2={height}
                className={isBar ? "stroke-border-strong" : "stroke-border"}
                strokeWidth={1}
              />
              {isBar && barIndex < barCount && barIndex % labelEvery === 0 && (
                <text x={x + 4} y={14} className="fill-muted font-mono" fontSize={12}>
                  {barIndex + 1}
                </text>
              )}
            </g>
          );
        })}
        {sorted.map((g) => (
          <g key={`${g.kind}-${g.note.id}`}>
            {g.old && (
              <rect
                x={g.old.start * pxPerTick}
                y={y(g.old.pitch)}
                width={Math.max(2, g.old.duration * pxPerTick)}
                height={ROW_H - 1}
                className="fill-none stroke-warning"
                strokeDasharray="2 2"
                strokeWidth={1}
              />
            )}
            <rect
              x={g.note.start * pxPerTick}
              y={y(g.note.pitch)}
              width={Math.max(2, g.note.duration * pxPerTick)}
              height={ROW_H - 1}
              rx={1.5}
              strokeWidth={g.kind === "unchanged" ? 0 : 1.4}
              strokeDasharray={g.kind === "removed" ? "3 2" : undefined}
              className={KIND_CLASS[g.kind]}
              data-kind={g.kind}
            >
              <title>
                {tt(KIND_LABEL_KEY[g.kind])} · {describeNote(g.note)}
              </title>
            </rect>
          </g>
        ))}
      </svg>
    </div>
  );
}
