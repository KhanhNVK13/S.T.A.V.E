/**
 * piano-roll-geometry.ts — bar ↔ tick ↔ X pixel (UC-63 comments, reused by
 * UC-72 highlight-by-Vũ).
 *
 * Một ô nhịp (bar) chứa `ppq * timeSignature[0]` tick: `timeSignature[0]`
 * phách, mỗi phách = `ppq` tick. Bar 1 bắt đầu ở tick 0, bar N ở tick
 * `(N - 1) * ticksPerBar`.
 *
 * Hệ số toạ độ X lấy CHUNG một công thức với piano roll (xem
 * `PIANO_ROLL_KEY_WIDTH` + `pxPerTickFor` trong `piano-roll.tsx`): một tick
 * = 0,06px khi zoom = 1, nhân `zoom` khi phóng to; chừa đúng 72px cho cột
 * phím, trừ đi vị trí cuộn ngang `scrollX`.
 *
 * Vũ sẽ import module này cho UC-72 — giữ nguyên ký hiệu hàm, không tự viết
 * lại hệ số ở phía khác.
 */

/** Cột phím piano roll (px) — khớp `PIANO_ROLL_KEY_WIDTH` trong piano-roll.tsx. */
export const PIANO_ROLL_KEY_WIDTH = 72;

/** Hệ số px trên mỗi tick khi zoom = 1 — khớp `pxPerTickFor(1)` trong piano-roll.tsx. */
const PX_PER_TICK_AT_ZOOM_1 = 0.06;

export function pxPerTickFor(zoom: number): number {
  return PX_PER_TICK_AT_ZOOM_1 * zoom;
}

/** Số tick của một ô nhịp trong thời ký `timeSignature`. */
export function ticksPerBar(ppq: number, timeSignature: [number, number]): number {
  return ppq * timeSignature[0];
}

/** Bar (1-indexed) → tick bắt đầu của ô nhịp đó. */
export function barToTick(bar: number, ppq: number, timeSignature: [number, number]): number {
  return (bar - 1) * ticksPerBar(ppq, timeSignature);
}

/** Tick → số ô nhịp (1-indexed) chứa tick đó. */
export function tickToBar(tick: number, ppq: number, timeSignature: [number, number]): number {
  return Math.floor(Math.max(0, tick) / ticksPerBar(ppq, timeSignature)) + 1;
}

/**
 * Tick → toạ độ X pixel trên piano roll. `scrollX` là vị trí cuộn ngang
 * hiện tại (xem prop `onScrollXChange` của PianoRoll).
 */
export function tickToX(tick: number, zoom: number, scrollX: number): number {
  return PIANO_ROLL_KEY_WIDTH + tick * pxPerTickFor(zoom) - scrollX;
}

/** Toạ độ X pixel → tick (nghịch của `tickToX`; chặn số âm). */
export function xToTick(x: number, zoom: number, scrollX: number): number {
  return Math.max(0, (x - PIANO_ROLL_KEY_WIDTH + scrollX) / pxPerTickFor(zoom));
}

/** Bar (1-indexed) → toạ độ X pixel của vạch bắt đầu ô nhịp. */
export function barToX(bar: number, ppq: number, timeSignature: [number, number], zoom: number, scrollX: number): number {
  return tickToX(barToTick(bar, ppq, timeSignature), zoom, scrollX);
}

/** Toạ độ X pixel → số ô nhịp (1-indexed) tại vị trí đó. */
export function xToBar(x: number, ppq: number, timeSignature: [number, number], zoom: number, scrollX: number): number {
  return tickToBar(xToTick(x, zoom, scrollX), ppq, timeSignature);
}
