import { createSupabaseMock } from '../test-utils/supabase-mock';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { AdminPlansService } from './admin-plans.service';

const DAY = 24 * 60 * 60 * 1000;
const planId = '55555555-5555-4555-8555-555555555555';
const adminId = '99999999-9999-4999-8999-999999999999';
const now = new Date('2026-11-11T00:00:00.000Z');

function planRow(overrides: Record<string, unknown> = {}) {
  return {
    id: planId,
    name: 'STAVE+',
    description: '',
    price_vnd: 49000,
    features: {},
    is_active: true,
    is_default: false,
    sort_order: 1,
    price_effective_at: null,
    previous_price_vnd: null,
    ...overrides,
  };
}

function build(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const mock = createSupabaseMock([], {
    tables: {
      subscription_plans: [{ data: before }, { data: after }],
      subscriptions: [
        {
          data: [
            {
              user_id: 'u1',
              status: 'active',
              current_period_end: new Date(
                now.getTime() + 5 * DAY,
              ).toISOString(),
            },
          ],
        },
      ],
      admin_audit_log: [{ data: null }],
    },
  });
  const notify = jest.fn().mockResolvedValue(undefined);
  const service = new AdminPlansService(
    mock.client,
    {
      get: jest.fn().mockResolvedValue(7),
    } as unknown as PlatformSettingsService,
    { notify } as unknown as NotificationsService,
  );
  return { service, mock, notify };
}

describe('BE-ABL-05 AdminPlansService.changePrice (đã có một lần đổi giá chờ hiệu lực)', () => {
  it('UTCID06 lần đổi thứ hai: giá gốc lấy theo giá đang áp, thông báo và nhật ký cùng nêu giá mới', async () => {
    const firstEffective = new Date(now.getTime() + 3 * DAY).toISOString();
    const secondEffective = new Date(now.getTime() + 10 * DAY).toISOString();
    const { service, mock, notify } = build(
      planRow({
        price_vnd: 99000,
        previous_price_vnd: 49000,
        price_effective_at: firstEffective,
      }),
      planRow({
        price_vnd: 129000,
        previous_price_vnd: 49000,
        price_effective_at: secondEffective,
      }),
    );

    await service.changePrice(
      adminId,
      planId,
      { priceVnd: 129000, effectiveAt: secondEffective },
      now,
    );

    expect(mock.builders.subscription_plans.update).toHaveBeenCalledWith(
      expect.objectContaining({
        price_vnd: 129000,
        previous_price_vnd: 49000,
      }),
    );
    expect(notify).toHaveBeenCalledWith('u1', 'billing.price_change', {
      planName: 'STAVE+',
      newPrice: 129000,
      effectiveDate: secondEffective,
    });
    const audit = mock.builders.admin_audit_log.insert.mock.calls[0][0];
    expect(audit.reason).toContain('129.000');
    expect(audit.reason).toContain('49.000');
    expect(audit.reason).not.toContain('99.000');
  });

  it('UTCID07 hai lần đổi liên tiếp: lần hai sau khi lần một đã hiệu lực lấy giá của lần một làm giá gốc', async () => {
    const firstEffective = new Date(now.getTime() - DAY).toISOString();
    const secondEffective = new Date(now.getTime() + 8 * DAY).toISOString();
    const { service, mock } = build(
      planRow({
        price_vnd: 99000,
        previous_price_vnd: 49000,
        price_effective_at: firstEffective,
      }),
      planRow({
        price_vnd: 129000,
        previous_price_vnd: 99000,
        price_effective_at: secondEffective,
      }),
    );

    await service.changePrice(
      adminId,
      planId,
      { priceVnd: 129000, effectiveAt: secondEffective },
      now,
    );

    expect(mock.builders.subscription_plans.update).toHaveBeenCalledWith(
      expect.objectContaining({ previous_price_vnd: 99000 }),
    );
  });
});
