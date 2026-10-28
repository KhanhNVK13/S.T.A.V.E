import type { DraftNote, DraftSnapshot, DraftTrack } from "@stave/shared-types";

export interface PatternClipboardTrack {
  id: string;
  name: string;
  order: number;
  instrument: string | null;
}

export interface PatternClipboard {
  notes: DraftNote[];
  tracks: PatternClipboardTrack[];
  ppq: number;
}

export interface PasteReport {
  pasted: number;
  createdTracks: number;
  trimmed: number;
  removed: number;
  split: number;
  skippedNoTrack: number;
  skippedInvalid: number;
}

export interface PasteResult {
  snapshot: DraftSnapshot;
  pastedIds: string[];
  report: PasteReport;
}

export interface PasteOptions {
  snapshot: DraftSnapshot;
  clipboard: PatternClipboard;
  targetTrackId: string;
  playheadTick: number;
  maxTracks: number;
  trackColors: string[];
  makeId?: () => string;
}

export function buildClipboard(
  snapshot: DraftSnapshot,
  noteIds: ReadonlySet<string>,
): PatternClipboard | null {
  const notes = snapshot.notes.filter((n) => noteIds.has(n.id));
  if (notes.length === 0) return null;
  const usedTrackIds = new Set(notes.map((n) => n.trackId));
  const tracks = snapshot.tracks
    .filter((t) => usedTrackIds.has(t.id))
    .sort((a, b) => a.order - b.order)
    .map((t) => ({
      id: t.id,
      name: t.name,
      order: t.order,
      instrument: t.instrument ?? null,
    }));
  return { notes, tracks, ppq: snapshot.meta.ppq };
}

function emptyReport(): PasteReport {
  return {
    pasted: 0,
    createdTracks: 0,
    trimmed: 0,
    removed: 0,
    split: 0,
    skippedNoTrack: 0,
    skippedInvalid: 0,
  };
}

function isValidPitch(pitch: number): boolean {
  return Number.isInteger(pitch) && pitch >= 0 && pitch <= 127;
}

export interface OverlapResolution {
  notes: DraftNote[];
  trimmed: number;
  removed: number;
  split: number;
}

export function trimOverlappingNotes(
  existingNotes: DraftNote[],
  incomingNotes: DraftNote[],
  makeId: () => string = () => crypto.randomUUID(),
): OverlapResolution {
  const result: OverlapResolution = { notes: [...existingNotes], trimmed: 0, removed: 0, split: 0 };
  let working = result.notes;
  for (const incoming of incomingNotes) {
    const incomingEnd = incoming.start + incoming.duration;
    const next: DraftNote[] = [];
    for (const existing of working) {
      const existingEnd = existing.start + existing.duration;
      const overlaps =
        existing.trackId === incoming.trackId &&
        existing.pitch === incoming.pitch &&
        existing.start < incomingEnd &&
        existingEnd > incoming.start;
      if (!overlaps) {
        next.push(existing);
        continue;
      }
      if (existing.start >= incoming.start && existingEnd <= incomingEnd) {
        result.removed += 1;
        continue;
      }
      if (existing.start < incoming.start && existingEnd > incomingEnd) {
        next.push({ ...existing, duration: incoming.start - existing.start });
        next.push({
          ...existing,
          id: makeId(),
          start: incomingEnd,
          duration: existingEnd - incomingEnd,
        });
        result.split += 1;
        continue;
      }
      if (existing.start < incoming.start) {
        next.push({ ...existing, duration: incoming.start - existing.start });
      } else {
        next.push({
          ...existing,
          start: incomingEnd,
          duration: existingEnd - incomingEnd,
        });
      }
      result.trimmed += 1;
    }
    working = next;
  }
  result.notes = working;
  return result;
}

