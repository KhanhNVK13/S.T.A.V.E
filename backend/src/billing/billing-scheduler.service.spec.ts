/* eslint-disable @typescript-eslint/unbound-method */
import type { NotificationsService } from '../notifications/notifications.service';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import { BillingSchedulerService } from './billing-scheduler.service';
import type { PaymentGateway } from './payment-gateway';
import type { PaymentsService } from './payments.service';

const userId = '55555555-5555-4555-8555-555555555555';
const planId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const freeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const ok = (data: unknown): QueryResult => ({ data, error: null });
const fail = (message = 'down'): QueryResult => ({
  data: null,
  error: { message },
});

const planRow = (
  id: string,
  name: string,
  price: number,
  isDefault = false,
) => ({
  id,
  name,
  description: '',
  price_vnd: price,
  features: {},
  is_active: true,
  is_default: isDefault,
  sort_order: 0,
  price_effective_at: null,
});

const subscriptionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  user_id: userId,
  plan_id: planId,
  status: 'active' as const,
  price_locked_vnd: 49000,
  started_at: '2026-10-06T00:00:00.000Z',
  current_period_end: '2026-11-06T00:00:00.000Z',
  pending_plan_id: null,
  grace_until: null,
  renewal_notified_at: null,
  ...overrides,
});

/** Giờ cố định cho mọi bước quét — không phụ thuộc đồng hồ thật. */
const now = new Date('2026-11-07T00:00:00.000Z');

function makeService(
  tables: Record<string, QueryResult[]>,
  provider = 'fake',
  gatewayOverrides: Partial<PaymentGateway> = {},
) {
  const mock = createSupabaseMock([], { tables });
  const gateway = {
    createCheckout: jest.fn(),
    verifyWebhook: jest.fn(),
    getPaymentStatus: jest.fn().mockResolvedValue('pending'),
    ...gatewayOverrides,
  };
  const payments = { completeOrder: jest.fn() } as unknown as PaymentsService;
  const notifications = {
    notify: jest.fn(),
  } as unknown as NotificationsService;
  const service = new BillingSchedulerService(
    mock.client,
    gateway,
    provider,
    payments,
    notifications,
  );
  return { service, mock, gateway, payments, notifications };
}

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('BE-BIL-38 BillingSchedulerService lifecycle', () => {
  it('UTCID01 sweeps immediately and then every hour', () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = 'production';
    const spy = jest
      .spyOn(BillingSchedulerService.prototype, 'sweep')
      .mockResolvedValue(undefined);
    const { service } = makeService({ subscriptions: [] });

    service.onModuleInit();
    expect(spy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(spy).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockRestore();
    jest.useRealTimers();
  });

  it('UTCID02 does not sweep when BILLING_SCHEDULER_ENABLED is false', () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = 'production';
    process.env.BILLING_SCHEDULER_ENABLED = 'false';
    const spy = jest
      .spyOn(BillingSchedulerService.prototype, 'sweep')
      .mockResolvedValue(undefined);
    const { service } = makeService({ subscriptions: [] });

    service.onModuleInit();
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
    jest.useRealTimers();
  });

  it('UTCID03 does not sweep when NODE_ENV is test', () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = 'test';
    const spy = jest
      .spyOn(BillingSchedulerService.prototype, 'sweep')
      .mockResolvedValue(undefined);
    const { service } = makeService({ subscriptions: [] });

    service.onModuleInit();
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
    jest.useRealTimers();
  });
});

