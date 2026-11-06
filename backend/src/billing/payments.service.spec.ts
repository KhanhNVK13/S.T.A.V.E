import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { EffectiveSubscription } from '@stave/shared-types';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import type { NotificationsService } from '../notifications/notifications.service';
import {
  createSupabaseMock,
  type QueryResult,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import { DevFakePaymentController } from './dev-fake-payment.controller';
import { FakeGateway } from './fake.gateway';
import {
  PaymentsService,
  formatVnd,
  generateOrderCode,
  toOrderStatus,
} from './payments.service';
import type { SubscriptionsService } from './subscriptions.service';

const userId = '44444444-4444-4444-8444-444444444444';
const otherUserId = '55555555-5555-4555-8555-555555555555';
const planId = '66666666-6666-4666-8666-666666666666';
const orderCode = 173000000000012;
const FRONTEND = 'http://localhost:3000';

const plusRow = {
  id: planId,
  name: 'STAVE+',
  description: '',
  price_vnd: 49000,
  features: {},
  is_active: true,
  is_default: false,
  sort_order: 1,
  price_effective_at: null,
};
const payer = {
  status: 'active',
  email: 'hai@stave.test',
  username: 'hai',
  display_name: 'Hải',
};

function effective(paid: boolean): EffectiveSubscription {
  const plan = {
    id: paid ? planId : 'free',
    name: paid ? 'STAVE+' : 'Free',
    description: '',
    priceVnd: paid ? 49000 : 0,
    features: {},
    isActive: true,
    isDefault: !paid,
    sortOrder: paid ? 1 : 0,
    priceEffectiveAt: null,
  };
  return {
    plan,
    status: paid ? 'active' : 'none',
    currentPeriodEnd: paid ? '2026-12-01T00:00:00.000Z' : null,
    cancelAtPeriodEnd: false,
    pendingPlan: null,
    hasPaidAccess: paid,
    inGrace: false,
  };
}

function rpcRow(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      processed: true,
      status: 'success',
      user_id: userId,
      plan_id: planId,
      plan_name: 'STAVE+',
      amount_vnd: 49000,
      transaction_id: 'tx-1',
      subscription_id: 'sub-1',
      activated: true,
      activation_error: null,
      issue_created: false,
      ...overrides,
    },
    error: null,
  };
}

interface GatewayMock {
  createCheckout: jest.Mock;
  verifyWebhook: jest.Mock;
  getPaymentStatus: jest.Mock;
}

function fakeGateway(): GatewayMock {
  return {
    createCheckout: jest.fn().mockResolvedValue({
      checkoutUrl: 'https://pay.example/abc',
      providerRef: 'abc',
    }),
    verifyWebhook: jest.fn(),
    getPaymentStatus: jest.fn(),
  };
}

function makeService(
  options: SupabaseMockOptions = {},
  {
    gateway = fakeGateway(),
    paid = false,
  }: { gateway?: GatewayMock; paid?: boolean } = {},
) {
  const mock = createSupabaseMock([], options);
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const subscriptions = {
    getEffective: jest.fn().mockResolvedValue(effective(paid)),
  };
  const service = new PaymentsService(
    mock.client,
    gateway,
    FRONTEND,
    subscriptions as unknown as SubscriptionsService,
    notifications as unknown as NotificationsService,
  );
  return { service, mock, notifications, subscriptions, gateway };
}

const ok = (data: unknown = null): QueryResult => ({ data, error: null });
const fail = (code = 'XX000'): QueryResult => ({
  data: null,
  error: { code, message: 'db error' },
});

function checkoutTables(transactions: QueryResult[]) {
  return {
    users: [ok(payer)],
    subscription_plans: [ok(plusRow)],
    transactions,
  };
}

