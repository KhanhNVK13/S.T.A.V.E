import type {
  EffectiveSubscription,
  SubscriptionPlan,
} from '@stave/shared-types';
import type { NotificationsService } from '../notifications/notifications.service';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import {
  listVisiblePlans,
  toSubscriptionPlan,
  type PlanRow,
} from './effective-plan';
import { PaymentsService } from './payments.service';
import { computeRenewalPrice, currentPlanPrice } from './renewal';
import { SubscriptionChangesService } from './subscription-changes.service';
import type { SubscriptionsService } from './subscriptions.service';

const userId = '44444444-4444-4444-8444-444444444444';
const T0 = new Date('2026-11-11T00:00:00.000Z');
const EFFECTIVE_AT = new Date(T0.getTime() + 1000);
const PAST_EFFECTIVE = new Date(T0.getTime() + 5000);

const ok = (data: unknown): QueryResult => ({ data, error: null });

function planRow(overrides: Partial<PlanRow> = {}): PlanRow {
  return {
    id: 'pro',
    name: 'PRO',
    description: '',
    price_vnd: 99000,
    features: {},
    is_active: true,
    is_default: false,
    sort_order: 2,
    price_effective_at: EFFECTIVE_AT.toISOString(),
    previous_price_vnd: 79000,
    ...overrides,
  };
}

const currentPlan: SubscriptionPlan = {
  id: 'plus',
  name: 'PLUS',
  description: '',
  priceVnd: 49000,
  features: {},
  isActive: true,
  isDefault: false,
  sortOrder: 1,
  priceEffectiveAt: null,
};

const paidEffective: EffectiveSubscription = {
  plan: currentPlan,
  status: 'active',
  currentPeriodEnd: '2026-12-06T10:00:00.000Z',
  graceUntil: null,
  cancelAtPeriodEnd: false,
  pendingPlan: null,
  hasPaidAccess: true,
  inGrace: false,
};

function clockJumpingSubscriptions() {
  return {
    getEffective: jest.fn(() => {
      jest.setSystemTime(PAST_EFFECTIVE);
      return Promise.resolve(paidEffective);
    }),
    getSubscriptionRow: jest.fn(() => {
      jest.setSystemTime(PAST_EFFECTIVE);
      return Promise.resolve({ price_locked_vnd: 49000, plan_id: 'plus' });
    }),
  };
}

describe('Billing dùng một mốc thời gian cho mỗi yêu cầu', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T0 });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('xem trước đổi gói: ngày hiệu lực rơi giữa hai lần gọi vẫn báo giá cũ và nhất quán', async () => {
    const mock = createSupabaseMock([], {
      tables: { subscription_plans: [ok(planRow())] },
    });
    const subscriptions = clockJumpingSubscriptions();
    const service = new SubscriptionChangesService(
      mock.client,
      subscriptions as unknown as SubscriptionsService,
      {} as unknown as PaymentsService,
      { notify: jest.fn() } as unknown as NotificationsService,
    );

    const preview = await service.previewChange(userId, 'pro');

    expect(preview.kind).toBe('upgrade');
    expect(preview.chargeVnd).toBe(79000);
    expect(preview.effectiveAt).toBe(T0.toISOString());
  });

  it('thanh toán nâng cấp: ngày hiệu lực rơi giữa hai lần gọi vẫn tính giá cũ', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        users: [
          ok({
            status: 'active',
            email: 'a@stave.test',
            username: 'a',
            display_name: 'A',
          }),
        ],
        subscription_plans: [ok(planRow())],
        transactions: [ok(null), ok(null), ok(null)],
      },
    });
    const gateway = {
      createCheckout: jest.fn().mockResolvedValue({
        checkoutUrl: 'https://pay.example/1',
        providerRef: 'x',
      }),
    };
    const service = new PaymentsService(
      mock.client,
      gateway as never,
      'http://localhost:3000',
      clockJumpingSubscriptions() as unknown as SubscriptionsService,
      { notify: jest.fn() } as unknown as NotificationsService,
    );

    await service.createCheckout(userId, 'pro', 'upgrade');

    const inserted = mock.builders.transactions.insert.mock.calls[0][0];
    expect(inserted.amount_vnd).toBe(79000);
  });

  it('gia hạn: trước ngày hiệu lực giữ giá khoá, từ ngày hiệu lực lấy giá mới', () => {
    const plan = planRow();
    const sub = { price_locked_vnd: 49000 };
    expect(computeRenewalPrice(plan, sub, T0)).toBe(49000);
    expect(computeRenewalPrice(plan, sub, EFFECTIVE_AT)).toBe(99000);
    expect(computeRenewalPrice(plan, sub, PAST_EFFECTIVE)).toBe(99000);
  });

  it('danh sách gói và gói hiện tại cùng một mốc: sắp xếp và giá hiển thị khớp nhau', () => {
    const cheap = planRow({
      id: 'cheap',
      name: 'CHEAP',
      price_vnd: 90000,
      previous_price_vnd: 120000,
    });
    const other = planRow({
      id: 'other',
      name: 'OTHER',
      price_vnd: 100000,
      previous_price_vnd: 100000,
      price_effective_at: null,
    });

    const before = listVisiblePlans([other, cheap], 'x', T0);
    expect(before.map((p) => [p.id, p.priceVnd])).toEqual([
      ['other', 100000],
      ['cheap', 120000],
    ]);
    const after = listVisiblePlans([other, cheap], 'x', PAST_EFFECTIVE);
    expect(after.map((p) => [p.id, p.priceVnd])).toEqual([
      ['cheap', 90000],
      ['other', 100000],
    ]);
    expect(toSubscriptionPlan(cheap, T0).priceVnd).toBe(
      currentPlanPrice(cheap, T0),
    );
  });
});
