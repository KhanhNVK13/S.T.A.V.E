import { describe, expect, it } from "vitest";
import { isBranchAhead } from "./branch-moved";

describe("FE-BRM-01 isBranchAhead(input)", () => {
  const base = { openBranchId: "b1", movedBranchId: "b1", knownHeadId: "c1", newHeadId: "c2" };

  it("UTCID01 flags a new head on the branch the user has open", () => {
    expect(isBranchAhead(base)).toBe(true);
  });

  it("UTCID02 ignores a commit on another branch", () => {
    expect(isBranchAhead({ ...base, movedBranchId: "b2" })).toBe(false);
  });

  it("UTCID03 ignores the user's own commit, which is already the known head", () => {
    expect(isBranchAhead({ ...base, newHeadId: "c1" })).toBe(false);
  });

  it("UTCID04 ignores an event without a head", () => {
    expect(isBranchAhead({ ...base, newHeadId: null })).toBe(false);
  });

  it("UTCID05 ignores events while no branch is open", () => {
    expect(isBranchAhead({ ...base, openBranchId: null })).toBe(false);
  });

  it("UTCID06 flags the first commit made on a branch that had none", () => {
    expect(isBranchAhead({ ...base, knownHeadId: null })).toBe(true);
  });
});
