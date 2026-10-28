import { describe, expect, it } from "vitest";
import type { DraftNote } from "@stave/shared-types";
import { quantizeNotes } from "./quantize-notes";

function note(id: string, start: number, extra: Partial<DraftNote> = {}): DraftNote {
  return { id, trackId: "t1", pitch: 60, start, duration: 120, velocity: 80, ...extra };
}

describe("quantizeNotes", () => {
  it("moves off-grid notes and counts them", () => {
    const result = quantizeNotes([note("a", 100), note("b", 240)], 120, null);
    expect(result.notes.map((n) => n.start)).toEqual([120, 240]);
    expect(result.moved).toBe(1);
    expect(result.collisions).toBe(0);
  });

  it("only touches the target notes", () => {
    const result = quantizeNotes([note("a", 100), note("b", 130)], 120, new Set(["a"]));
    expect(result.notes.map((n) => n.start)).toEqual([120, 130]);
    expect(result.moved).toBe(1);
  });

  it("keeps the later note in place when two notes would land on the same slot", () => {
    const result = quantizeNotes([note("a", 110), note("b", 130)], 120, null);
    expect(result.notes.map((n) => n.start)).toEqual([120, 130]);
    expect(result.moved).toBe(1);
    expect(result.collisions).toBe(1);
  });

  it("does not move a note onto a target note that is already on the grid", () => {
    const result = quantizeNotes([note("a", 100), note("b", 120)], 120, null);
    expect(result.notes.map((n) => n.start)).toEqual([100, 120]);
    expect(result.collisions).toBe(1);
  });

  it("allows the same slot on different pitches", () => {
    const result = quantizeNotes([note("a", 100), note("b", 120, { pitch: 62 })], 120, null);
    expect(result.notes.map((n) => n.start)).toEqual([120, 120]);
    expect(result.collisions).toBe(0);
  });
});
