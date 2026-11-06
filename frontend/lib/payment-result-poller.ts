import type { PaymentOrder } from "@stave/shared-types";

export type PaymentPollPhase = "checking" | "success" | "failed" | "waiting" | "notFound" | "error";

export interface PaymentPollState {
  phase: PaymentPollPhase;
  order: PaymentOrder | null;
}

export interface PaymentPollOptions {
  getOrder: () => Promise<PaymentOrder>;
  syncOrder: () => Promise<PaymentOrder>;
  onChange: (state: PaymentPollState) => void;
  isNotFound: (err: unknown) => boolean;
  intervalMs?: number;
  timeoutMs?: number;
  syncAfterMs?: number;
}

export const POLL_INTERVAL_MS = 2000;
export const POLL_TIMEOUT_MS = 30_000;
export const SYNC_AFTER_MS = 6000;

function settledPhase(order: PaymentOrder): "success" | "failed" | null {
  if (order.status === "success") return "success";
  if (order.status === "failed" || order.status === "expired") return "failed";
  return null;
}

export function startPaymentPoll({
  getOrder,
  syncOrder,
  onChange,
  isNotFound,
  intervalMs = POLL_INTERVAL_MS,
  timeoutMs = POLL_TIMEOUT_MS,
  syncAfterMs = SYNC_AFTER_MS,
}: PaymentPollOptions): () => void {
  const startedAt = Date.now();
  let stopped = false;
  let synced = false;
  let lastOrder: PaymentOrder | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const finish = (state: PaymentPollState) => {
    if (stopped) return;
    stopped = true;
    onChange(state);
  };

  async function tick() {
    try {
      let order = await getOrder();
      if (stopped) return;
      if (!settledPhase(order) && !synced && Date.now() - startedAt >= syncAfterMs) {
        synced = true;
        const before = order;
        order = await syncOrder().catch(() => before);
        if (stopped) return;
      }
      lastOrder = order;
      const phase = settledPhase(order);
      if (phase) return finish({ phase, order });
      onChange({ phase: "checking", order });
    } catch (err) {
      if (stopped) return;
      if (isNotFound(err)) return finish({ phase: "notFound", order: null });
    }
    if (Date.now() - startedAt >= timeoutMs) {
      return finish({ phase: lastOrder ? "waiting" : "error", order: lastOrder });
    }
    timer = setTimeout(() => void tick(), intervalMs);
  }

  void tick();
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
