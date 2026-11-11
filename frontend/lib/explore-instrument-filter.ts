import { GM_INSTRUMENT_NAMES, GM_INSTRUMENTS } from "@stave/shared-types";
import type { DictKey } from "./i18n";
import { en } from "./i18n/en";

export const MAX_INSTRUMENT_FILTERS = 5;

const KNOWN = new Set<string>(GM_INSTRUMENT_NAMES);

export function parseInstrumentParam(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const name = part.trim();
    if (KNOWN.has(name) && !out.includes(name)) out.push(name);
    if (out.length >= MAX_INSTRUMENT_FILTERS) break;
  }
  return out;
}

export function serializeInstrumentParam(names: readonly string[]): string | null {
  return names.length > 0 ? names.join(",") : null;
}

export function addInstrument(current: readonly string[], name: string): string[] {
  if (!KNOWN.has(name) || current.includes(name) || current.length >= MAX_INSTRUMENT_FILTERS) {
    return [...current];
  }
  return [...current, name];
}

export function removeInstrument(current: readonly string[], name: string): string[] {
  return current.filter((n) => n !== name);
}

export interface InstrumentGroup {
  category: string;
  names: string[];
}

export function groupInstrumentsByCategory(exclude: readonly string[] = []): InstrumentGroup[] {
  const groups = new Map<string, string[]>();
  for (const inst of GM_INSTRUMENTS) {
    if (exclude.includes(inst.name)) continue;
    const list = groups.get(inst.category) ?? [];
    list.push(inst.name);
    groups.set(inst.category, list);
  }
  return Array.from(groups, ([category, names]) => ({ category, names }));
}

export function instrumentCategoryKey(category: string): DictKey | null {
  const key = `exi.cat.${category.toLowerCase().replace(/\s+/g, "_")}`;
  return key in en ? (key as DictKey) : null;
}
