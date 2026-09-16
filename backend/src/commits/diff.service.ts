import { Injectable } from '@nestjs/common';
import type { DraftSnapshot, DraftNote, DraftTrack } from '@stave/shared-types';

/**
 * Result structure for snapshot comparison (UC-45)
 * Based on BR-46: Note diff grouped by UUID identity
 * Based on BR-28: Note identity preserved via UUID
 */
/** Một trường của `meta` khác nhau giữa 2 phiên bản (tempo, nhịp, ppq). */
export interface MetaChange {
  field: keyof DraftSnapshot['meta'];
  old: unknown;
  new: unknown;
}

export interface SnapshotDiff {
  areIdentical: boolean;
  /** Tempo / nhịp / ppq đổi — là trạng thái project nên phải báo (POST-1). */
  metaChanges: MetaChange[];
  summary: {
    notes: {
      added: number;
      removed: number;
      modified: number;
      totalChanges: number;
    };
    tracks: {
      added: number;
      removed: number;
      modified: number;
    };
  };
  tracksDiff: {
    added: DraftTrack[];
    removed: DraftTrack[];
    modified: Array<{ old: DraftTrack; new: DraftTrack }>;
    /**
     * UC-45 3.E2: số note của track được thêm/xoá NGUYÊN CẢ TRACK. Những note
     * này KHÔNG nằm trong `changesByBar`/`summary.notes` — báo 1 dòng "thêm
     * track X (N note)" thay vì liệt kê N note lẻ.
     */
    noteCounts: Record<string, number>;
  };
  changesByBar: Record<
    number,
    {
      added: DraftNote[];
      removed: DraftNote[];
      modified: Array<{ old: DraftNote; new: DraftNote }>;
    }
  >;
}

/**
 * Calculate ticks per bar from time signature and PPQ.
 * `ppq` là tick mỗi nốt đen, nên phải quy mẫu số nhịp về nốt đen:
 * [4, 4] @ 480 -> 1920, [6, 8] @ 480 -> 1440.
 *
 * Bản trước lấy `numerator * ppq` (bỏ qua mẫu số) — sai với mọi nhịp không
 * phải x/4, và lệch với `MergeService.groupConflictsByBar`, khiến cùng 1 note
 * nằm ở ô nhịp khác nhau giữa màn Compare và màn giải quyết xung đột.
 */
function calculateTicksPerBar(
  timeSignature: [number, number],
  ppq: number,
): number {
  const [numerator = 4, denominator = 4] = timeSignature ?? [4, 4];
  return ppq * (numerator / denominator) * 4;
}

/**
 * Calculate bar number (1-indexed) from note start time
 */
function calculateBarNumber(startTime: number, ticksPerBar: number): number {
  return Math.floor(startTime / ticksPerBar) + 1;
}

/**
 * Deep equality check for two values
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    return keysA.every((key) => {
      const valueA = (a as Record<string, unknown>)[key];
      const valueB = (b as Record<string, unknown>)[key];
      return deepEqual(valueA, valueB);
    });
  }

  return false;
}

/**
 * Check if a track has been modified
 * Tracks are compared by: name, volume, pan, muted, solo, color, instrument, order
 *
 * `instrument` từng bị bỏ sót: BR-33 ghi rõ việc gán nhạc cụ "appear in
 * version comparisons", nên đổi nhạc cụ mà không đổi gì khác phải hiện ra.
 */
function isTrackModified(oldTrack: DraftTrack, newTrack: DraftTrack): boolean {
  return (
    oldTrack.name !== newTrack.name ||
    (oldTrack.instrument ?? null) !== (newTrack.instrument ?? null) ||
    oldTrack.order !== newTrack.order ||
    oldTrack.volume !== newTrack.volume ||
    oldTrack.pan !== newTrack.pan ||
    oldTrack.muted !== newTrack.muted ||
    oldTrack.solo !== newTrack.solo ||
    oldTrack.color !== newTrack.color
  );
}

/**
 * Check if a note has been modified
 * Notes are compared by: pitch, start, duration, velocity, trackId
 * (id is used for identity, not comparison)
 */
function isNoteModified(oldNote: DraftNote, newNote: DraftNote): boolean {
  return (
    oldNote.pitch !== newNote.pitch ||
    oldNote.start !== newNote.start ||
    oldNote.duration !== newNote.duration ||
    oldNote.velocity !== newNote.velocity ||
    oldNote.trackId !== newNote.trackId
  );
}

