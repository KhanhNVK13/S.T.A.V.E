import {
  BadGatewayException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type {
  EffectiveSubscription,
  SubscriptionPlan,
} from '@stave/shared-types';
import type { NotificationsService } from '../notifications/notifications.service';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import { formatDateVi, formatVnd } from './billing-format';
import { classifyChange } from './plan-change';
import type { PaymentsService } from './payments.service';
import {
  SubscriptionChangesService,
  THEME_FROM_IMAGE_SETTING,
} from './subscription-changes.service';
import type { SubscriptionsService } from './subscriptions.service';

const userId = '44444444-4444-4444-8444-444444444444';
const END = '2026-12-06T10:00:00.000Z';

const planRow = (id: string, price: number, extra = {}) => ({
  id,
  name: id === 'free' ? 'Free' : id.toUpperCase(),
  description: '',
  price_vnd: price,
  features: {},
  is_active: true,
  is_default: id === 'free',
  sort_order: 0,
  price_effective_at: null,
  ...extra,
});

const plan = (id: string, price: number): SubscriptionPlan => ({
  id,
  name: id === 'free' ? 'Free' : id.toUpperCase(),
  description: '',
  priceVnd: price,
  features: {},
  isActive: true,
  isDefault: id === 'free',
  sortOrder: 0,
  priceEffectiveAt: null,
});

function effective(
  overrides: Partial<EffectiveSubscription> = {},
): EffectiveSubscription {
  return {
    plan: plan('plus', 49000),
    status: 'active',
    currentPeriodEnd: END,
    graceUntil: null,
    cancelAtPeriodEnd: false,
    pendingPlan: null,
    hasPaidAccess: true,
    inGrace: false,
    ...overrides,
  };
}

const FREE_EFFECTIVE = effective({
  plan: plan('free', 0),
  status: 'none',
  currentPeriodEnd: null,
  hasPaidAccess: false,
});

const ok = (data: unknown): QueryResult => ({ data, error: null });
const fail = (): QueryResult => ({ data: null, error: { message: 'down' } });

function makeService(
  tables: Record<string, QueryResult[]>,
  states: EffectiveSubscription[] = [effective()],
) {
  const mock = createSupabaseMock([], { tables });
  const subscriptions = { getEffective: jest.fn() };
  for (const state of states) {
    subscriptions.getEffective.mockResolvedValueOnce(state);
  }
  subscriptions.getEffective.mockResolvedValue(states[states.length - 1]);
  const payments = {
    createCheckout: jest.fn().mockResolvedValue({
      checkoutUrl: 'https://pay.example/1',
      orderCode: 9,
    }),
  };
  const notifications = { notify: jest.fn() };
  const service = new SubscriptionChangesService(
    mock.client,
    subscriptions as unknown as SubscriptionsService,
    payments as unknown as PaymentsService,
    notifications as unknown as NotificationsService,
  );
  return { service, mock, payments, notifications, subscriptions };
}

describe('BE-BIL-29 classifyChange and billing formats', () => {
  it('UTCID01 treats a more expensive plan as an upgrade', () => {
    expect(classifyChange(49000, 99000)).toBe('upgrade');
  });

  it('UTCID02 treats a cheaper, free or equally priced plan as a downgrade', () => {
    expect(classifyChange(99000, 49000)).toBe('downgrade');
    expect(classifyChange(49000, 0)).toBe('downgrade');
    expect(classifyChange(49000, 49000)).toBe('downgrade');
  });

  it('UTCID03 formats amounts and dates the Vietnamese way', () => {
    expect(formatVnd(49000).replace(/\s/g, ' ')).toBe('49.000 ₫');
    expect(formatDateVi('2026-12-06T20:00:00.000Z')).toBe('07/12/2026');
    expect(formatDateVi(null)).toBe('');
  });
});

describe('BE-BIL-30 SubscriptionChangesService.previewChange', () => {
  it('UTCID01 charges the full new price now for an upgrade', async () => {
    const { service } = makeService({
      subscription_plans: [ok(planRow('pro', 99000))],
    });
    const preview = await service.previewChange(userId, 'pro');
    expect(preview).toMatchObject({
      kind: 'upgrade',
      planName: 'PRO',
      chargeVnd: 99000,
    });
    expect(Date.parse(preview.effectiveAt ?? '')).not.toBeNaN();
  });

  it('UTCID02 charges nothing and waits for the period end for a downgrade', async () => {
    const { service } = makeService({
      subscription_plans: [ok(planRow('free', 0))],
    });
    await expect(service.previewChange(userId, 'free')).resolves.toEqual({
      kind: 'downgrade',
      planName: 'Free',
      chargeVnd: 0,
      effectiveAt: END,
    });
  });

  it('UTCID03 refuses a plan that was deactivated meanwhile', async () => {
    const { service } = makeService({
      subscription_plans: [ok(planRow('pro', 99000, { is_active: false }))],
    });
    await expect(service.previewChange(userId, 'pro')).rejects.toThrow(
      new ConflictException('Plan is no longer available'),
    );
  });

  it('UTCID04 refuses the current plan, an unknown plan and a free user', async () => {
    const same = makeService({
      subscription_plans: [ok(planRow('plus', 49000))],
    });
    await expect(same.service.previewChange(userId, 'plus')).rejects.toThrow(
      'You are already on this plan',
    );
    const unknown = makeService({ subscription_plans: [ok(null)] });
    await expect(unknown.service.previewChange(userId, 'x')).rejects.toThrow(
      NotFoundException,
    );
    const free = makeService({}, [FREE_EFFECTIVE]);
    await expect(free.service.previewChange(userId, 'pro')).rejects.toThrow(
      'You do not have a paid plan',
    );
  });
});

describe('BE-BIL-31 SubscriptionChangesService.change', () => {
  it('UTCID01 sends an upgrade through checkout with the upgrade purpose', async () => {
    const { service, payments, mock } = makeService({
      subscription_plans: [ok(planRow('pro', 99000))],
    });
    await expect(service.change(userId, 'pro')).resolves.toEqual({
      kind: 'upgrade',
      checkoutUrl: 'https://pay.example/1',
      orderCode: 9,
    });
    expect(payments.createCheckout).toHaveBeenCalledWith(
      userId,
      'pro',
      'upgrade',
    );
    expect(mock.builders.subscriptions).toBeUndefined();
  });

  it('UTCID02 lets a provider failure during an upgrade reach the caller', async () => {
    const { service, payments } = makeService({
      subscription_plans: [ok(planRow('pro', 99000))],
    });
    payments.createCheckout.mockRejectedValue(
      new BadGatewayException('Payment provider unavailable'),
    );
    await expect(service.change(userId, 'pro')).rejects.toThrow(
      BadGatewayException,
    );
  });

  it('UTCID03 schedules a downgrade at the period end without charging', async () => {
    const { service, mock, payments, notifications } = makeService({
      subscription_plans: [ok(planRow('free', 0))],
      subscriptions: [ok({ id: 'sub-1' })],
    });
    await expect(service.change(userId, 'free')).resolves.toEqual({
      kind: 'downgrade',
      planName: 'Free',
      scheduledAt: END,
    });
    expect(mock.builders.subscriptions.update).toHaveBeenCalledWith({
      pending_plan_id: 'free',
    });
    expect(mock.builders.subscriptions.eq).toHaveBeenCalledWith(
      'status',
      'active',
    );
    expect(payments.createCheckout).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledWith(
      userId,
      'billing.plan_changed',
      { planName: 'Free', effectiveDate: END },
    );
  });

  it('UTCID04 asks a canceled user to resume before scheduling a downgrade', async () => {
    const { service } = makeService(
      { subscription_plans: [ok(planRow('free', 0))] },
      [effective({ status: 'canceled', cancelAtPeriodEnd: true })],
    );
    await expect(service.change(userId, 'free')).rejects.toThrow(
      'Resume your plan before scheduling a change',
    );
  });

  it('UTCID05 changes nothing when the downgrade cannot be saved', async () => {
    const { service, notifications } = makeService({
      subscription_plans: [ok(planRow('free', 0))],
      subscriptions: [fail()],
    });
    await expect(service.change(userId, 'free')).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

describe('BE-BIL-32 SubscriptionChangesService.cancelDowngrade', () => {
  it('UTCID01 clears the scheduled plan', async () => {
    const { service, mock } = makeService({
      subscriptions: [ok({ id: 'sub-1' })],
    });
    await service.cancelDowngrade(userId);
    expect(mock.builders.subscriptions.update).toHaveBeenCalledWith({
      pending_plan_id: null,
    });
    expect(mock.builders.subscriptions.not).toHaveBeenCalledWith(
      'pending_plan_id',
      'is',
      null,
    );
  });

  it('UTCID02 answers 409 when nothing is scheduled', async () => {
    const { service } = makeService({ subscriptions: [ok(null)] });
    await expect(service.cancelDowngrade(userId)).rejects.toThrow(
      new ConflictException('No plan change is scheduled'),
    );
  });
});

describe('BE-BIL-33 SubscriptionChangesService.cancel', () => {
  it('UTCID01 cancels while keeping the period end and notifies the end date', async () => {
    const canceled = effective({ status: 'canceled', cancelAtPeriodEnd: true });
    const { service, mock, notifications } = makeService(
      { subscriptions: [ok({ id: 'sub-1' })] },
      [effective(), canceled],
    );
    await expect(service.cancel(userId)).resolves.toBe(canceled);
    const update = mock.builders.subscriptions.update.mock.calls[0][0];
    expect(update).toEqual({ status: 'canceled', pending_plan_id: null });
    expect(update).not.toHaveProperty('current_period_end');
    expect(notifications.notify).toHaveBeenCalledWith(
      userId,
      'billing.canceled',
      { planName: 'PLUS', endDate: END },
    );
  });

  it('UTCID02 refuses to cancel a free or already canceled plan', async () => {
    const free = makeService({}, [FREE_EFFECTIVE]);
    await expect(free.service.cancel(userId)).rejects.toThrow(
      'No active paid plan to cancel',
    );
    const canceled = makeService({}, [
      effective({ status: 'canceled', cancelAtPeriodEnd: true }),
    ]);
    await expect(canceled.service.cancel(userId)).rejects.toThrow(
      ConflictException,
    );
  });

  it('UTCID03 keeps the plan renewing when saving the cancellation fails', async () => {
    const { service, notifications } = makeService({
      subscriptions: [fail()],
    });
    await expect(service.cancel(userId)).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(notifications.notify).not.toHaveBeenCalled();
  });
  it('UTCID04 answers 409 when the plan was canceled meanwhile and nothing is updated', async () => {
    const { service, notifications } = makeService({
      subscriptions: [ok(null)],
    });
    await expect(service.cancel(userId)).rejects.toThrow(
      'No active paid plan to cancel',
    );
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

describe('BE-BIL-45 SubscriptionChangesService.resume', () => {
  it('UTCID01 resumes a canceled plan that is still running without charging', async () => {
    const { service, mock, payments } = makeService(
      { subscriptions: [ok({ id: 'sub-1' })] },
      [effective({ status: 'canceled', cancelAtPeriodEnd: true }), effective()],
    );
    await expect(service.resume(userId)).resolves.toMatchObject({
      status: 'active',
    });
    expect(mock.builders.subscriptions.update).toHaveBeenCalledWith({
      status: 'active',
    });
    expect(payments.createCheckout).not.toHaveBeenCalled();
  });

  it('UTCID02 refuses to resume an active plan or an expired one', async () => {
    const active = makeService({});
    await expect(active.service.resume(userId)).rejects.toThrow(
      'Only a canceled plan that is still running can be resumed',
    );
    const expired = makeService({}, [FREE_EFFECTIVE]);
    await expect(expired.service.resume(userId)).rejects.toThrow(
      ConflictException,
    );
  });

  it('UTCID03 throws when the subscription cannot be updated', async () => {
    const { service } = makeService({ subscriptions: [fail()] }, [
      effective({ status: 'canceled', cancelAtPeriodEnd: true }),
    ]);
    await expect(service.resume(userId)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('UTCID04 answers 409 when the plan was resumed meanwhile and nothing is updated', async () => {
    const { service } = makeService({ subscriptions: [ok(null)] }, [
      effective({ status: 'canceled', cancelAtPeriodEnd: true }),
    ]);
    await expect(service.resume(userId)).rejects.toThrow(ConflictException);
  });
});

describe('BE-BIL-34 SubscriptionChangesService.previewCancel', () => {
  it('UTCID01 lists the custom theme as a paid-only setting', async () => {
    const { service } = makeService({
      users: [ok({ active_theme_id: 'theme-1' })],
      themes: [ok({ type: 'custom' })],
    });
    await expect(service.previewCancel(userId)).resolves.toEqual({
      endDate: END,
      paidOnlySettings: [THEME_FROM_IMAGE_SETTING],
    });
  });

  it('UTCID02 lists nothing for a preset theme or no theme', async () => {
    const preset = makeService({
      users: [ok({ active_theme_id: 'theme-1' })],
      themes: [ok({ type: 'preset' })],
    });
    await expect(preset.service.previewCancel(userId)).resolves.toMatchObject({
      paidOnlySettings: [],
    });
    const none = makeService({ users: [ok({ active_theme_id: null })] });
    await expect(none.service.previewCancel(userId)).resolves.toMatchObject({
      paidOnlySettings: [],
    });
  });

  it('UTCID03 throws when the account cannot be read', async () => {
    const { service } = makeService({ users: [fail()] });
    await expect(service.previewCancel(userId)).rejects.toThrow(
      'Could not read your account',
    );
  });

  it('UTCID04 refuses a free plan with nothing to cancel', async () => {
    const { service } = makeService({}, [FREE_EFFECTIVE]);
    await expect(service.previewCancel(userId)).rejects.toThrow(
      'No active paid plan to cancel',
    );
  });
});

describe('BE-BIL-44 SubscriptionChangesService.renew', () => {
  it('UTCID01 creates a renewal checkout for the current paid plan', async () => {
    const { service, payments } = makeService({}, [effective()]);

    await expect(service.renew(userId)).resolves.toEqual({
      checkoutUrl: 'https://pay.example/1',
      orderCode: 9,
    });
    expect(payments.createCheckout).toHaveBeenCalledWith(
      userId,
      'plus',
      'renew',
    );
  });

  it('UTCID02 refuses to renew while a downgrade is scheduled', async () => {
    const { service, payments } = makeService({}, [
      effective({ pendingPlan: plan('free', 0) }),
    ]);

    await expect(service.renew(userId)).rejects.toThrow(
      'Cannot renew while downgrade is scheduled',
    );
    expect(payments.createCheckout).not.toHaveBeenCalled();
  });

  it('UTCID03 refuses to renew a free plan', async () => {
    const { service, payments } = makeService({}, [FREE_EFFECTIVE]);

    await expect(service.renew(userId)).rejects.toThrow(ConflictException);
    expect(payments.createCheckout).not.toHaveBeenCalled();
  });

  it('UTCID04 refuses to renew a canceled plan', async () => {
    const { service, payments } = makeService({}, [
      effective({ status: 'canceled' }),
    ]);

    await expect(service.renew(userId)).rejects.toThrow(
      'Only your current paid plan can be renewed',
    );
    expect(payments.createCheckout).not.toHaveBeenCalled();
  });

  it('UTCID05 renews a plan that is in its grace period', async () => {
    const { service, payments } = makeService({}, [
      effective({ inGrace: true, graceUntil: '2026-12-09T10:00:00.000Z' }),
    ]);

    await service.renew(userId);

    expect(payments.createCheckout).toHaveBeenCalledWith(
      userId,
      'plus',
      'renew',
    );
  });

  it('UTCID06 reports the failure when the payment gateway is unreachable', async () => {
    const { service, payments } = makeService({}, [effective()]);
    payments.createCheckout.mockRejectedValueOnce(
      new BadGatewayException('Payment gateway unavailable'),
    );

    await expect(service.renew(userId)).rejects.toThrow(BadGatewayException);
  });
});
