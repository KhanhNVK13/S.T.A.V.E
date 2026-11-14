import { describe, expect, it } from "vitest";
import type { MergeConflictResult } from "../../lib/api-client";
import {
  conflictSignature,
  forgetChoices,
  initialChoices,
  rememberChoices,
  shouldForgetChoices,
  tallyChoices,
} from "./merge-model";

const conflict = (noteId: string) => ({ noteId, type: "MODIFIED_DIFFERENTLY" as const });

const result = {
  hasConflicts: true,
  conflictsCount: 3,
  conflictsByBar: { "1": [conflict("a")], "3": [conflict("b"), conflict("c")] },
} as MergeConflictResult;

describe("merge conflict choices", () => {
  it("defaults to keeping our side", () => {
    const sig = conflictSignature(result, "feature", "main");
    expect(initialChoices(result, sig)).toEqual({ a: "PICK_TARGET", b: "PICK_TARGET", c: "PICK_TARGET" });
  });

  it("restores remembered choices for the same conflicts after close and reopen", () => {
    const sig = conflictSignature(result, "feature", "main");
    rememberChoices(sig, { a: "PICK_SOURCE", b: "PICK_TARGET", c: "PICK_SOURCE" });
    expect(initialChoices(result, sig)).toEqual({ a: "PICK_SOURCE", b: "PICK_TARGET", c: "PICK_SOURCE" });
  });

  it("does not leak choices into a different conflict set", () => {
    const other = { ...result, conflictsByBar: { "1": [conflict("z")] } } as MergeConflictResult;
    const sig = conflictSignature(other, "feature", "main");
    expect(sig).not.toBe(conflictSignature(result, "feature", "main"));
    expect(initialChoices(other, sig)).toEqual({ z: "PICK_TARGET" });
  });

  it("tallies the two sides", () => {
    expect(tallyChoices({ a: "PICK_SOURCE", b: "PICK_TARGET", c: "PICK_SOURCE" })).toEqual({ ours: 1, theirs: 2 });
    expect(tallyChoices({ a: "KEEP_BOTH", b: "PICK_TARGET" })).toEqual({ ours: 2, theirs: 1 });
  });

  it("returns to the defaults once the choices are forgotten", () => {
    const sig = conflictSignature(result, "feature", "main");
    rememberChoices(sig, { a: "PICK_SOURCE", b: "PICK_SOURCE", c: "PICK_SOURCE" });
    expect(initialChoices(result, sig).a).toBe("PICK_SOURCE");
    forgetChoices(sig);
    expect(initialChoices(result, sig)).toEqual({ a: "PICK_TARGET", b: "PICK_TARGET", c: "PICK_TARGET" });
  });

  it("forgets only after a resolve that was neither cancelled nor failed", () => {
    expect(shouldForgetChoices({ resolveRequested: true, cancelled: false, error: null })).toBe(true);
    expect(shouldForgetChoices({ resolveRequested: false, cancelled: false, error: null })).toBe(false);
    expect(shouldForgetChoices({ resolveRequested: true, cancelled: true, error: null })).toBe(false);
    expect(shouldForgetChoices({ resolveRequested: true, cancelled: false, error: "boom" })).toBe(false);
  });
});
