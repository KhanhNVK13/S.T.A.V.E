import type { DraftNote, DraftSnapshot } from "@stave/shared-types";
import type { SnapshotDiff } from "../../lib/api-client";

export type NoteKind = "added" | "removed" | "modified" | "unchanged";

export interface GridNote {
  note: DraftNote;
  kind: NoteKind;
  old?: DraftNote;
}

export interface BarChanges {
  bar: number;
  added: DraftNote[];
  removed: DraftNote[];
  modified: { old: DraftNote; new: DraftNote }[];
}

export function buildGridNotes(
  diff: SnapshotDiff,
  baseSnap: DraftSnapshot,
  targetSnap: DraftSnapshot,
  trackFilter: string,
  changedOnly: boolean,
): GridNote[] {
  const addedTrackIds = new Set(diff.tracksDiff.added.map((t) => t.id));
  const addedIds = new Set<string>();
  const modified = new Map<string, DraftNote>();
  for (const bar of Object.values(diff.changesByBar)) {
    bar.added.forEach((n) => addedIds.add(n.id));
    bar.modified.forEach((m) => modified.set(m.new.id, m.old));
  }

  const out: GridNote[] = [];
  for (const note of targetSnap.notes) {
    if (modified.has(note.id)) {
      out.push({ note, kind: "modified", old: modified.get(note.id) });
    } else if (addedIds.has(note.id) || addedTrackIds.has(note.trackId)) {
      out.push({ note, kind: "added" });
    } else {
      out.push({ note, kind: "unchanged" });
    }
  }
  const targetIds = new Set(targetSnap.notes.map((n) => n.id));
  for (const note of baseSnap.notes) {
    if (!targetIds.has(note.id)) out.push({ note, kind: "removed" });
  }

  return out.filter(
    (g) =>
      (!changedOnly || g.kind !== "unchanged") &&
      (trackFilter === "all" || g.note.trackId === trackFilter || g.old?.trackId === trackFilter),
  );
}

export function buildBarChanges(diff: SnapshotDiff, trackFilter: string): BarChanges[] {
  const keep = (n: DraftNote) => trackFilter === "all" || n.trackId === trackFilter;
  return Object.entries(diff.changesByBar)
    .map(([bar, changes]) => ({
      bar: Number(bar),
      added: changes.added.filter(keep),
      removed: changes.removed.filter(keep),
      modified: changes.modified.filter((m) => keep(m.new) || keep(m.old)),
    }))
    .filter((b) => b.added.length + b.removed.length + b.modified.length > 0)
    .sort((a, b) => a.bar - b.bar);
}

export function countAffected(diff: SnapshotDiff): { bars: number; tracks: number } {
  const tracks = new Set<string>();
  let bars = 0;
  for (const change of Object.values(diff.changesByBar)) {
    const size = change.added.length + change.removed.length + change.modified.length;
    if (size === 0) continue;
    bars += 1;
    change.added.forEach((n) => tracks.add(n.trackId));
    change.removed.forEach((n) => tracks.add(n.trackId));
    change.modified.forEach((m) => tracks.add(m.new.trackId));
  }
  return { bars, tracks: tracks.size };
}

export const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
