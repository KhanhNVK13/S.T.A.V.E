import type {
  EffectiveSubscriptionStatus,
  PlanListItem,
  SubscriptionPlan,
} from '@stave/shared-types';
import { currentPlanPrice } from './renewal';

export interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  price_vnd: number;
  features: Record<string, unknown> | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  price_effective_at: string | null;
  previous_price_vnd?: number | null;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'canceled';
  price_locked_vnd: number;
  started_at: string;
  current_period_end: string;
  pending_plan_id: string | null;
  grace_until: string | null;
  renewal_notified_at: string | null;
}

export const PLAN_COLUMNS =
  'id, name, description, price_vnd, features, is_active, is_default, sort_order, price_effective_at, previous_price_vnd';

export const SUBSCRIPTION_COLUMNS =
  'id, user_id, plan_id, status, price_locked_vnd, started_at, current_period_end, pending_plan_id, grace_until, renewal_notified_at';

export interface ResolvedPlan {
  plan: PlanRow;
  status: EffectiveSubscriptionStatus;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: PlanRow | null;
  hasPaidAccess: boolean;
  inGrace: boolean;
}

function isAfter(value: string | null, now: Date): boolean {
  return value !== null && new Date(value).getTime() > now.getTime();
}

export function resolveEffectivePlan(
  sub: SubscriptionRow | null,
  plansById: ReadonlyMap<string, PlanRow>,
  defaultPlan: PlanRow,
  now: Date,
): ResolvedPlan {
  const inPeriod = sub !== null && isAfter(sub.current_period_end, now);
  const inGrace = sub !== null && !inPeriod && isAfter(sub.grace_until, now);
  const subPlan = sub ? plansById.get(sub.plan_id) : undefined;

  if (!sub || !subPlan || (!inPeriod && !inGrace)) {
    return {
      plan: defaultPlan,
      status: 'none',
      currentPeriodEnd: null,
      graceUntil: null,
      cancelAtPeriodEnd: false,
      pendingPlan: null,
      hasPaidAccess: !defaultPlan.is_default,
      inGrace: false,
    };
  }

  return {
    plan: subPlan,
    status: sub.status,
    currentPeriodEnd: sub.current_period_end,
    graceUntil: inGrace ? sub.grace_until : null,
    cancelAtPeriodEnd: sub.status === 'canceled',
    pendingPlan: sub.pending_plan_id
      ? (plansById.get(sub.pending_plan_id) ?? null)
      : null,
    hasPaidAccess: !subPlan.is_default,
    inGrace,
  };
}

export function toSubscriptionPlan(
  row: PlanRow,
  now: Date = new Date(),
): SubscriptionPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    priceVnd: currentPlanPrice(row, now),
    features: row.features ?? {},
    isActive: row.is_active,
    isDefault: row.is_default,
    sortOrder: row.sort_order,
    priceEffectiveAt: row.price_effective_at,
  };
}

export function listVisiblePlans(
  plans: readonly PlanRow[],
  currentPlanId: string,
  now: Date = new Date(),
): PlanListItem[] {
  return plans
    .filter((plan) => plan.is_active || plan.id === currentPlanId)
    .map((plan) => ({ plan, price: currentPlanPrice(plan, now) }))
    .sort(
      (a, b) =>
        a.plan.sort_order - b.plan.sort_order ||
        a.price - b.price ||
        a.plan.name.localeCompare(b.plan.name),
    )
    .map(({ plan }) => ({
      ...toSubscriptionPlan(plan, now),
      isCurrent: plan.id === currentPlanId,
    }));
}
