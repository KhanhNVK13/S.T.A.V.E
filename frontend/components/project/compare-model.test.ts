import { describe, expect, it } from "vitest";
import type { DraftNote, DraftSnapshot } from "@stave/shared-types";
import type { SnapshotDiff } from "../../lib/api-client";
import { buildBarChanges, buildGridNotes, countAffected } from "./compare-model";

const note = (id: string, trackId: string, pitch = 60, velocity = 80, start = 0): DraftNote =>
  ({ id, trackId, pitch, velocity, start, duration: 480 }) as DraftNote;

const snap = (notes: DraftNote[]) => ({ notes, tracks: [], meta: {} }) as unknown as DraftSnapshot;

const diff = {
  areIdentical: false,
  metaChanges: [],
  summary: { notes: { added: 1, removed: 1, modified: 1, totalChanges: 3 }, tracks: { added: 0, removed: 0, modified: 0 } },
  tracksDiff: { added: [], removed: [], modified: [], noteCounts: {} },
  changesByBar: {
    "2": { added: [note("n-add", "t1")], removed: [], modified: [] },
    "1": {
      added: [],
      removed: [note("n-del", "t2")],
      modified: [{ old: note("n-mod", "t2", 62, 60), new: note("n-mod", "t2", 62, 100) }],
    },
  },
} as unknown as SnapshotDiff;

const base = snap([note("n-del", "t2"), note("n-mod", "t2", 62, 60), note("n-same", "t1", 64)]);
const target = snap([note("n-add", "t1"), note("n-mod", "t2", 62, 100), note("n-same", "t1", 64)]);

describe("compare model", () => {
  it("classifies every note into exactly the three diff kinds plus unchanged", () => {
    const kinds = Object.fromEntries(buildGridNotes(diff, base, target, "all", false).map((g) => [g.note.id, g.kind]));
    expect(kinds).toEqual({ "n-add": "added", "n-mod": "modified", "n-same": "unchanged", "n-del": "removed" });
  });

  it("hides unchanged notes when asked and filters by track", () => {
    expect(buildGridNotes(diff, base, target, "all", true).map((g) => g.note.id).sort()).toEqual(["n-add", "n-del", "n-mod"]);
    expect(buildGridNotes(diff, base, target, "t1", false).map((g) => g.note.id).sort()).toEqual(["n-add", "n-same"]);
  });

  it("keeps the old position of changed notes", () => {
    const mod = buildGridNotes(diff, base, target, "all", false).find((g) => g.kind === "modified");
    expect(mod?.old?.velocity).toBe(60);
  });

  it("sorts bars and counts affected bars and tracks", () => {
    expect(buildBarChanges(diff, "all").map((b) => b.bar)).toEqual([1, 2]);
    expect(buildBarChanges(diff, "t1").map((b) => b.bar)).toEqual([2]);
    expect(countAffected(diff)).toEqual({ bars: 2, tracks: 2 });
  });
});
