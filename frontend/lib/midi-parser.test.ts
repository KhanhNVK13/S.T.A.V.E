import { describe, it, expect } from "vitest";
import { sanitizeTrackName } from "./midi-parser";

const ch = (...codes: number[]) => String.fromCharCode(...codes);

describe("sanitizeTrackName", () => {
  it("removes NUL, C0/C1, bidi and line separator characters", () => {
    const bad = ch(0, 0x1f, 0x7f, 0x85, 0x200e, 0x200f, 0x202a, 0x202e, 0x2066, 0x2069, 0x2028, 0x2029);
    expect(sanitizeTrackName(`Pi${bad}ano`)).toBe("Piano");
  });

  it("removes lone surrogates but keeps valid pairs", () => {
    const emoji = String.fromCodePoint(0x1f3b9);
    expect(sanitizeTrackName(`a${ch(0xd800)}b${ch(0xdc00)}${emoji}`)).toBe(`ab${emoji}`);
  });

  it("caps the name at 50 characters without leaving half a surrogate pair", () => {
    expect(sanitizeTrackName("a".repeat(80))).toHaveLength(50);
    const emoji = String.fromCodePoint(0x1f3b9);
    const out = sanitizeTrackName("a".repeat(49) + emoji);
    expect(out).toBe("a".repeat(49));
  });

  it("keeps Vietnamese names intact", () => {
    expect(sanitizeTrackName("Trống đệm – Ê a")).toBe("Trống đệm – Ê a");
  });

  it("returns an empty string for control-only names", () => {
    expect(sanitizeTrackName(ch(0, 0, 0))).toBe("");
  });
});
