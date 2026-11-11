import { describe, expect, it } from "vitest";
import { GM_INSTRUMENTS } from "@stave/shared-types";
import {
  MAX_INSTRUMENT_FILTERS,
  addInstrument,
  groupInstrumentsByCategory,
  instrumentCategoryKey,
  parseInstrumentParam,
  removeInstrument,
  serializeInstrumentParam,
} from "./explore-instrument-filter";

const NAMES = GM_INSTRUMENTS.map((i) => i.name);

describe("explore instrument filter", () => {
  it("parses a comma-separated list, trimming and dropping duplicates", () => {
    expect(parseInstrumentParam(` ${NAMES[0]} , ${NAMES[1]},${NAMES[0]}`)).toEqual([NAMES[0], NAMES[1]]);
  });

  it("drops unknown names and empty input", () => {
    expect(parseInstrumentParam("Kazoo Deluxe,")).toEqual([]);
    expect(parseInstrumentParam("")).toEqual([]);
    expect(parseInstrumentParam(null)).toEqual([]);
  });

  it("caps the list at the maximum", () => {
    expect(parseInstrumentParam(NAMES.slice(0, 9).join(","))).toHaveLength(MAX_INSTRUMENT_FILTERS);
  });

  it("serializes to null when empty so the URL param is removed", () => {
    expect(serializeInstrumentParam([])).toBeNull();
    expect(serializeInstrumentParam([NAMES[0], NAMES[1]])).toBe(`${NAMES[0]},${NAMES[1]}`);
  });

  it("adds only known, new names and respects the maximum", () => {
    expect(addInstrument([], NAMES[0])).toEqual([NAMES[0]]);
    expect(addInstrument([NAMES[0]], NAMES[0])).toEqual([NAMES[0]]);
    expect(addInstrument([], "Nope")).toEqual([]);
    const full = NAMES.slice(0, MAX_INSTRUMENT_FILTERS);
    expect(addInstrument(full, NAMES[10])).toEqual(full);
  });

  it("removes a name", () => {
    expect(removeInstrument([NAMES[0], NAMES[1]], NAMES[0])).toEqual([NAMES[1]]);
  });

  it("groups by category and hides the already selected names", () => {
    const all = groupInstrumentsByCategory();
    expect(all.reduce((n, g) => n + g.names.length, 0)).toBe(NAMES.length);
    const without = groupInstrumentsByCategory([NAMES[0]]);
    expect(without.flatMap((g) => g.names)).not.toContain(NAMES[0]);
  });

  it("has a translation key for every instrument category", () => {
    for (const group of groupInstrumentsByCategory()) {
      expect(instrumentCategoryKey(group.category), group.category).not.toBeNull();
    }
    expect(instrumentCategoryKey("Nope")).toBeNull();
  });
});
