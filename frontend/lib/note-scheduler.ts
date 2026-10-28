const LOOKAHEAD_SEC = 0.15;
const SCHEDULE_INTERVAL_MS = 50;

export interface NoteSchedulerOptions {
  /** Đồng hồ âm thanh hiện tại (giây), vd `Tone.now`. */
  now: () => number;
  /** Thời điểm (giây, cùng đồng hồ) phát `fromTick`. */
  startTime: number;
  fromTick: number;
  endTick: number;
  secPerTick: number;
  /** Lên lịch mọi nốt bắt đầu trong [fromTick, toTick). */
  schedule: (fromTick: number, toTick: number) => void;
  /** Gọi một lần khi đã phát hết `endTick` thêm `afterSec` giây. */
  onEnd?: { afterSec: number; run: () => void };
}

/**
 * Lên lịch nốt theo từng đợt nhìn trước `LOOKAHEAD_SEC` của đồng hồ âm thanh,
 * mỗi `SCHEDULE_INTERVAL_MS`. Không lên lịch cả bài một lần vì nốt đã giao cho
 * Tone thì không huỷ được; dừng thì chỉ cần gọi hàm trả về. Dùng chung cho
 * MIDI Editor và trình phát ở màn so sánh phiên bản.
 */
export function startNoteScheduler(options: NoteSchedulerOptions): () => void {
  const { now, startTime, fromTick, endTick, secPerTick, schedule, onEnd } = options;
  let scheduledUpTo = fromTick;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const current = now();
    const target = Math.min(
      endTick,
      fromTick + Math.ceil((current + LOOKAHEAD_SEC - startTime) / secPerTick),
    );
    if (target > scheduledUpTo) {
      schedule(scheduledUpTo, target);
      scheduledUpTo = target;
    }
    if (onEnd && current >= startTime + (endTick - fromTick) * secPerTick + onEnd.afterSec) {
      stopped = true;
      onEnd.run();
      return;
    }
    if (scheduledUpTo < endTick || onEnd) {
      timer = setTimeout(tick, SCHEDULE_INTERVAL_MS);
    }
  };

  tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
