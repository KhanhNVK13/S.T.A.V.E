import { describe, expect, it } from "vitest";
import { nextRadioIndex } from "./radio-group-nav";

describe("nextRadioIndex", () => {
  it("moves forward and wraps around", () => {
    expect(nextRadioIndex(0, "ArrowRight", 5)).toBe(1);
    expect(nextRadioIndex(4, "ArrowDown", 5)).toBe(0);
  });

  it("moves backward and wraps around", () => {
    expect(nextRadioIndex(2, "ArrowLeft", 5)).toBe(1);
    expect(nextRadioIndex(0, "ArrowUp", 5)).toBe(4);
  });

  it("jumps to the ends with Home and End", () => {
    expect(nextRadioIndex(3, "Home", 5)).toBe(0);
    expect(nextRadioIndex(1, "End", 5)).toBe(4);
  });

  it("ignores other keys and empty groups", () => {
    expect(nextRadioIndex(1, "Enter", 5)).toBeNull();
    expect(nextRadioIndex(0, "ArrowRight", 0)).toBeNull();
  });
});
