import { describe, expect, it } from "vitest";
import { TRACK_COLOR_PALETTE, SYSTEM_MEANING_COLORS, nextTrackColor } from "./track-colors";

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
function dist(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("FE-EDT-18 track colour palette (decorative only)", () => {
  it("keeps 12 distinct colours", () => {
    expect(TRACK_COLOR_PALETTE).toHaveLength(12);
    expect(new Set(TRACK_COLOR_PALETTE).size).toBe(12);
  });

  it("never offers a colour that carries system meaning (blue, red, yellow) or one close to it", () => {
    for (const color of TRACK_COLOR_PALETTE) {
      expect(SYSTEM_MEANING_COLORS).not.toContain(color);
      for (const system of SYSTEM_MEANING_COLORS) expect(dist(color, system)).toBeGreaterThan(45);
    }
  });

  it("every colour stays readable on a dark background (contrast at least 3:1 against #0b0d12)", () => {
    const bg = luminance("#0b0d12");
    for (const color of TRACK_COLOR_PALETTE) {
      expect((luminance(color) + 0.05) / (bg + 0.05)).toBeGreaterThanOrEqual(3);
    }
  });

  it("nextTrackColor picks the first unused palette colour and wraps when all are used", () => {
    expect(nextTrackColor([TRACK_COLOR_PALETTE[0]])).toBe(TRACK_COLOR_PALETTE[1]);
    expect(nextTrackColor([...TRACK_COLOR_PALETTE])).toBe(TRACK_COLOR_PALETTE[0]);
  });
});
