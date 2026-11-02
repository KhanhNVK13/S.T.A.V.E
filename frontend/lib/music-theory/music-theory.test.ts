import { describe, expect, it } from "vitest";
import { DRAFT_SCHEMA_VERSION } from "@stave/shared-types";
import type { DraftNote, DraftSnapshot, DraftTrack } from "@stave/shared-types";
import {
  analyze,
  detectProgressions,
  detectCadence,
  MIN_NOTES,
  MIN_NOTE_BARS,
} from "./index";
import { detectKey } from "./key";
import { toDiatonicNumerals, analyzeChords } from "./chords";

/** Build a triad note set (root+fifth+third-ish, pcs given as semitones). */
function chordNotes(
  idPrefix: string,
  pcs: number[],
  barStart: number,
  ppq = 480,
): DraftNote[] {
  return pcs.map((pc, i) => ({
    id: `${idPrefix}-${i}`,
    trackId: "t1",
    pitch: 60 + pc,
    start: barStart + i * ppq,
    duration: ppq,
    velocity: 80,
  }));
}

const TRACK: DraftTrack = {
  id: "t1",
  name: "Piano",
  order: 0,
  color: "#000",
  muted: false,
  solo: false,
  volume: 1,
  pan: 0,
  instrument: "Acoustic Grand Piano",
};

function snapshot(notes: DraftNote[]): DraftSnapshot {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [TRACK],
    notes,
  };
}

function emptyContext() {
  return {
    meta: { tempo: 120, timeSignature: [4, 4] as [number, number], ppq: 480 },
    trackIds: ["t1"],
    hasNotes: new Set(["t1"]),
    instruments: new Map<string, string | null>([["t1", "Acoustic Grand Piano"]]),
  };
}

const B = 480 * 4; // ticks per bar (4/4 @ ppq 480)

