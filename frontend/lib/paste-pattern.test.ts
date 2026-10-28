import { describe, expect, it } from "vitest";
import type { DraftNote, DraftSnapshot, DraftTrack } from "@stave/shared-types";
import {
  buildClipboard,
  describePaste,
  pastePattern,
  type PatternClipboard,
} from "./paste-pattern";

let counter = 0;
const makeId = () => `new-${++counter}`;

function track(id: string, order: number, name = id): DraftTrack {
  return {
    id,
    name,
    order,
    color: "#000000",
    muted: false,
    solo: false,
    volume: 1,
    pan: 0,
    instrument: null,
  };
}

function note(
  id: string,
  trackId: string,
  start: number,
  duration: number,
  pitch = 60,
): DraftNote {
  return { id, trackId, pitch, start, duration, velocity: 80 };
}

function snapshot(
  tracks: DraftTrack[],
  notes: DraftNote[],
  ppq = 480,
): DraftSnapshot {
  return {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq },
    tracks,
    notes,
  };
}

const COLORS = ["#111111", "#222222"];

describe("pastePattern", () => {
  it("keeps relative timing from the playhead and gives pasted notes new ids", () => {
    const source = snapshot([track("a", 0)], [
      note("n1", "a", 100, 50),
      note("n2", "a", 300, 50, 64),
    ]);
    const clipboard = buildClipboard(source, new Set(["n1", "n2"]))!;
    const dest = snapshot([track("t", 0)], []);
    const result = pastePattern({
      snapshot: dest,
      clipboard,
      targetTrackId: "t",
      playheadTick: 1000,
      maxTracks: 32,
      trackColors: COLORS,
      makeId,
    });
    const starts = result.snapshot.notes.map((n) => n.start).sort((x, y) => x - y);
    expect(starts).toEqual([1000, 1200]);
    expect(result.snapshot.notes.every((n) => n.id.startsWith("new-"))).toBe(true);
    expect(result.pastedIds).toHaveLength(2);
  });

  it("scales ticks when pasting into a project with a different ppq", () => {
    const source = snapshot([track("a", 0)], [note("n1", "a", 0, 960)], 960);
    const clipboard = buildClipboard(source, new Set(["n1"]))!;
    const dest = snapshot([track("t", 0)], [], 480);
    const result = pastePattern({
      snapshot: dest,
      clipboard,
      targetTrackId: "t",
      playheadTick: 480,
      maxTracks: 32,
      trackColors: COLORS,
      makeId,
    });
    expect(result.snapshot.notes[0]).toMatchObject({ start: 480, duration: 480 });
  });

  it("pastes a multi-track pattern onto the target track and the tracks beneath it", () => {
    const source = snapshot(
      [track("a", 0, "Lead"), track("b", 1, "Bass")],
      [note("n1", "a", 0, 100), note("n2", "b", 0, 100, 40)],
    );
    const clipboard = buildClipboard(source, new Set(["n1", "n2"]))!;
    const dest = snapshot([track("t1", 0), track("t2", 1)], []);
    const result = pastePattern({
      snapshot: dest,
      clipboard,
      targetTrackId: "t1",
      playheadTick: 0,
      maxTracks: 32,
      trackColors: COLORS,
      makeId,
    });
    const byTrack = new Map(result.snapshot.notes.map((n) => [n.pitch, n.trackId]));
    expect(byTrack.get(60)).toBe("t1");
    expect(byTrack.get(40)).toBe("t2");
    expect(result.report.createdTracks).toBe(0);
  });

  it("creates tracks when there are not enough, up to the track limit", () => {
    const source = snapshot(
      [track("a", 0, "Lead"), track("b", 1, "Bass"), track("c", 2, "Pad")],
      [
        note("n1", "a", 0, 100),
        note("n2", "b", 0, 100, 40),
        note("n3", "c", 0, 100, 50),
      ],
    );
    const clipboard = buildClipboard(source, new Set(["n1", "n2", "n3"]))!;
    const dest = snapshot([track("t", 0)], []);
    const result = pastePattern({
      snapshot: dest,
      clipboard,
      targetTrackId: "t",
      playheadTick: 0,
      maxTracks: 2,
      trackColors: COLORS,
      makeId,
    });
    expect(result.snapshot.tracks).toHaveLength(2);
    expect(result.snapshot.tracks[1].name).toBe("Bass");
    expect(result.report.createdTracks).toBe(1);
    expect(result.report.skippedNoTrack).toBe(1);
    expect(result.snapshot.notes).toHaveLength(2);
  });

  it("splits an existing note that spans the whole pasted range and ignores other pitches", () => {
    const clipboard: PatternClipboard = {
      notes: [note("c1", "a", 0, 100)],
      tracks: [{ id: "a", name: "a", order: 0, instrument: null }],
      ppq: 480,
    };
    const dest = snapshot(
      [track("t", 0)],
      [
        note("before", "t", 50, 100),
        note("middle", "t", 200, 200),
        note("other-pitch", "t", 0, 500, 61),
      ],
    );
    const result = pastePattern({
      snapshot: dest,
      clipboard,
      targetTrackId: "t",
      playheadTick: 220,
      maxTracks: 32,
      trackColors: COLORS,
      makeId,
    });
    const before = result.snapshot.notes.find((n) => n.id === "before");
    expect(before).toMatchObject({ start: 50, duration: 100 });
    const middle = result.snapshot.notes.find((n) => n.id === "middle");
    expect(middle).toMatchObject({ start: 200, duration: 20 });
    const tail = result.snapshot.notes.find(
      (n) => n.id !== "middle" && n.start === 320 && n.pitch === 60,
    );
    expect(tail).toMatchObject({ duration: 80 });
    expect(result.snapshot.notes.find((n) => n.id === "other-pitch")).toBeDefined();
    expect(result.report.split).toBe(1);
  });

  it("removes an existing note that is fully covered and trims one that overlaps its start", () => {
    const clipboard: PatternClipboard = {
      notes: [note("c1", "a", 0, 100)],
      tracks: [{ id: "a", name: "a", order: 0, instrument: null }],
      ppq: 480,
    };
    const dest = snapshot(
      [track("t", 0)],
      [note("covered", "t", 10, 20), note("late", "t", 90, 100)],
    );
    const result = pastePattern({
      snapshot: dest,
      clipboard,
      targetTrackId: "t",
      playheadTick: 0,
      maxTracks: 32,
      trackColors: COLORS,
      makeId,
    });
    expect(result.snapshot.notes.find((n) => n.id === "covered")).toBeUndefined();
    expect(result.snapshot.notes.find((n) => n.id === "late")).toMatchObject({
      start: 100,
      duration: 90,
    });
    expect(result.report.removed).toBe(1);
    expect(result.report.trimmed).toBe(1);
  });

  it("rejects notes whose pitch is outside 0 to 127", () => {
    const clipboard: PatternClipboard = {
      notes: [note("bad", "a", 0, 100, 130), note("ok", "a", 0, 100, 60)],
      tracks: [{ id: "a", name: "a", order: 0, instrument: null }],
      ppq: 480,
    };
    const result = pastePattern({
      snapshot: snapshot([track("t", 0)], []),
      clipboard,
      targetTrackId: "t",
      playheadTick: 0,
      maxTracks: 32,
      trackColors: COLORS,
      makeId,
    });
    expect(result.report.skippedInvalid).toBe(1);
    expect(result.snapshot.notes).toHaveLength(1);
  });

  it("returns the original snapshot and creates no track when no note can be pasted", () => {
    const clipboard: PatternClipboard = {
      notes: [note("bad", "a", 0, 100, 130)],
      tracks: [
        { id: "a", name: "a", order: 0, instrument: null },
        { id: "b", name: "b", order: 1, instrument: null },
      ],
      ppq: 480,
    };
    const dest = snapshot([track("t", 0)], []);
    const result = pastePattern({
      snapshot: dest,
      clipboard,
      targetTrackId: "t",
      playheadTick: 0,
      maxTracks: 32,
      trackColors: COLORS,
      makeId,
    });
    expect(result.snapshot).toBe(dest);
    expect(result.report.createdTracks).toBe(0);
    expect(describePaste(result.report).message).toContain("Không có nốt nào được dán");
  });

  it("does nothing when the target track does not exist", () => {
    const clipboard = buildClipboard(
      snapshot([track("a", 0)], [note("n1", "a", 0, 10)]),
      new Set(["n1"]),
    )!;
    const dest = snapshot([track("t", 0)], []);
    const result = pastePattern({
      snapshot: dest,
      clipboard,
      targetTrackId: "missing",
      playheadTick: 0,
      maxTracks: 32,
      trackColors: COLORS,
      makeId,
    });
    expect(result.snapshot).toBe(dest);
    expect(result.pastedIds).toEqual([]);
  });
});

describe("describePaste", () => {
  it("reports what changed when existing notes were trimmed", () => {
    const { message, variant } = describePaste({
      pasted: 3,
      createdTracks: 1,
      trimmed: 2,
      removed: 1,
      split: 0,
      skippedNoTrack: 0,
      skippedInvalid: 0,
    });
    expect(variant).toBe("warning");
    expect(message).toContain("Đã dán 3 nốt");
    expect(message).toContain("cắt bớt 2 nốt");
    expect(message).toContain("xoá 1 nốt");
  });

  it("is a plain success when nothing else changed", () => {
    expect(
      describePaste({
        pasted: 2,
        createdTracks: 0,
        trimmed: 0,
        removed: 0,
        split: 0,
        skippedNoTrack: 0,
        skippedInvalid: 0,
      }).variant,
    ).toBe("success");
  });
});
