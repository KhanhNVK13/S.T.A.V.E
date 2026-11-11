import type { CommentItem } from "@stave/shared-types";
import { barToTick } from "./piano-roll-geometry";

export const MAX_VISIBLE_PINS = 300;

export interface BarPin {
  bar: number;
  tick: number;
  count: number;
  dimmed: boolean;
}

export interface NotePin {
  noteId: string;
  bar: number | null;
  count: number;
  dimmed: boolean;
}

export interface CommentPins {
  bars: BarPin[];
  notes: Map<string, NotePin>;
}

export const EMPTY_PINS: CommentPins = { bars: [], notes: new Map() };

export function buildCommentPins(
  items: readonly CommentItem[],
  ppq: number,
  timeSignature: [number, number],
): CommentPins {
  const byBar = new Map<number, { count: number; live: number }>();
  const notes = new Map<string, NotePin>();

  for (const c of items) {
    if (c.bar !== null) {
      const entry = byBar.get(c.bar) ?? { count: 0, live: 0 };
      entry.count += 1;
      if (!c.noteMissing) entry.live += 1;
      byBar.set(c.bar, entry);
    }
    if (c.noteId && !c.noteMissing) {
      const entry = notes.get(c.noteId) ?? {
        noteId: c.noteId,
        bar: c.bar,
        count: 0,
        dimmed: false,
      };
      entry.count += 1;
      notes.set(c.noteId, entry);
    }
  }

  const bars = [...byBar.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bar, e]) => ({
      bar,
      tick: barToTick(bar, ppq, timeSignature),
      count: e.count,
      dimmed: e.live === 0,
    }));

  return { bars, notes };
}

export function visibleBarPins(
  pins: readonly BarPin[],
  firstTick: number,
  lastTick: number,
  limit = MAX_VISIBLE_PINS,
): BarPin[] {
  const out: BarPin[] = [];
  for (const pin of pins) {
    if (pin.tick > lastTick) break;
    if (pin.tick < firstTick - 1) continue;
    out.push(pin);
    if (out.length >= limit) break;
  }
  return out;
}

export function pinLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export const PIN_HEIGHT = 16;

export function pinWidth(count: number): number {
  return pinLabel(count).length > 1 ? 24 : 18;
}

export function hitBarPin(
  pins: readonly BarPin[],
  x: number,
  y: number,
  pxPerTick: number,
  scrollX: number,
  keyWidth: number,
  headerHeight: number,
): BarPin | null {
  if (y < 0 || y > headerHeight) return null;
  for (let i = pins.length - 1; i >= 0; i--) {
    const pin = pins[i];
    const left = keyWidth + pin.tick * pxPerTick - scrollX + 2;
    const w = pinWidth(pin.count);
    if (x >= left && x <= left + w && y <= PIN_HEIGHT + 2) return pin;
  }
  return null;
}