describe('BE-BIL-39 BillingSchedulerService grace periods', () => {
  it('UTCID01 opens a three-day grace period for an overdue plan', async () => {
    const { service, mock } = makeService({
      subscriptions: [
        ok([
          subscriptionRow({ current_period_end: '2026-11-01T00:00:00.000Z' }),
        ]),
        ok([{ id: 'sub-1' }]),
      ],
    });

    await service.openGracePeriods(now);

    const update = mock.builders.subscriptions.update;
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toEqual({
      grace_until: '2026-11-04T00:00:00.000Z',
    });
  });

  it('UTCID02 does nothing when no plan is overdue', async () => {
    const { service, mock, notifications } = makeService({
      subscriptions: [ok([])],
    });

    await service.openGracePeriods(now);

    expect(mock.builders.subscriptions.update).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('UTCID03 fails the step when the read fails', async () => {
    const { service } = makeService({
      subscriptions: [fail('subscriptions are down')],
    });

    await expect(service.openGracePeriods(now)).rejects.toThrow(
      'Could not read subscriptions',
    );
  });
});

describe('BE-BIL-40 BillingSchedulerService renewal reminders', () => {
  it('UTCID01 notifies when the three-day milestone is reached', async () => {
    const { service, notifications } = makeService({
      subscriptions: [
        ok([
          subscriptionRow({
            current_period_end: '2026-11-10T00:00:00.000Z',
            renewal_notified_at: null,
          }),
        ]),
        ok([{ id: 'sub-1' }]),
      ],
      subscription_plans: [ok([planRow(planId, 'STAVE+', 49000)])],
    });

    await service.sendRenewalReminders(now);

    expect(notifications.notify).toHaveBeenCalledWith(
      userId,
      'billing.renewal_due',
      expect.objectContaining({ planName: 'STAVE+' }),
    );
  });

  it('UTCID02 does not notify when the row was not updated', async () => {
    const { service, notifications } = makeService({
      subscriptions: [
        ok([
          subscriptionRow({
            current_period_end: '2026-11-10T00:00:00.000Z',
            renewal_notified_at: null,
          }),
        ]),
        ok([]),
      ],
      subscription_plans: [ok([planRow(planId, 'STAVE+', 49000)])],
    });

    await service.sendRenewalReminders(now);

    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('UTCID03 does not notify before any milestone', async () => {
    const { service, notifications } = makeService({
      subscriptions: [
        ok([
          subscriptionRow({
            current_period_end: '2026-12-31T00:00:00.000Z',
            renewal_notified_at: null,
          }),
        ]),
      ],
      subscription_plans: [ok([planRow(planId, 'STAVE+', 49000)])],
    });

    await service.sendRenewalReminders(now);

    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

describe('BE-BIL-41 BillingSchedulerService scheduled plan changes', () => {
  it('UTCID01 applies a downgrade to the free plan', async () => {
    const { service, notifications } = makeService({
      subscriptions: [
        ok([subscriptionRow({ pending_plan_id: freeId })]),
        ok([{ id: 'sub-1' }]),
      ],
      subscription_plans: [
        ok([
          planRow(planId, 'STAVE+', 49000),
          planRow(freeId, 'Free', 0, true),
        ]),
      ],
    });

    await service.applyScheduledDowngrades(now);

    expect(notifications.notify).toHaveBeenCalledWith(
      userId,
      'billing.plan_changed',
      expect.objectContaining({ planName: 'Free' }),
    );
  });

  it('UTCID02 does nothing when no plan change is scheduled', async () => {
    const { service, notifications } = makeService({
      subscriptions: [ok([])],
    });

    await service.applyScheduledDowngrades(now);

    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

describe('BE-BIL-42 BillingSchedulerService stale pending orders', () => {
  it('UTCID01 marks a stale pending order as failed with the fake gateway', async () => {
    const { service, payments, mock } = makeService(
      {
        transactions: [ok([{ id: 'tx-1', order_code: 42 }]), ok(null)],
      },
      'fake',
    );

    await service.failStalePendingOrders(now);

    expect(payments.completeOrder).not.toHaveBeenCalled();
    expect(mock.builders.transactions.update).toHaveBeenCalledWith({
      status: 'failed',
    });
  });

  it('UTCID02 completes the order when PayOS reports success', async () => {
    const { service, payments } = makeService(
      {
        transactions: [ok([{ id: 'tx-1', order_code: 42 }])],
      },
      'payos',
      { getPaymentStatus: jest.fn().mockResolvedValue('success') },
    );

    await service.failStalePendingOrders(now);

    expect(payments.completeOrder).toHaveBeenCalledWith(42, true);
  });

  it('UTCID03 skips the order when the provider is unreachable', async () => {
    const { service, payments } = makeService(
      {
        transactions: [ok([{ id: 'tx-1', order_code: 42 }])],
      },
      'payos',
      {
        getPaymentStatus: jest.fn().mockRejectedValue(new Error('timeout')),
      },
    );

    await service.failStalePendingOrders(now);

    expect(payments.completeOrder).not.toHaveBeenCalled();
  });
});

describe('BE-BIL-43 BillingSchedulerService isolation', () => {
  it('UTCID01 keeps the other steps running when one step fails', async () => {
    const { service, notifications } = makeService({
      subscriptions: [
        fail('subscriptions are down'),
        ok([
          subscriptionRow({
            current_period_end: '2026-11-10T00:00:00.000Z',
            renewal_notified_at: null,
          }),
        ]),
        ok([{ id: 'sub-1' }]),
        ok([]),
      ],
      subscription_plans: [ok([planRow(planId, 'STAVE+', 49000)])],
      transactions: [ok([])],
    });

    await service.sweep(now);

    expect(notifications.notify).toHaveBeenCalledWith(
      userId,
      'billing.renewal_due',
      expect.objectContaining({ planName: 'STAVE+' }),
    );
  });
});