export function pastePattern(options: PasteOptions): PasteResult {
  const { snapshot, clipboard, targetTrackId, playheadTick } = options;
  const makeId = options.makeId ?? (() => crypto.randomUUID());
  const report = emptyReport();

  const orderedTracks = [...snapshot.tracks].sort((a, b) => a.order - b.order);
  const targetIndex = orderedTracks.findIndex((t) => t.id === targetTrackId);
  if (targetIndex < 0 || clipboard.notes.length === 0) {
    return { snapshot, pastedIds: [], report };
  }

  const newTracks: DraftTrack[] = [];
  const destinationBySource = new Map<string, string | null>();
  const sourceOrder =
    clipboard.tracks.length > 0
      ? clipboard.tracks
      : [{ id: clipboard.notes[0].trackId, name: "", order: 0, instrument: null }];

  sourceOrder.forEach((source, k) => {
    const existing = orderedTracks[targetIndex + k];
    if (existing) {
      destinationBySource.set(source.id, existing.id);
      return;
    }
    if (snapshot.tracks.length + newTracks.length >= options.maxTracks) {
      destinationBySource.set(source.id, null);
      return;
    }
    const index = snapshot.tracks.length + newTracks.length;
    const created: DraftTrack = {
      id: makeId(),
      name: source.name || `Track ${index + 1}`,
      order: index,
      color:
        options.trackColors.find(
          (c) =>
            ![...snapshot.tracks, ...newTracks].some(
              (t) => t.color.toLowerCase() === c.toLowerCase(),
            ),
        ) ?? options.trackColors[index % options.trackColors.length],
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
      instrument: source.instrument,
    };
    newTracks.push(created);
    destinationBySource.set(source.id, created.id);
    report.createdTracks += 1;
  });

  const ratio = clipboard.ppq > 0 ? snapshot.meta.ppq / clipboard.ppq : 1;
  const minStart = Math.min(...clipboard.notes.map((n) => n.start));
  const basePlayhead = Math.max(0, Math.round(playheadTick));

  const pasted: DraftNote[] = [];
  for (const source of clipboard.notes) {
    const destination = destinationBySource.get(source.trackId);
    if (!destination) {
      report.skippedNoTrack += 1;
      continue;
    }
    if (!isValidPitch(source.pitch)) {
      report.skippedInvalid += 1;
      continue;
    }
    pasted.push({
      ...source,
      id: makeId(),
      trackId: destination,
      start: basePlayhead + Math.round((source.start - minStart) * ratio),
      duration: Math.max(1, Math.round(source.duration * ratio)),
      velocity: Math.min(127, Math.max(1, Math.round(source.velocity))),
    });
  }

  const trimmed = trimOverlappingNotes(snapshot.notes, pasted, makeId);
  const working = trimmed.notes;
  report.trimmed += trimmed.trimmed;
  report.removed += trimmed.removed;
  report.split += trimmed.split;

  report.pasted = pasted.length;
  if (pasted.length === 0) {
    return { snapshot, pastedIds: [], report: { ...report, createdTracks: 0 } };
  }

  return {
    snapshot: {
      ...snapshot,
      tracks: [...snapshot.tracks, ...newTracks],
      notes: [...working, ...pasted],
    },
    pastedIds: pasted.map((n) => n.id),
    report,
  };
}

export function describePaste(report: PasteReport): {
  message: string;
  variant: "success" | "warning";
} {
  const parts = [
    report.pasted > 0 ? `Đã dán ${report.pasted} nốt.` : "Không có nốt nào được dán.",
  ];
  if (report.createdTracks > 0) {
    parts.push(`Tạo thêm ${report.createdTracks} track.`);
  }
  const touched = report.trimmed + report.removed + report.split;
  if (touched > 0) {
    const detail: string[] = [];
    if (report.trimmed > 0) detail.push(`cắt bớt ${report.trimmed} nốt`);
    if (report.split > 0) detail.push(`tách ${report.split} nốt`);
    if (report.removed > 0) detail.push(`xoá ${report.removed} nốt bị phủ hoàn toàn`);
    parts.push(`Các nốt cùng cao độ bị chồng nên đã ${detail.join(", ")}.`);
  }
  if (report.skippedNoTrack > 0) {
    parts.push(
      `${report.skippedNoTrack} nốt không được dán vì đã đủ số track tối đa.`,
    );
  }
  if (report.skippedInvalid > 0) {
    parts.push(`${report.skippedInvalid} nốt không hợp lệ đã bị bỏ qua.`);
  }
  const warning = touched > 0 || report.skippedNoTrack > 0 || report.skippedInvalid > 0;
  return { message: parts.join(" "), variant: warning ? "warning" : "success" };
}
