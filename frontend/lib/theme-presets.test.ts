import { describe, expect, it } from "vitest";
import {
  PALETTE_KEYS,
  THEME_PRESET_KEYS,
  THEME_PRESET_PALETTES,
  getPresetPalette,
  isValidPalette,
  type EffectiveTheme,
} from "@stave/shared-types";
import { contrastRatio, oklchToSrgb, type Rgb } from "./theme-from-image";
import { resolveAppliedPalette } from "../context/theme-context";

function rgbOf(value: string): Rgb {
  const m = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (!m) throw new Error(`bad oklch ${value}`);
  return oklchToSrgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

const PRESETS = Object.entries(THEME_PRESET_PALETTES);

describe("theme presets", () => {
  it("TP-01: every preset palette passes the strict validator and has exactly the 10 palette keys", () => {
    for (const [, palette] of PRESETS) {
      expect(isValidPalette(palette)).toBe(true);
      expect(Object.keys(palette).sort()).toEqual([...PALETTE_KEYS].sort());
    }
  });

  it("TP-02: preset keys are space plus one palette per other key", () => {
    expect(THEME_PRESET_KEYS).toEqual(["space", "unleashed", "moss", "claret", "tide"]);
    expect(Object.keys(THEME_PRESET_PALETTES).sort()).toEqual(["claret", "moss", "tide", "unleashed"]);
  });

  it.each(PRESETS)("TP-03: %s text/background pairs reach 4.5:1", (_name, palette) => {
    const texts = ["--foreground", "--muted-foreground"] as const;
    const backgrounds = ["--background", "--surface", "--surface-subtle", "--surface-muted"] as const;
    for (const text of texts) {
      for (const bg of backgrounds) {
        expect(contrastRatio(rgbOf(palette[text]), rgbOf(palette[bg]))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(PRESETS)("TP-04: %s keeps the background dark and borders visible", (_name, palette) => {
    const bg = /^oklch\(([\d.]+)/.exec(palette["--background"]);
    expect(Number(bg?.[1])).toBeLessThan(0.2);
    expect(contrastRatio(rgbOf(palette["--border-strong"]), rgbOf(palette["--surface"]))).toBeGreaterThanOrEqual(3);
  });

  it("TP-05: getPresetPalette returns null for the default, unknown keys and prototype names", () => {
    expect(getPresetPalette("space")).toBeNull();
    expect(getPresetPalette("nope")).toBeNull();
    expect(getPresetPalette("constructor")).toBeNull();
    expect(getPresetPalette(null)).toBeNull();
    expect(getPresetPalette("moss")).toBe(THEME_PRESET_PALETTES.moss);
  });
});

describe("resolveAppliedPalette", () => {
  const base: EffectiveTheme = { type: null, presetKey: null, palette: null, hasPaidAccess: false };

  it("TP-06: applies a preset for a free user", () => {
    expect(resolveAppliedPalette({ ...base, type: "preset", presetKey: "tide" })).toBe(THEME_PRESET_PALETTES.tide);
  });

  it("TP-07: the default preset and no theme clear the palette", () => {
    expect(resolveAppliedPalette({ ...base, type: "preset", presetKey: "space" })).toBeNull();
    expect(resolveAppliedPalette(base)).toBeNull();
    expect(resolveAppliedPalette(null)).toBeNull();
  });

  it("TP-08: a custom theme needs paid access and a valid palette", () => {
    const palette = { ...THEME_PRESET_PALETTES.moss };
    expect(resolveAppliedPalette({ ...base, type: "custom", palette, hasPaidAccess: true })).toEqual(palette);
    expect(resolveAppliedPalette({ ...base, type: "custom", palette, hasPaidAccess: false })).toBeNull();
    expect(
      resolveAppliedPalette({ ...base, type: "custom", palette: { "--background": "red" }, hasPaidAccess: true }),
    ).toBeNull();
  });
});