@Injectable()
export class DiffService {
  /**
   * Compare two snapshots and return detailed diff
   *
   * UC-45, BR-46, BR-28:
   * - Note comparison is based on UUID (id field)
   * - Notes with same UUID but different properties are MODIFIED, not REMOVED+ADDED
   * - Diff is calculated on-the-fly, NOT stored in DB
   *
   * BR-46: Cross-branch comparison supported
   * - This service only compares snapshots, no branch logic here
   */
  compareSnapshots(
    snapshotA: DraftSnapshot,
    snapshotB: DraftSnapshot,
  ): SnapshotDiff {
    // Check if snapshots are identical (BR-46 exception 3.E1)
    if (deepEqual(snapshotA, snapshotB)) {
      return {
        areIdentical: true,
        metaChanges: [],
        summary: {
          notes: { added: 0, removed: 0, modified: 0, totalChanges: 0 },
          tracks: { added: 0, removed: 0, modified: 0 },
        },
        tracksDiff: { added: [], removed: [], modified: [], noteCounts: {} },
        changesByBar: {},
      };
    }

    // Calculate ticks per bar for bar grouping
    const ticksPerBar = calculateTicksPerBar(
      snapshotB.meta.timeSignature,
      snapshotB.meta.ppq,
    );

    // =========================================================================
    // Track Diff (BR-46, 3.E2)
    // =========================================================================
    const tracksA = new Map(snapshotA.tracks.map((t) => [t.id, t]));
    const tracksB = new Map(snapshotB.tracks.map((t) => [t.id, t]));

    const tracksDiff = {
      added: snapshotB.tracks.filter((t) => !tracksA.has(t.id)),
      removed: snapshotA.tracks.filter((t) => !tracksB.has(t.id)),
      modified: [] as Array<{ old: DraftTrack; new: DraftTrack }>,
      noteCounts: {} as Record<string, number>,
    };
    const addedTrackIds = new Set(tracksDiff.added.map((t) => t.id));
    const removedTrackIds = new Set(tracksDiff.removed.map((t) => t.id));

    // Modified tracks: exist in both but have different properties
    for (const [id, oldTrack] of tracksA) {
      if (tracksB.has(id)) {
        const newTrack = tracksB.get(id)!;
        if (isTrackModified(oldTrack, newTrack)) {
          tracksDiff.modified.push({ old: oldTrack, new: newTrack });
        }
      }
    }

    // =========================================================================
    // Note Diff (BR-28, BR-46)
    // =========================================================================
    const notesA = new Map(snapshotA.notes.map((n) => [n.id, n]));
    const notesB = new Map(snapshotB.notes.map((n) => [n.id, n]));

    const addedNotes: DraftNote[] = [];
    const removedNotes: DraftNote[] = [];
    const modifiedNotes: Array<{ old: DraftNote; new: DraftNote }> = [];

    // Find added notes (exist in B but not in A). Note thuộc track mới
    // thêm nguyên cả track chỉ được đếm vào track đó (3.E2).
    for (const [id, note] of notesB) {
      if (notesA.has(id)) continue;
      if (addedTrackIds.has(note.trackId)) {
        tracksDiff.noteCounts[note.trackId] =
          (tracksDiff.noteCounts[note.trackId] ?? 0) + 1;
      } else {
        addedNotes.push(note);
      }
    }

    // Find removed notes (exist in A but not in B) — tương tự cho track bị xoá.
    for (const [id, note] of notesA) {
      if (notesB.has(id)) continue;
      if (removedTrackIds.has(note.trackId)) {
        tracksDiff.noteCounts[note.trackId] =
          (tracksDiff.noteCounts[note.trackId] ?? 0) + 1;
      } else {
        removedNotes.push(note);
      }
    }

    // Find modified notes (exist in both but with different properties)
    for (const [id, oldNote] of notesA) {
      if (notesB.has(id)) {
        const newNote = notesB.get(id)!;
        if (isNoteModified(oldNote, newNote)) {
          modifiedNotes.push({ old: oldNote, new: newNote });
        }
      }
    }

    // =========================================================================
    // Group changes by bar (BR-46)
    // =========================================================================
    const changesByBar: Record<
      number,
      {
        added: DraftNote[];
        removed: DraftNote[];
        modified: Array<{ old: DraftNote; new: DraftNote }>;
      }
    > = {};

    const addNoteToBar = (
      bar: number,
      note: DraftNote,
      type: 'added' | 'removed' | 'modified',
      modifiedNote?: { old: DraftNote; new: DraftNote },
    ) => {
      if (!changesByBar[bar]) {
        changesByBar[bar] = { added: [], removed: [], modified: [] };
      }
      if (type === 'added') {
        changesByBar[bar].added.push(note);
      } else if (type === 'removed') {
        changesByBar[bar].removed.push(note);
      } else if (modifiedNote) {
        changesByBar[bar].modified.push(modifiedNote);
      }
    };

    // Group added notes by bar
    for (const note of addedNotes) {
      const bar = calculateBarNumber(note.start, ticksPerBar);
      addNoteToBar(bar, note, 'added');
    }

    // Group removed notes by bar (use old note's start time)
    for (const note of removedNotes) {
      const bar = calculateBarNumber(note.start, ticksPerBar);
      addNoteToBar(bar, note, 'removed');
    }

    // Group modified notes by bar (use new note's start time)
    for (const { old: oldNote, new: newNote } of modifiedNotes) {
      const bar = calculateBarNumber(newNote.start, ticksPerBar);
      addNoteToBar(bar, newNote, 'modified', { old: oldNote, new: newNote });
    }

    // =========================================================================
    // Build result
    // =========================================================================
    const metaChanges: MetaChange[] = (
      ['tempo', 'timeSignature', 'ppq'] as const
    )
      .filter(
        (field) => !deepEqual(snapshotA.meta?.[field], snapshotB.meta?.[field]),
      )
      .map((field) => ({
        field,
        old: snapshotA.meta?.[field],
        new: snapshotB.meta?.[field],
      }));

    return {
      areIdentical: false,
      metaChanges,
      summary: {
        notes: {
          added: addedNotes.length,
          removed: removedNotes.length,
          modified: modifiedNotes.length,
          totalChanges:
            addedNotes.length + removedNotes.length + modifiedNotes.length,
        },
        tracks: {
          added: tracksDiff.added.length,
          removed: tracksDiff.removed.length,
          modified: tracksDiff.modified.length,
        },
      },
      tracksDiff,
      changesByBar,
    };
  }
}