describe('BE-BIL-19 PaymentsService.createCheckout', () => {
  it('UTCID01 records a pending charge and returns the provider checkout URL', async () => {
    const { service, mock, gateway } = makeService({
      tables: checkoutTables([ok(null), ok(null), ok(null)]),
    });

    const result = await service.createCheckout(
      userId,
      planId,
      'subscribe',
      '/profile?tab=theme',
    );

    const inserted = mock.builders.transactions.insert.mock.calls[0][0];
    expect(inserted).toMatchObject({
      user_id: userId,
      plan_id: planId,
      amount_vnd: 49000,
      status: 'pending',
      kind: 'charge',
      description: 'Đăng ký STAVE+',
      payer_name: 'Hải',
      payer_email: 'hai@stave.test',
      retry_of: null,
    });
    expect(Number.isSafeInteger(inserted.order_code)).toBe(true);
    expect(result).toEqual({
      checkoutUrl: 'https://pay.example/abc',
      orderCode: inserted.order_code,
    });
    expect(gateway.createCheckout).toHaveBeenCalledWith({
      orderCode: inserted.order_code,
      amountVnd: 49000,
      description: `STAVE ${inserted.order_code}`,
      returnUrl: `${FRONTEND}/billing/result?orderCode=${inserted.order_code}&returnTo=%2Fprofile%3Ftab%3Dtheme`,
      cancelUrl: `${FRONTEND}/plans?canceled=1`,
    });
    expect(mock.builders.transactions.update).toHaveBeenCalledWith({
      provider_ref: 'abc',
    });
  });

  it('UTCID02 drops a returnTo that would leave the site', async () => {
    const { service, gateway } = makeService({
      tables: checkoutTables([ok(null), ok(null), ok(null)]),
    });
    await service.createCheckout(userId, planId, 'subscribe', '//evil.com');
    const call = gateway.createCheckout.mock.calls[0][0];
    expect(call.returnUrl).not.toContain('returnTo');
  });

  it('UTCID03 links a new attempt to the latest failed charge of the same plan', async () => {
    const { service, mock } = makeService({
      tables: checkoutTables([
        ok({ id: 'failed-1' }),
        ok(null),
        ok(null),
        ok(null),
      ]),
    });
    await service.createCheckout(userId, planId, 'subscribe');
    expect(mock.builders.transactions.insert.mock.calls[0][0].retry_of).toBe(
      'failed-1',
    );
    expect(mock.builders.transactions.eq).toHaveBeenCalledWith(
      'retry_of',
      'failed-1',
    );
  });

  it('UTCID04 does not link to a failed charge that was already retried', async () => {
    const { service, mock } = makeService({
      tables: checkoutTables([
        ok({ id: 'failed-1' }),
        ok({ id: 'retry-1' }),
        ok(null),
        ok(null),
      ]),
    });
    await service.createCheckout(userId, planId, 'subscribe');
    expect(mock.builders.transactions.insert.mock.calls[0][0].retry_of).toBe(
      null,
    );
  });

  it('UTCID05 removes the pending row and answers 502 when the provider fails', async () => {
    const gateway = fakeGateway();
    gateway.createCheckout.mockRejectedValue(new Error('timeout'));
    const { service, mock } = makeService(
      { tables: checkoutTables([ok(null), ok(null), ok(null)]) },
      { gateway },
    );

    await expect(
      service.createCheckout(userId, planId, 'subscribe'),
    ).rejects.toThrow(new BadGatewayException('Payment provider unavailable'));

    const insertedId = mock.builders.transactions.insert.mock.calls[0][0].id;
    expect(mock.builders.transactions.delete).toHaveBeenCalledTimes(1);
    expect(mock.builders.transactions.eq).toHaveBeenCalledWith(
      'id',
      insertedId,
    );
    expect(mock.builders.transactions.eq).toHaveBeenCalledWith(
      'status',
      'pending',
    );
    expect(mock.builders.transactions.update).not.toHaveBeenCalled();
  });

  it('UTCID06 refuses an account that is not active', async () => {
    const { service, mock } = makeService({
      tables: { users: [ok({ ...payer, status: 'suspended' })] },
    });
    await expect(
      service.createCheckout(userId, planId, 'subscribe'),
    ).rejects.toThrow(new ForbiddenException('Account is not active'));
    expect(mock.builder.insert).not.toHaveBeenCalled();
  });

  it('UTCID07 refuses an unknown or deactivated plan', async () => {
    const missing = makeService({
      tables: { users: [ok(payer)], subscription_plans: [ok(null)] },
    });
    await expect(
      missing.service.createCheckout(userId, planId, 'subscribe'),
    ).rejects.toThrow(NotFoundException);

    const inactive = makeService({
      tables: {
        users: [ok(payer)],
        subscription_plans: [ok({ ...plusRow, is_active: false })],
      },
    });
    await expect(
      inactive.service.createCheckout(userId, planId, 'subscribe'),
    ).rejects.toThrow(new ConflictException('Plan is no longer available'));
  });

  it('UTCID08 refuses to subscribe again while a paid plan is in effect', async () => {
    const { service, mock } = makeService(
      { tables: checkoutTables([]) },
      { paid: true },
    );
    await expect(
      service.createCheckout(userId, planId, 'subscribe'),
    ).rejects.toThrow(new ConflictException('You already have a paid plan'));
    expect(mock.builder.insert).not.toHaveBeenCalled();
  });

  it('UTCID09 refuses a plan that costs nothing', async () => {
    const { service } = makeService({
      tables: {
        users: [ok(payer)],
        subscription_plans: [ok({ ...plusRow, price_vnd: 0 })],
      },
    });
    await expect(
      service.createCheckout(userId, planId, 'subscribe'),
    ).rejects.toThrow(BadRequestException);
  });

  it('UTCID10 retries with a new order code when the code is already taken', async () => {
    const { service, mock } = makeService({
      tables: checkoutTables([ok(null), fail('23505'), ok(null), ok(null)]),
    });
    await service.createCheckout(userId, planId, 'subscribe');
    expect(mock.builders.transactions.insert).toHaveBeenCalledTimes(2);
  });

  it('UTCID11 gives up on any other insert error', async () => {
    const { service, gateway } = makeService({
      tables: checkoutTables([ok(null), fail()]),
    });
    await expect(
      service.createCheckout(userId, planId, 'subscribe'),
    ).rejects.toThrow(InternalServerErrorException);
    expect(gateway.createCheckout).not.toHaveBeenCalled();
  });

  it('UTCID12 only allows an upgrade to a more expensive plan', async () => {
    const { service } = makeService(
      { tables: checkoutTables([]) },
      { paid: true },
    );
    await expect(
      service.createCheckout(userId, planId, 'upgrade'),
    ).rejects.toThrow('You are already on this plan');
  });
});

