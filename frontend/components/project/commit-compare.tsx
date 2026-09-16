"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, GitCompareArrows, Loader2, X } from "lucide-react";
import type { DraftNote, DraftSnapshot, DraftTrack } from "@stave/shared-types";
import { ApiError, compareCommits, getCommit } from "../../lib/api-client";
import type { SnapshotDiff, SnapshotMetaChange } from "../../lib/api-client";
import { pitchName } from "../../lib/midi-note-name";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { INPUT_CLASS } from "../ui/form";

/** Thông tin tối thiểu để hiện tiêu đề 1 phiên bản trong màn so sánh. */
export interface CompareSide {
  id: string;
  message: string;
  created_at: string;
}

type NoteKind = "added" | "removed" | "modified" | "unchanged";

interface GridNote {
  note: DraftNote;
  kind: NoteKind;
  /** Chỉ có với `modified`: vị trí cũ, vẽ dạng viền mờ. */
  old?: DraftNote;
}

/** Bề ngang 1 nốt đen trên lưới (px) và chiều cao 1 cao độ (px). */
const PX_PER_QUARTER = 20;
const ROW_H = 6;

const KIND_FILL: Record<NoteKind, string> = {
  added: "fill-success",
  removed: "fill-danger",
  modified: "fill-warning",
  unchanged: "fill-border-strong",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPan(pan: number) {
  if (Math.abs(pan) < 0.005) return "Giữa";
  return `${pan < 0 ? "Trái" : "Phải"} ${Math.round(Math.abs(pan) * 100)}`;
}

function describeMeta(change: SnapshotMetaChange) {
  const show = (v: unknown) =>
    Array.isArray(v) ? v.join("/") : v === undefined || v === null ? "—" : String(v);
  const label =
    change.field === "tempo" ? "Tempo (BPM)" : change.field === "timeSignature" ? "Nhịp" : "PPQ";
  return { label, from: show(change.old), to: show(change.new) };
}

/** Liệt kê từng thuộc tính track đổi — để người dùng thấy ĐỔI GÌ, không chỉ "track đã sửa". */
function trackFieldChanges(a: DraftTrack, b: DraftTrack) {
  const out: { label: string; from: string; to: string }[] = [];
  if (a.name !== b.name) out.push({ label: "Tên", from: a.name, to: b.name });
  if ((a.instrument ?? null) !== (b.instrument ?? null))
    out.push({
      label: "Nhạc cụ",
      from: a.instrument ?? "Mặc định",
      to: b.instrument ?? "Mặc định",
    });
  if (a.volume !== b.volume)
    out.push({
      label: "Âm lượng",
      from: `${Math.round(a.volume * 100)}%`,
      to: `${Math.round(b.volume * 100)}%`,
    });
  if (a.pan !== b.pan) out.push({ label: "Pan", from: formatPan(a.pan), to: formatPan(b.pan) });
  if (a.muted !== b.muted)
    out.push({ label: "Tắt tiếng", from: a.muted ? "Bật" : "Tắt", to: b.muted ? "Bật" : "Tắt" });
  if (a.solo !== b.solo)
    out.push({ label: "Solo", from: a.solo ? "Bật" : "Tắt", to: b.solo ? "Bật" : "Tắt" });
  if (a.color !== b.color) out.push({ label: "Màu", from: a.color, to: b.color });
  if (a.order !== b.order)
    out.push({ label: "Thứ tự", from: String(a.order + 1), to: String(b.order + 1) });
  return out;
}

function describeNote(n: DraftNote) {
  return `${pitchName(n.pitch)} · tick ${n.start} · dài ${n.duration} · vel ${n.velocity}`;
}

/**
 * UC-45 — so sánh 2 phiên bản ở mức từng nốt (BR-46, BR-28).
 *
 * Toàn bộ phép so sánh do backend tính (`GET /commits/diff`); ở đây chỉ tải
 * thêm snapshot của 2 commit để vẽ được cả những nốt KHÔNG đổi lên lưới (bước 4
 * yêu cầu phân biệt added/removed/changed/unchanged) — không tự tính diff lần
 * hai ở client.
 *
 * Chưa làm: bước 6 (nghe thử từng phiên bản ngay trong màn so sánh) — engine
 * phát nhạc hiện chỉ sống trong MIDI Editor. Xem PROJECT_STATE §37.
 */
export function CommitCompare({
  base: initialBase,
  target: initialTarget,
  onClose,
}: {
  base: CompareSide;
  target: CompareSide;
  onClose: () => void;
}) {
  const [base, setBase] = useState(initialBase);
  const [target, setTarget] = useState(initialTarget);
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [baseSnap, setBaseSnap] = useState<DraftSnapshot | null>(null);
  const [targetSnap, setTargetSnap] = useState<DraftSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackFilter, setTrackFilter] = useState<string>("all");
  const [reloadKey, setReloadKey] = useState(0);

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
          b.status === "rejected" ? `phiên bản gốc (${base.id.slice(0, 7)})` : null,
          t.status === "rejected" ? `phiên bản đem so (${target.id.slice(0, 7)})` : null,
        ]
          .filter(Boolean)
          .join(" và ");
        setError(`Không đọc được ${which}.`);
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
          setError(err instanceof ApiError ? err.message : "Không so sánh được hai phiên bản.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [base.id, target.id, reloadKey]);

  // Esc để đóng.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** 5.1: đảo chiều — cái từng là "thêm" giờ thành "xoá". */
  function swap() {
    setBase(target);
    setTarget(base);
  }

  /** Mọi track xuất hiện ở ít nhất 1 trong 2 phiên bản, để lọc theo track (bước 5). */
  const allTracks = useMemo(() => {
    const map = new Map<string, DraftTrack>();
    for (const t of baseSnap?.tracks ?? []) map.set(t.id, t);
    for (const t of targetSnap?.tracks ?? []) map.set(t.id, t);
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [baseSnap, targetSnap]);

  const gridNotes = useMemo<GridNote[]>(() => {
    if (!diff || !baseSnap || !targetSnap) return [];
    const addedTrackIds = new Set(diff.tracksDiff.added.map((t) => t.id));
    const addedIds = new Set<string>();
    const modified = new Map<string, DraftNote>();
    for (const bar of Object.values(diff.changesByBar)) {
      bar.added.forEach((n) => addedIds.add(n.id));
      bar.modified.forEach((m) => modified.set(m.new.id, m.old));
    }

    const out: GridNote[] = [];
    for (const note of targetSnap.notes) {
      // Xét "sửa" trước: nốt cũ bị chuyển sang một track mới thêm vẫn là nốt sửa
      // (giữ id, BR-28), không phải nốt thêm.
      if (modified.has(note.id)) {
        out.push({ note, kind: "modified", old: modified.get(note.id) });
      } else if (addedIds.has(note.id) || addedTrackIds.has(note.trackId)) {
        out.push({ note, kind: "added" });
      } else {
        out.push({ note, kind: "unchanged" });
      }
    }
    // Mọi nốt chỉ còn ở bản gốc là "xoá" — gồm cả nốt của track bị xoá nguyên cả track.
    const targetIds = new Set(targetSnap.notes.map((n) => n.id));
    for (const note of baseSnap.notes) {
      if (!targetIds.has(note.id)) out.push({ note, kind: "removed" });
    }

    if (trackFilter === "all") return out;
    return out.filter(
      (g) => g.note.trackId === trackFilter || g.old?.trackId === trackFilter,
    );
  }, [diff, baseSnap, targetSnap, trackFilter]);

  const bars = useMemo(() => {
    if (!diff) return [];
    return Object.entries(diff.changesByBar)
      .map(([bar, changes]) => {
        const keep = (n: DraftNote) => trackFilter === "all" || n.trackId === trackFilter;
        return {
          bar: Number(bar),
          added: changes.added.filter(keep),
          removed: changes.removed.filter(keep),
          modified: changes.modified.filter((m) => keep(m.new) || keep(m.old)),
        };
      })
      .filter((b) => b.added.length + b.removed.length + b.modified.length > 0)
      .sort((a, b) => a.bar - b.bar);
  }, [diff, trackFilter]);

  const trackName = (id: string) => allTracks.find((t) => t.id === id)?.name ?? "Track";

  const nothingReported =
    diff &&
    !diff.areIdentical &&
    diff.summary.notes.totalChanges === 0 &&
    diff.summary.tracks.added + diff.summary.tracks.removed + diff.summary.tracks.modified === 0 &&
    diff.metaChanges.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4 py-8">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-card border border-border bg-surface"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <GitCompareArrows className="h-4 w-4 text-muted" />
              So sánh phiên bản
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <VersionChip label="Gốc" side={base} />
              <Button variant="ghost" onClick={swap} title="Đảo chiều so sánh" disabled={loading}>
                <ArrowLeftRight className="h-3.5 w-3.5" /> Đảo chiều
              </Button>
              <VersionChip label="Đem so" side={target} />
            </div>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Đóng">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="flex items-center gap-2 py-10 text-xs text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang so sánh…
            </p>
          ) : error ? (
            <div className="rounded-card border border-danger/20 bg-danger-muted px-4 py-3">
              <p className="text-xs text-danger">{error}</p>
              <Button
                variant="secondary"
                className="mt-2"
                onClick={() => setReloadKey((k) => k + 1)}
              >
                Thử lại
              </Button>
            </div>
          ) : diff?.areIdentical ? (
            // 3.E1: nói rõ "không có gì đổi" thay vì vẽ lưới trống.
            <p className="rounded-card border border-dashed border-border bg-surface-subtle px-4 py-10 text-center text-sm">
              Hai phiên bản giống hệt nhau — không có thay đổi nào.
            </p>
          ) : diff ? (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">+{diff.summary.notes.added} nốt thêm</Badge>
                <Badge variant="danger">−{diff.summary.notes.removed} nốt xoá</Badge>
                <Badge variant="warning">~{diff.summary.notes.modified} nốt sửa</Badge>
                {diff.summary.tracks.added + diff.summary.tracks.removed + diff.summary.tracks.modified >
                  0 && (
                  <Badge variant="neutral">
                    Track: +{diff.summary.tracks.added} −{diff.summary.tracks.removed} ~
                    {diff.summary.tracks.modified}
                  </Badge>
                )}
              </div>

              {nothingReported && (
                <p className="text-xs text-muted">
                  Hai phiên bản khác nhau ở dữ liệu nội bộ (VD: phiên bản định dạng) nhưng không có
                  thay đổi nào về nốt, track hay tempo.
                </p>
              )}

              {(diff.metaChanges.length > 0 ||
                diff.tracksDiff.added.length > 0 ||
                diff.tracksDiff.removed.length > 0 ||
                diff.tracksDiff.modified.length > 0) && (
                <section className="overflow-hidden rounded-card border border-border">
                  <h3 className="border-b border-border bg-surface-subtle px-3.5 py-2 text-[10px] font-bold uppercase tracking-wide text-muted">
                    Thay đổi dự án & track
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
                        <Badge variant="success">Thêm track</Badge>
                        <span className="font-semibold">{t.name}</span>
                        <span className="text-muted">
                          {t.instrument ?? "Nhạc cụ mặc định"} ·{" "}
                          {diff.tracksDiff.noteCounts[t.id] ?? 0} nốt
                        </span>
                      </li>
                    ))}
                    {diff.tracksDiff.removed.map((t) => (
                      <li key={`r-${t.id}`} className="flex flex-wrap items-center gap-2 px-3.5 py-2">
                        <Badge variant="danger">Xoá track</Badge>
                        <span className="font-semibold">{t.name}</span>
                        <span className="text-muted">
                          {t.instrument ?? "Nhạc cụ mặc định"} ·{" "}
                          {diff.tracksDiff.noteCounts[t.id] ?? 0} nốt
                        </span>
                      </li>
                    ))}
                    {diff.tracksDiff.modified.map(({ old, new: next }) => (
                      <li key={`m-${next.id}`} className="flex flex-col gap-1 px-3.5 py-2">
                        <span className="flex items-center gap-2">
                          <Badge variant="warning">Sửa track</Badge>
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

              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted">
                    <Legend className="bg-success" label="Thêm" />
                    <Legend className="bg-danger" label="Xoá" />
                    <Legend className="bg-warning" label="Sửa (viền = vị trí cũ)" />
                    <Legend className="bg-border-strong" label="Không đổi" />
                  </div>
                  <select
                    value={trackFilter}
                    onChange={(e) => setTrackFilter(e.target.value)}
                    className={`${INPUT_CLASS} h-8 w-auto`}
                    aria-label="Lọc theo track"
                  >
                    <option value="all">Tất cả track</option>
                    {allTracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                {targetSnap && (
                  <DiffGrid notes={gridNotes} meta={targetSnap.meta} />
                )}
              </section>

              {bars.length > 0 && (
                <section className="overflow-hidden rounded-card border border-border">
                  <h3 className="border-b border-border bg-surface-subtle px-3.5 py-2 text-[10px] font-bold uppercase tracking-wide text-muted">
                    Chi tiết theo ô nhịp
                  </h3>
                  <div className="divide-y divide-border">
                    {bars.map((b) => (
                      <details key={b.bar} className="group">
                        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3.5 py-2 text-xs hover:bg-surface-subtle">
                          <Badge variant="neutral">Ô nhịp {b.bar}</Badge>
                          {b.added.length > 0 && <span className="text-success">+{b.added.length}</span>}
                          {b.removed.length > 0 && <span className="text-danger">−{b.removed.length}</span>}
                          {b.modified.length > 0 && (
                            <span className="text-warning">~{b.modified.length}</span>
                          )}
                        </summary>
                        <ul className="flex flex-col gap-1 px-3.5 pb-3 font-mono text-[11px]">
                          {b.added.map((n) => (
                            <li key={n.id} className="text-success">
                              + {trackName(n.trackId)} · {describeNote(n)}
                            </li>
                          ))}
                          {b.removed.map((n) => (
                            <li key={n.id} className="text-danger">
                              − {trackName(n.trackId)} · {describeNote(n)}
                            </li>
                          ))}
                          {b.modified.map((m) => (
                            <li key={m.new.id} className="text-warning">
                              ~ {trackName(m.new.trackId)} · {describeNote(m.old)} → {describeNote(m.new)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function VersionChip({ label, side }: { label: string; side: CompareSide }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-surface-subtle px-2 py-1">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <span className="font-mono text-accent">{side.id.slice(0, 7)}</span>
      <span className="truncate">{side.message}</span>
      <span className="font-mono text-[10px] text-muted">{formatTime(side.created_at)}</span>
    </span>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2 w-3 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

/**
 * Lưới piano-roll chỉ đọc bằng SVG. Dùng SVG (không phải canvas như editor) vì
 * màu lấy thẳng class token `fill-*` — đổi theme là đổi theo, không cần qua
 * `resolve-css-colors`.
 */
function DiffGrid({ notes, meta }: { notes: GridNote[]; meta: DraftSnapshot["meta"] }) {
  if (notes.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-xs text-muted">
        Track này không có nốt nào ở cả hai phiên bản.
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
  const RULER = 16;
  const height = (maxPitch - minPitch + 1) * ROW_H + RULER;
  const y = (pitch: number) => RULER + (maxPitch - pitch) * ROW_H;
  const labelEvery = Math.max(1, Math.ceil(40 / (ticksPerBar * pxPerTick)));

  // Nốt không đổi vẽ trước, nốt có thay đổi vẽ đè lên trên cho dễ thấy.
  const order: NoteKind[] = ["unchanged", "removed", "modified", "added"];
  const sorted = [...notes].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));

  return (
    <div className="max-h-[420px] overflow-auto rounded-card border border-border bg-surface-subtle">
      <svg width={width} height={height} className="block">
        {Array.from({ length: barCount + 1 }).map((_, i) => {
          const x = i * ticksPerBar * pxPerTick;
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={0} y2={height} className="stroke-border" strokeWidth={1} />
              {i < barCount && i % labelEvery === 0 && (
                <text x={x + 3} y={11} className="fill-muted font-mono" fontSize={9}>
                  {i + 1}
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
              rx={1}
              className={KIND_FILL[g.kind]}
            >
              <title>{describeNote(g.note)}</title>
            </rect>
          </g>
        ))}
      </svg>
    </div>
  );
}
