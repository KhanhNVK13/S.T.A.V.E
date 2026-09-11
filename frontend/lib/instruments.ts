/**
 * instruments.ts
 * General MIDI (GM) instrument definitions for UC-30: Assign instrument to track.
 * The list itself lives in `@stave/shared-types` (read by both this file and
 * `backend/src/drafts/dto/update-draft.dto.ts` for server-side validation) —
 * this file only re-exports it plus frontend-only lookup helpers.
 */
import { GM_INSTRUMENTS } from "@stave/shared-types";
import type { GMInstrument } from "@stave/shared-types";

export type { GMInstrument };
export { GM_INSTRUMENTS };

/** Get instrument by GM program number */
export function getInstrumentById(id: number): GMInstrument | undefined {
  return GM_INSTRUMENTS.find((inst) => inst.id === id);
}

/** Get instrument by name */
export function getInstrumentByName(name: string): GMInstrument | undefined {
  return GM_INSTRUMENTS.find((inst) => inst.name === name);
}

/** Get all instrument categories */
export function getInstrumentCategories(): string[] {
  const categories = new Set(GM_INSTRUMENTS.map((inst) => inst.category));
  return Array.from(categories);
}

/** Get instruments by category */
export function getInstrumentsByCategory(category: string): GMInstrument[] {
  return GM_INSTRUMENTS.filter((inst) => inst.category === category);
}