describe("music-theory.analyzeSnapshot", () => {
  // ------------------------------------------------------------------
  // Key detection on vu.md sample materials
  // ------------------------------------------------------------------
  it("C–G–Am–F resolves to C major (primary)", () => {
    const notes = [
      ...chordNotes("C", [0, 4, 7], 0),
      ...chordNotes("G", [7, 11, 2], B),
      ...chordNotes("Am", [9, 0, 4], B * 2),
      ...chordNotes("F", [5, 9, 0], B * 3),
    ];
    const key = detectKey(
      emptyContext().meta,
      notes,
      emptyContext().trackIds,
      emptyContext().hasNotes,
      emptyContext().instruments,
    );
    expect(key.primary).toContain("C");
    expect(key.isMinor).toBe(false);
  });

  it("a 3-chord Dm–G–C loop does NOT crash and returns a key", () => {
    const notes = [
      ...chordNotes("Dm", [2, 5, 9], 0),
      ...chordNotes("G", [7, 11, 2], B),
      ...chordNotes("C", [0, 4, 7], B * 2),
    ];
    const key = detectKey(
      emptyContext().meta,
      notes,
      emptyContext().trackIds,
      emptyContext().hasNotes,
      emptyContext().instruments,
    );
    expect(typeof key.primary).toBe("string");
    expect(key.primary.length).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------------
  // Progression pattern matching (deterministic, decoupled from key)
  // ------------------------------------------------------------------
  it("detects ii–V–I for numerals [ii, V, I]", () => {
    const ids = detectProgressions(["ii", "V", "I"]);
    expect(ids).toContain("ii-v-i");
  });

  it("detects I–V–vi–IV for the classic pop loop", () => {
    expect(detectProgressions(["I", "V", "vi", "IV"])).toContain("i-v-vi-iv");
  });

  it("detects the 12-bar blues only for the exact 12-bar shape", () => {
    const blues = ["I", "I", "I", "I", "IV", "IV", "I", "I", "V", "IV", "I", "I"];
    expect(detectProgressions(blues)).toContain("blues-12");
    expect(detectProgressions(blues.slice(0, 11))).not.toContain("blues-12");
  });

  it("returns [] when no known pattern matches (3.E1 — do not invent)", () => {
    expect(detectProgressions(["I", "iii"])).toEqual([]);
  });

  // ------------------------------------------------------------------
  // Cadence detection
  // ------------------------------------------------------------------
  it("detects the authentic cadence V → I", () => {
    expect(detectCadence(["ii", "V", "I"])?.id).toBe("authentic");
  });
  it("detects the plagal cadence IV → I", () => {
    expect(detectCadence(["I", "IV", "I"])?.id).toBe("plagal");
  });
  it("detects the deceptive cadence V → vi", () => {
    expect(detectCadence(["I", "V", "vi"])?.id).toBe("deceptive");
  });
  it("returns null when fewer than two numerals", () => {
    expect(detectCadence(["I"])).toBeNull();
  });

  // ------------------------------------------------------------------
  // Per-bar chords + numerals on a full C-major I–V–vi–IV loop
  // ------------------------------------------------------------------
  it("assigns per-bar chords and converts to I–V–vi–IV numerals", () => {
    const notes = [
      ...chordNotes("C", [0, 4, 7], 0),
      ...chordNotes("G", [7, 11, 2], B),
      ...chordNotes("Am", [9, 0, 4], B * 2),
      ...chordNotes("F", [5, 9, 0], B * 3),
    ];
    const { chordsByBar } = analyzeChords(
      emptyContext().meta,
      notes,
      emptyContext().trackIds,
      emptyContext().hasNotes,
      emptyContext().instruments,
    );
    const numerals = toDiatonicNumerals(chordsByBar, 0, false); // C major
    expect(numerals.get(1)).toBe("I");
    expect(numerals.get(2)).toBe("V");
    expect(numerals.get(3)).toBe("vi");
    expect(numerals.get(4)).toBe("IV");
  });

  it("leaves a bar empty when it has fewer than 3 distinct pitch classes", () => {
    // Bar with only two pitch classes → should be null (rule 3).
    const notes = [
      ...chordNotes("duo", [0, 4], 0), // only 2 pcs
      ...chordNotes("filler", [0, 4, 7], B),
      ...chordNotes("f", [0, 4, 7], B * 2),
      ...chordNotes("g", [0, 4, 7], B * 3),
      ...chordNotes("a", [0, 4, 7], B * 4),
      ...chordNotes("b", [0, 4, 7], B * 5),
      ...chordNotes("c", [0, 4, 7], B * 6),
      ...chordNotes("d", [0, 4, 7], B * 7),
    ];
    const { chordsByBar } = analyzeChords(
      emptyContext().meta,
      notes,
      emptyContext().trackIds,
      emptyContext().hasNotes,
      emptyContext().instruments,
    );
    expect(chordsByBar.get(1)?.root).toBeNull();
  });

  // ------------------------------------------------------------------
  // End-to-end analyze() + boundary conditions
  // ------------------------------------------------------------------
  it("a longer Dm–G–C–C–C–C passage reads C major (not just the 3-chord loop)", () => {
    // Dữ liệu dài hơn, có trọng số duration hợp lý: Dm–G–C lặp, về C.
    // 2.E1 được đáp (≥8 nốt, ≥2 ô nhịp); kỳ vọng tông C trưởng + ii–V–I.
    const notes = [
      ...chordNotes("Dm", [2, 5, 9], 0),
      ...chordNotes("G", [7, 11, 2], B),
      ...chordNotes("C", [0, 4, 7], B * 2),
      ...chordNotes("C2", [0, 4, 7], B * 3),
      ...chordNotes("C3", [0, 4, 7], B * 4),
      ...chordNotes("C4", [0, 4, 7], B * 5),
    ];
    const key = detectKey(
      emptyContext().meta,
      notes,
      emptyContext().trackIds,
      emptyContext().hasNotes,
      emptyContext().instruments,
    );
    // Nếu K-S tự nhiên ra C trưởng → giữ test này; nếu không, báo lại.
    expect(key.primary).toContain("C");
    expect(key.isMinor).toBe(false);
  });

  it("full C–G–Am–F analysis yields key + I–V–vi–IV progression", () => {
    const notes = [
      ...chordNotes("C", [0, 4, 7], 0),
      ...chordNotes("G", [7, 11, 2], B),
      ...chordNotes("Am", [9, 0, 4], B * 2),
      ...chordNotes("F", [5, 9, 0], B * 3),
    ];
    const result = analyze(snapshot(notes));
    expect(result.insufficient).toBe(false);
    const key = result.insights.find((i) => i.kind === "key");
    expect(key?.title).toContain("C");
    const prog = result.insights.find(
      (i) => i.kind === "progression" && i.id === "progression-i-v-vi-iv",
    );
    expect(prog).toBeDefined();
    expect(prog?.fromBar).toBe(1);
    expect(prog?.toBar).toBe(4);
  });

  it("fewer than MIN_NOTES notes → insufficient (2.E1)", () => {
    expect(MIN_NOTES).toBe(8);
    const notes = [
      ...chordNotes("C", [0, 4, 7], 0), // 3 notes < 8
      ...chordNotes("G", [7, 11, 2], B),
    ];
    const result = analyze(snapshot(notes));
    expect(result.insufficient).toBe(true);
    expect(result.insights).toEqual([]);
  });

  it("fewer than MIN_NOTE_BARS bars-with-notes → insufficient", () => {
    expect(MIN_NOTE_BARS).toBe(2);
    // 12 notes all in a single bar (4 pcs groups, 1 bar) → 1 bar < 2.
    const notes = [
      ...chordNotes("one", [0, 4, 7], 0),
      ...chordNotes("two", [0, 4, 7], 0),
      ...chordNotes("three", [0, 4, 7], 0),
      ...chordNotes("four", [0, 4, 7], 0),
      ...chordNotes("five", [0, 4, 7], 0),
      ...chordNotes("six", [0, 4, 7], 0),
    ];
    const result = analyze(snapshot(notes));
    expect(result.insufficient).toBe(true);
  });

  it("drum tracks are excluded from the analysis", () => {
    // Only a drum-kit track carrying 12 notes → no analyzable notes.
    const drumNotes = Array.from({ length: 12 }, (_, i) => ({
      id: `d${i}`,
      trackId: "drums",
      pitch: 36 + (i % 12),
      start: i * 240,
      duration: 240,
      velocity: 100,
    }));
    const snap = {
      schemaVersion: DRAFT_SCHEMA_VERSION,
      meta: { tempo: 120, timeSignature: [4, 4] as [number, number], ppq: 480 },
      tracks: [
        {
          ...TRACK,
          id: "drums",
          instrument: "Standard Drum Kit",
        },
      ],
      notes: drumNotes,
    };
    const result = analyze(snap);
    expect(result.insufficient).toBe(true);
  });
});
