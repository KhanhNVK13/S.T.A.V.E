import {
  listVisiblePlans,
  resolveEffectivePlan,
  toSubscriptionPlan,
  type PlanRow,
  type SubscriptionRow,
} from './effective-plan';

const NOW = new Date('2026-11-06T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const at = (offsetDays: number) =>
  new Date(NOW.getTime() + offsetDays * DAY).toISOString();

const free: PlanRow = {
  id: 'free',
  name: 'Free',
  description: 'Miễn phí',
  price_vnd: 0,
  features: {},
  is_active: true,
  is_default: true,
  sort_order: 0,
  price_effective_at: null,
};
const plus: PlanRow = {
  ...free,
  id: 'plus',
  name: 'STAVE+',
  price_vnd: 49000,
  features: { theme_from_image: true },
  is_default: false,
  sort_order: 1,
};
const retired: PlanRow = {
  ...plus,
  id: 'retired',
  name: 'Old',
  is_active: false,
};
const plans = new Map([free, plus, retired].map((p) => [p.id, p]));

function sub(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 'sub-1',
    user_id: 'user-1',
    plan_id: 'plus',
    status: 'active',
    price_locked_vnd: 49000,
    started_at: at(-10),
    current_period_end: at(20),
    pending_plan_id: null,
    grace_until: null,
    renewal_notified_at: null,
    ...overrides,
  };
}

const resolve = (row: SubscriptionRow | null) =>
  resolveEffectivePlan(row, plans, free, NOW);

describe('BE-BIL-01 resolveEffectivePlan', () => {
  it('UTCID01 uses the default plan when the user has no subscription row', () => {
    expect(resolve(null)).toEqual({
      plan: free,
      status: 'none',
      currentPeriodEnd: null,
      graceUntil: null,
      cancelAtPeriodEnd: false,
      pendingPlan: null,
      hasPaidAccess: false,
      inGrace: false,
    });
  });

  it('UTCID02 uses the subscribed plan while the period is running', () => {
    const result = resolve(sub());
    expect(result.plan).toBe(plus);
    expect(result.status).toBe('active');
    expect(result.currentPeriodEnd).toBe(at(20));
    expect(result.hasPaidAccess).toBe(true);
    expect(result.cancelAtPeriodEnd).toBe(false);
    expect(result.inGrace).toBe(false);
  });

  it('UTCID03 falls back to the default plan once the period has ended', () => {
    const result = resolve(sub({ current_period_end: at(-1) }));
    expect(result.plan).toBe(free);
    expect(result.status).toBe('none');
    expect(result.hasPaidAccess).toBe(false);
  });

  it('UTCID04 keeps a canceled subscription until the end of the paid period', () => {
    const result = resolve(sub({ status: 'canceled' }));
    expect(result.plan).toBe(plus);
    expect(result.status).toBe('canceled');
    expect(result.cancelAtPeriodEnd).toBe(true);
    expect(result.hasPaidAccess).toBe(true);
  });

  it('UTCID05 drops a canceled subscription after its period ends', () => {
    const result = resolve(
      sub({ status: 'canceled', current_period_end: at(-1) }),
    );
    expect(result.plan).toBe(free);
    expect(result.cancelAtPeriodEnd).toBe(false);
  });

  it('UTCID06 keeps paid access during the grace period', () => {
    const result = resolve(
      sub({ current_period_end: at(-1), grace_until: at(2) }),
    );
    expect(result.plan).toBe(plus);
    expect(result.inGrace).toBe(true);
    expect(result.hasPaidAccess).toBe(true);
  });

  it('UTCID07 drops paid access after the grace period ends', () => {
    const result = resolve(
      sub({ current_period_end: at(-5), grace_until: at(-2) }),
    );
    expect(result.plan).toBe(free);
    expect(result.inGrace).toBe(false);
  });

  it('UTCID08 keeps a plan that was deactivated while the period is running', () => {
    const result = resolve(sub({ plan_id: 'retired' }));
    expect(result.plan).toBe(retired);
    expect(result.hasPaidAccess).toBe(true);
  });

  it('UTCID09 treats the exact end instant as expired', () => {
    expect(resolve(sub({ current_period_end: NOW.toISOString() })).plan).toBe(
      free,
    );
  });

  it('UTCID10 returns the scheduled downgrade plan', () => {
    expect(resolve(sub({ pending_plan_id: 'free' })).pendingPlan).toBe(free);
  });

  it('UTCID11 falls back to the default plan when the subscribed plan is unknown', () => {
    expect(resolve(sub({ plan_id: 'missing' })).plan).toBe(free);
  });
});

describe('BE-BIL-02 toSubscriptionPlan', () => {
  it('UTCID01 maps a plan row to camelCase', () => {
    expect(
      toSubscriptionPlan({ ...plus, description: null, features: null }),
    ).toEqual({
      id: 'plus',
      name: 'STAVE+',
      description: '',
      priceVnd: 49000,
      features: {},
      isActive: true,
      isDefault: false,
      sortOrder: 1,
      priceEffectiveAt: null,
    });
  });
});

describe('BE-BIL-16 listVisiblePlans', () => {
  const premium: PlanRow = {
    ...plus,
    id: 'premium',
    name: 'Premium',
    price_vnd: 99000,
    sort_order: 2,
  };
  const all = [premium, retired, plus, free];

  it('UTCID01 lists active plans by sort order and marks the current plan', () => {
    const result = listVisiblePlans(all, 'free');
    expect(result.map((p) => p.id)).toEqual(['free', 'plus', 'premium']);
    expect(result.map((p) => p.isCurrent)).toEqual([true, false, false]);
  });

  it('UTCID02 keeps a deactivated plan only for the user still on it', () => {
    const result = listVisiblePlans(all, 'retired');
    expect(result.map((p) => p.id)).toEqual([
      'free',
      'retired',
      'plus',
      'premium',
    ]);
    expect(result.find((p) => p.id === 'retired')).toMatchObject({
      isActive: false,
      isCurrent: true,
    });
  });

  it('UTCID03 never shows a deactivated plan to other users', () => {
    expect(listVisiblePlans(all, 'plus').map((p) => p.id)).not.toContain(
      'retired',
    );
  });

  it('UTCID04 breaks sort order ties by price', () => {
    const tie = { ...premium, sort_order: 1, price_vnd: 10000, id: 'cheap' };
    expect(
      listVisiblePlans([plus, tie, free], 'free').map((p) => p.id),
    ).toEqual(['free', 'cheap', 'plus']);
  });
});
