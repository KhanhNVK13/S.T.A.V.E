export const REMINDER_LEAD_DAYS = 3;
export const GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RenewalPricePlan {
  price_vnd: number;
  price_effective_at: string | null;
}

export interface CurrentPricePlan extends RenewalPricePlan {
  previous_price_vnd?: number | null;
}

export interface RenewalPriceSubscription {
  price_locked_vnd: number;
}

export interface ReminderSubscription {
  current_period_end: string;
  grace_until: string | null;
}

/**
 * Giá gia hạn: giá mới của gói khi giá mới đã có hiệu lực, nếu không thì giá
 * đang khoá của người dùng (đơn giá họ đã trả).
 */
export function computeRenewalPrice(
  plan: RenewalPricePlan,
  subscription: RenewalPriceSubscription,
  now: Date,
): number {
  const effectiveAt = plan.price_effective_at
    ? new Date(plan.price_effective_at)
    : null;
  if (!effectiveAt || effectiveAt.getTime() <= now.getTime()) {
    return plan.price_vnd;
  }
  return subscription.price_locked_vnd;
}

export function currentPlanPrice(plan: CurrentPricePlan, now: Date): number {
  const effectiveAt = plan.price_effective_at
    ? new Date(plan.price_effective_at)
    : null;
  if (
    effectiveAt &&
    effectiveAt.getTime() > now.getTime() &&
    plan.previous_price_vnd !== null &&
    plan.previous_price_vnd !== undefined
  ) {
    return plan.previous_price_vnd;
  }
  return plan.price_vnd;
}

export interface CurrentFeaturesPlan {
  features: Record<string, unknown> | null;
  previous_features?: Record<string, unknown> | null;
  features_effective_at?: string | null;
}

export function currentPlanFeatures(
  plan: CurrentFeaturesPlan,
  now: Date,
): Record<string, unknown> {
  const effectiveAt = plan.features_effective_at
    ? new Date(plan.features_effective_at)
    : null;
  if (
    effectiveAt &&
    effectiveAt.getTime() > now.getTime() &&
    plan.previous_features
  ) {
    return plan.previous_features;
  }
  return plan.features ?? {};
}

/** Cộng 1 tháng theo lịch, kẹp ngày (31/01 + 1 tháng = 28 hoặc 29/02). */
export function addOneMonth(from: Date): Date {
  const targetMonthStart = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1),
  );
  const daysInTargetMonth = new Date(
    Date.UTC(
      targetMonthStart.getUTCFullYear(),
      targetMonthStart.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();
  const day = Math.min(from.getUTCDate(), daysInTargetMonth);
  return new Date(
    Date.UTC(
      targetMonthStart.getUTCFullYear(),
      targetMonthStart.getUTCMonth(),
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

/** Kỳ mới sau khi gia hạn: max(now, kỳ đang chạy) + 1 tháng. */
export function computeNewPeriodEnd(currentPeriodEnd: string, now: Date): Date {
  const periodEnd = new Date(currentPeriodEnd);
  const start = periodEnd.getTime() > now.getTime() ? periodEnd : now;
  return addOneMonth(start);
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/**
 * Mốc nhắc gia hạn gần nhất đã tới: T-3 ngày, ngày hết hạn, rồi mỗi ngày
 * trong ân hạn. `null` = chưa tới mốc nào, hoặc đã hết ân hạn.
 */
export function currentReminderMilestone(
  subscription: ReminderSubscription,
  now: Date,
): Date | null {
  const periodEnd = new Date(subscription.current_period_end);
  if (Number.isNaN(periodEnd.getTime())) return null;
  const lead = addDays(periodEnd, -REMINDER_LEAD_DAYS);

  if (now.getTime() < lead.getTime()) return null;
  if (now.getTime() < periodEnd.getTime()) return lead;

  const graceUntil = subscription.grace_until
    ? new Date(subscription.grace_until)
    : null;
  if (!graceUntil || now.getTime() > graceUntil.getTime()) return null;

  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return dayStart.getTime() > periodEnd.getTime() ? dayStart : periodEnd;
}