describe('BE-BIL-10 PaymentsService.completeOrder', () => {
  it('UTCID01 notifies a successful payment with the plan name and VND amount', async () => {
    const { service, mock, notifications } = makeService({
      rpc: { billing_complete_order: rpcRow() },
    });
    const result = await service.completeOrder(orderCode, true);

    expect(mock.rpc).toHaveBeenCalledWith('billing_complete_order', {
      p_order_code: orderCode,
      p_success: true,
    });
    expect(result).toMatchObject({ processed: true, activated: true });
    expect(notifications.notify).toHaveBeenCalledWith(
      userId,
      'billing.payment_success',
      { planName: 'STAVE+', amount: formatVnd(49000), orderCode },
    );
  });

  it('UTCID02 notifies a failed payment without activating anything', async () => {
    const { service, mock, notifications } = makeService({
      rpc: {
        billing_complete_order: rpcRow({
          status: 'failed',
          activated: false,
          subscription_id: null,
        }),
      },
    });
    await service.completeOrder(orderCode, false);
    expect(mock.rpc).toHaveBeenCalledWith('billing_complete_order', {
      p_order_code: orderCode,
      p_success: false,
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      userId,
      'billing.payment_failed',
      expect.objectContaining({ planName: 'STAVE+' }),
    );
  });

  it('UTCID03 sends one notification when the same order is completed twice', async () => {
    const { service, notifications } = makeService({
      rpc: {
        billing_complete_order: [rpcRow(), rpcRow({ processed: false })],
      },
    });
    await service.completeOrder(orderCode, true);
    await service.completeOrder(orderCode, true);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });

  it('UTCID04 sends one notification when two completions race', async () => {
    const { service, notifications } = makeService({
      rpc: {
        billing_complete_order: [rpcRow(), rpcRow({ processed: false })],
      },
    });
    const results = await Promise.all([
      service.completeOrder(orderCode, true),
      service.completeOrder(orderCode, true),
    ]);
    expect(results.filter((r) => r.processed)).toHaveLength(1);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });

  it('UTCID05 keeps the payment successful and reports the opened issue when activation fails', async () => {
    const { service, notifications } = makeService({
      rpc: {
        billing_complete_order: rpcRow({
          activated: false,
          subscription_id: null,
          activation_error: 'boom',
          issue_created: true,
        }),
      },
    });
    const result = await service.completeOrder(orderCode, true);
    expect(result).toMatchObject({
      status: 'success',
      activated: false,
      issueCreated: true,
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      userId,
      'billing.payment_success',
      expect.anything(),
    );
  });

  it('UTCID06 accepts an unknown order without notifying anyone', async () => {
    const { service, notifications } = makeService({
      rpc: {
        billing_complete_order: rpcRow({
          processed: false,
          status: null,
          user_id: null,
          plan_id: null,
          plan_name: null,
          amount_vnd: null,
          transaction_id: null,
        }),
      },
    });
    await expect(service.completeOrder(123, true)).resolves.toMatchObject({
      processed: false,
      transactionId: null,
    });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('UTCID07 reports a late success on a failed order as an issue without notifying', async () => {
    const { service, notifications } = makeService({
      rpc: {
        billing_complete_order: rpcRow({
          processed: false,
          status: 'failed',
          issue_created: true,
        }),
      },
    });
    const result = await service.completeOrder(orderCode, true);
    expect(result).toMatchObject({ status: 'failed', issueCreated: true });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('UTCID08 throws when the RPC fails', async () => {
    const { service } = makeService({
      rpc: { billing_complete_order: fail() },
    });
    await expect(service.completeOrder(orderCode, true)).rejects.toThrow(
      new InternalServerErrorException('Could not complete the order'),
    );
  });
});

const orderRow = {
  order_code: orderCode,
  user_id: userId,
  amount_vnd: 49000,
  status: 'pending',
  created_at: '2026-11-06T10:00:00.000Z',
  plan: { name: 'STAVE+' },
};

describe('BE-BIL-11 PaymentsService.getOrderForUser', () => {
  const at = (iso: string) => new Date(iso);

  it('UTCID01 returns the caller own order', async () => {
    const { service } = makeService({
      tables: { transactions: [ok(orderRow)] },
    });
    await expect(
      service.getOrderForUser(userId, orderCode, at('2026-11-06T10:10:00Z')),
    ).resolves.toEqual({
      orderCode,
      planName: 'STAVE+',
      amountVnd: 49000,
      status: 'pending',
      createdAt: '2026-11-06T10:00:00.000Z',
    });
  });

  it('UTCID02 hides an order that belongs to someone else', async () => {
    const { service } = makeService({
      tables: { transactions: [ok(orderRow)] },
    });
    await expect(
      service.getOrderForUser(otherUserId, orderCode),
    ).rejects.toThrow(new NotFoundException('Order not found'));
  });

  it('UTCID03 answers not found for an unknown order', async () => {
    const { service } = makeService({ tables: { transactions: [ok(null)] } });
    await expect(service.getOrderForUser(userId, orderCode)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('UTCID04 shows a pending order older than 30 minutes as expired', async () => {
    const { service } = makeService({
      tables: { transactions: [ok(orderRow)] },
    });
    const order = await service.getOrderForUser(
      userId,
      orderCode,
      at('2026-11-06T10:31:00Z'),
    );
    expect(order.status).toBe('expired');
  });

  it('UTCID05 throws when the order cannot be read', async () => {
    const { service } = makeService({ tables: { transactions: [fail()] } });
    await expect(service.getOrderForUser(userId, orderCode)).rejects.toThrow(
      'Could not read the order',
    );
  });
});

describe('BE-BIL-20 PaymentsService.syncOrder', () => {
  const freshRow = { ...orderRow, created_at: new Date().toISOString() };

  it('UTCID01 completes the order when the provider reports it paid', async () => {
    const gateway = fakeGateway();
    gateway.getPaymentStatus.mockResolvedValue('success');
    const { service, mock } = makeService(
      {
        tables: {
          transactions: [ok(freshRow), ok({ ...freshRow, status: 'success' })],
        },
        rpc: { billing_complete_order: rpcRow() },
      },
      { gateway },
    );
    const order = await service.syncOrder(userId, orderCode);
    expect(gateway.getPaymentStatus).toHaveBeenCalledWith(orderCode);
    expect(mock.rpc).toHaveBeenCalledWith('billing_complete_order', {
      p_order_code: orderCode,
      p_success: true,
    });
    expect(order.status).toBe('success');
  });

  it('UTCID02 does not ask the provider about an order that is already settled', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(
      { tables: { transactions: [ok({ ...freshRow, status: 'success' })] } },
      { gateway },
    );
    await service.syncOrder(userId, orderCode);
    expect(gateway.getPaymentStatus).not.toHaveBeenCalled();
  });

  it('UTCID03 asks the provider at most once every 3 seconds per order', async () => {
    const gateway = fakeGateway();
    gateway.getPaymentStatus.mockResolvedValue('pending');
    const { service } = makeService(
      { tables: { transactions: [ok(freshRow), ok(freshRow)] } },
      { gateway },
    );
    await service.syncOrder(userId, orderCode);
    await service.syncOrder(userId, orderCode);
    expect(gateway.getPaymentStatus).toHaveBeenCalledTimes(1);
  });

  it('UTCID04 answers 502 and changes nothing when the provider is unreachable', async () => {
    const gateway = fakeGateway();
    gateway.getPaymentStatus.mockRejectedValue(new Error('offline'));
    const { service, mock } = makeService(
      { tables: { transactions: [ok(freshRow)] } },
      { gateway },
    );
    await expect(service.syncOrder(userId, orderCode)).rejects.toThrow(
      BadGatewayException,
    );
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('UTCID05 hides another user order', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(
      { tables: { transactions: [ok(freshRow)] } },
      { gateway },
    );
    await expect(service.syncOrder(otherUserId, orderCode)).rejects.toThrow(
      NotFoundException,
    );
    expect(gateway.getPaymentStatus).not.toHaveBeenCalled();
  });
});

describe('BE-BIL-21 fake payment flow', () => {
  const req = { user: { id: userId } } as AuthenticatedRequest;

  it.each([
    ['success', true, 'billing.payment_success'],
    ['fail', false, 'billing.payment_failed'],
    ['cancel', false, 'billing.payment_failed'],
  ] as const)(
    'UTCID01 %s goes through the same completion as the webhook',
    async (result, success, notification) => {
      const supabase = createSupabaseMock([], {
        tables: { transactions: [ok(orderRow), ok(orderRow)] },
        rpc: {
          billing_complete_order: rpcRow(
            success ? {} : { status: 'failed', activated: false },
          ),
        },
      });
      const notifications = { notify: jest.fn() };
      const service = new PaymentsService(
        supabase.client,
        new FakeGateway(supabase.client, FRONTEND),
        FRONTEND,
        {} as SubscriptionsService,
        notifications as unknown as NotificationsService,
      );
      await new DevFakePaymentController(service).complete(req, {
        orderCode,
        result,
      });
      expect(supabase.rpc).toHaveBeenCalledWith('billing_complete_order', {
        p_order_code: orderCode,
        p_success: success,
      });
      expect(notifications.notify).toHaveBeenCalledWith(
        userId,
        notification,
        expect.anything(),
      );
    },
  );
});

describe('BE-BIL-22 order helpers', () => {
  it('UTCID01 builds order codes from the clock and two random digits', () => {
    expect(generateOrderCode(1_762_400_000_000, () => 0.999)).toBe(
      176_240_000_000_099,
    );
    expect(generateOrderCode(1_762_400_000_000, () => 0)).toBe(
      176_240_000_000_000,
    );
    expect(Number.isSafeInteger(generateOrderCode())).toBe(true);
  });

  it('UTCID02 keeps settled orders as they are', () => {
    const old = '2026-01-01T00:00:00.000Z';
    expect(toOrderStatus('success', old, new Date())).toBe('success');
    expect(toOrderStatus('failed', old, new Date())).toBe('failed');
    expect(toOrderStatus('pending', old, new Date())).toBe('expired');
  });
});
