import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentOrder, PaymentOrderStatus } from "@stave/shared-types";
import { startPaymentPoll, type PaymentPollState } from "./payment-result-poller";

const order = (status: PaymentOrderStatus): PaymentOrder => ({
  orderCode: 1,
  planName: "STAVE+",
  amountVnd: 49000,
  status,
  createdAt: "2026-11-06T10:00:00.000Z",
});

class NotFound extends Error {}

function setup(getOrder: () => Promise<PaymentOrder>, syncOrder = vi.fn(() => Promise.resolve(order("pending")))) {
  const states: PaymentPollState[] = [];
  const get = vi.fn(getOrder);
  const stop = startPaymentPoll({
    getOrder: get,
    syncOrder,
    onChange: (state) => states.push(state),
    isNotFound: (err) => err instanceof NotFound,
  });
  return { states, get, sync: syncOrder, stop, last: () => states[states.length - 1] };
}

describe("FE-BIL-07 startPaymentPoll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T10:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("UTCID01 stops at the first settled answer without syncing", async () => {
    const { get, sync, last } = setup(() => Promise.resolve(order("success")));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(last().phase).toBe("success");
    expect(get).toHaveBeenCalledTimes(1);
    expect(sync).not.toHaveBeenCalled();
  });

  it("UTCID02 polls every 2 seconds and syncs exactly once at 6 seconds", async () => {
    const { get, sync } = setup(() => Promise.resolve(order("pending")));
    await vi.advanceTimersByTimeAsync(4_000);
    expect(get).toHaveBeenCalledTimes(3);
    expect(sync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("UTCID03 gives up after 30 seconds and reports waiting", async () => {
    const { get, sync, last } = setup(() => Promise.resolve(order("pending")));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(last().phase).toBe("waiting");
    expect(get).toHaveBeenCalledTimes(16);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(get).toHaveBeenCalledTimes(16);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("UTCID04 treats failed and expired orders as not successful", async () => {
    for (const status of ["failed", "expired"] as const) {
      const { last } = setup(() => Promise.resolve(order(status)));
      await vi.advanceTimersByTimeAsync(0);
      expect(last().phase).toBe("failed");
    }
  });

  it("UTCID05 uses the answer of the sync call", async () => {
    const sync = vi.fn(() => Promise.resolve(order("success")));
    const { get, last } = setup(() => Promise.resolve(order("pending")), sync);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(last().phase).toBe("success");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(get).toHaveBeenCalledTimes(4);
  });

  it("UTCID06 keeps polling when the sync call fails", async () => {
    const sync = vi.fn(() => Promise.reject(new Error("502")));
    let calls = 0;
    const { last } = setup(() => Promise.resolve(order(++calls >= 6 ? "success" : "pending")), sync);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(last().phase).toBe("success");
  });

  it("UTCID07 stops immediately for an order that is not the caller's", async () => {
    const { get, last } = setup(() => Promise.reject(new NotFound()));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(last().phase).toBe("notFound");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("UTCID08 reports an error when the order never loaded", async () => {
    const { last } = setup(() => Promise.reject(new TypeError("network")));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(last()).toEqual({ phase: "error", order: null });
  });

  it("UTCID09 makes no more calls after it is stopped", async () => {
    const { get, stop, states } = setup(() => Promise.resolve(order("pending")));
    await vi.advanceTimersByTimeAsync(2_000);
    stop();
    const seen = states.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(get).toHaveBeenCalledTimes(2);
    expect(states).toHaveLength(seen);
  });
});
