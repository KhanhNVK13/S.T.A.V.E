import { InternalServerErrorException } from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import type { PlanRow, SubscriptionRow } from './effective-plan';
import { SubscriptionsService } from './subscriptions.service';

const userId = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-11-06T12:00:00.000Z');

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
  is_default: false,
  sort_order: 1,
};
const subscription: SubscriptionRow = {
  id: 'sub-1',
  user_id: userId,
  plan_id: 'plus',
  status: 'canceled',
  price_locked_vnd: 49000,
  started_at: '2026-10-20T00:00:00.000Z',
  current_period_end: '2026-11-20T00:00:00.000Z',
  pending_plan_id: null,
  grace_until: null,
  renewal_notified_at: null,
};

function makeService(
  sub: { data: unknown; error: unknown },
  plans: { data: unknown; error: unknown },
) {
  const mock = createSupabaseMock([], {
    tables: { subscriptions: [sub], subscription_plans: [plans] },
  });
  return { service: new SubscriptionsService(mock.client), mock };
}

describe('BE-BIL-09 SubscriptionsService.getEffective', () => {
  it('UTCID01 returns the paid plan of a canceled subscription that is still running', async () => {
    const { service, mock } = makeService(
      { data: subscription, error: null },
      { data: [free, plus], error: null },
    );

    const result = await service.getEffective(userId, NOW);

    expect(mock.builders.subscriptions.eq).toHaveBeenCalledWith(
      'user_id',
      userId,
    );
    expect(result).toEqual({
      plan: expect.objectContaining({
        id: 'plus',
        priceVnd: 49000,
        isDefault: false,
      }),
      status: 'canceled',
      currentPeriodEnd: '2026-11-20T00:00:00.000Z',
      cancelAtPeriodEnd: true,
      pendingPlan: null,
      hasPaidAccess: true,
      inGrace: false,
    });
  });

  it('UTCID02 returns the default plan for a user without a subscription', async () => {
    const { service } = makeService(
      { data: null, error: null },
      { data: [plus, free], error: null },
    );
    const result = await service.getEffective(userId, NOW);
    expect(result.plan.id).toBe('free');
    expect(result.status).toBe('none');
    expect(result.hasPaidAccess).toBe(false);
  });

  it('UTCID03 throws when the subscription cannot be read', async () => {
    const { service } = makeService(
      { data: null, error: { message: 'down' } },
      { data: [free], error: null },
    );
    await expect(service.getEffective(userId, NOW)).rejects.toThrow(
      new InternalServerErrorException('Could not read subscription'),
    );
  });

  it('UTCID04 throws when the plans cannot be read', async () => {
    const { service } = makeService(
      { data: null, error: null },
      { data: null, error: { message: 'down' } },
    );
    await expect(service.getEffective(userId, NOW)).rejects.toThrow(
      'Could not read plans',
    );
  });

  it('UTCID05 throws when no default plan exists', async () => {
    const { service } = makeService(
      { data: null, error: null },
      { data: [plus], error: null },
    );
    await expect(service.getEffective(userId, NOW)).rejects.toThrow(
      'Default plan is not configured',
    );
  });
});

describe('BE-BIL-17 SubscriptionsService.listPlans', () => {
  const retired: PlanRow = { ...plus, id: 'retired', is_active: false };

  it('UTCID01 includes the deactivated plan the user still has', async () => {
    const { service } = makeService(
      { data: { ...subscription, plan_id: 'retired' }, error: null },
      { data: [plus, retired, free], error: null },
    );
    const result = await service.listPlans(userId, NOW);
    expect(result.map((p) => [p.id, p.isCurrent])).toEqual([
      ['free', false],
      ['plus', false],
      ['retired', true],
    ]);
  });

  it('UTCID02 marks the free plan as current for a user without a subscription', async () => {
    const { service } = makeService(
      { data: null, error: null },
      { data: [plus, retired, free], error: null },
    );
    const result = await service.listPlans(userId, NOW);
    expect(result.map((p) => [p.id, p.isCurrent])).toEqual([
      ['free', true],
      ['plus', false],
    ]);
  });

  it('UTCID03 throws instead of returning a partial list when plans cannot be read', async () => {
    const { service } = makeService(
      { data: null, error: null },
      { data: null, error: { message: 'down' } },
    );
    await expect(service.listPlans(userId, NOW)).rejects.toThrow(
      'Could not read plans',
    );
  });

  it('UTCID04 throws when the subscription cannot be read', async () => {
    const { service } = makeService(
      { data: null, error: { message: 'down' } },
      { data: [free], error: null },
    );
    await expect(service.listPlans(userId, NOW)).rejects.toThrow(
      'Could not read subscription',
    );
  });
});
