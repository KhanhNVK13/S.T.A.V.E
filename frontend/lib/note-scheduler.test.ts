import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startNoteScheduler } from "./note-scheduler";

describe("startNoteScheduler", () => {
  let clock = 0;
  const now = () => clock;
  const advance = (ms: number) => {
    clock += ms / 1000;
    vi.advanceTimersByTime(ms);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 10;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("covers every tick from start to end exactly once, in contiguous chunks", () => {
    const chunks: Array<[number, number]> = [];
    startNoteScheduler({
      now,
      startTime: 10,
      fromTick: 480,
      endTick: 480 + 960 * 4,
      secPerTick: 0.001,
      schedule: (from, to) => chunks.push([from, to]),
    });
    for (let i = 0; i < 200; i++) advance(50);

    expect(chunks[0][0]).toBe(480);
    expect(chunks[chunks.length - 1][1]).toBe(480 + 960 * 4);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i][0]).toBe(chunks[i - 1][1]);
      expect(chunks[i][1]).toBeGreaterThan(chunks[i][0]);
    }
  });

  it("schedules only within the lookahead window, not the whole song at once", () => {
    const chunks: Array<[number, number]> = [];
    startNoteScheduler({
      now,
      startTime: 10,
      fromTick: 0,
      endTick: 100_000,
      secPerTick: 0.001,
      schedule: (from, to) => chunks.push([from, to]),
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0][0]).toBe(0);
    expect(chunks[0][1]).toBeGreaterThanOrEqual(150);
    expect(chunks[0][1]).toBeLessThanOrEqual(151);
  });

  it("stops scheduling as soon as it is cancelled", () => {
    const schedule = vi.fn();
    const stop = startNoteScheduler({
      now,
      startTime: 10,
      fromTick: 0,
      endTick: 100_000,
      secPerTick: 0.001,
      schedule,
    });
    advance(100);
    const calls = schedule.mock.calls.length;
    stop();
    advance(1000);

    expect(schedule.mock.calls.length).toBe(calls);
  });

  it("calls onEnd once after the last tick plus the tail", () => {
    const run = vi.fn();
    startNoteScheduler({
      now,
      startTime: 10,
      fromTick: 0,
      endTick: 1000,
      secPerTick: 0.001,
      schedule: () => {},
      onEnd: { afterSec: 0.5, run },
    });
    advance(1400);
    expect(run).not.toHaveBeenCalled();
    advance(200);
    expect(run).toHaveBeenCalledTimes(1);
    advance(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
