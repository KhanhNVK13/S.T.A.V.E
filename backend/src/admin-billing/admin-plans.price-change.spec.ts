import { BadRequestException } from '@nestjs/common';
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

function setup(noticeDays: number | undefined, notify = jest.fn()) {
  const updated = (effectiveAt: string) =>
    planRow({
      price_vnd: 99000,
      previous_price_vnd: 49000,
      price_effective_at: effectiveAt,
    });
  const mock = createSupabaseMock([], {
    tables: {
      subscription_plans: [
        { data: planRow() },
        { data: updated(new Date(now.getTime() + 7 * DAY).toISOString()) },
      ],
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
            {
              user_id: 'u2',
              status: 'canceled',
              current_period_end: new Date(now.getTime() - DAY).toISOString(),
            },
            {
              user_id: 'u3',
              status: 'canceled',
              current_period_end: new Date(now.getTime() + DAY).toISOString(),
            },
          ],
        },
      ],
      admin_audit_log: [{ error: null }],
    },
  });
  const get = jest.fn().mockResolvedValue(noticeDays);
  const settings = { get } as unknown as PlatformSettingsService;
  const service = new AdminPlansService(mock.client, settings, {
    notify,
  } as unknown as NotificationsService);
  return { service, notify, get, ...mock };
}

describe('BE-PLN-01 changePrice with notice days', () => {
  it('UTCID01 notifies active subscribers with the effective date and stores the old price', async () => {
    const { service, notify, get, builders } = setup(7);
    const effectiveAt = new Date(now.getTime() + 7 * DAY).toISOString();
    await service.changePrice(
      adminId,
      planId,
      { priceVnd: 99000, effectiveAt },
      now,
    );
    expect(get).toHaveBeenCalledWith('price_change_notice_days', 7);
    expect(builders.subscription_plans.update).toHaveBeenCalledWith({
      price_vnd: 99000,
      previous_price_vnd: 49000,
      price_effective_at: effectiveAt,
    });
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith('u1', 'billing.price_change', {
      planName: 'STAVE+',
      newPrice: 99000,
      effectiveDate: effectiveAt,
    });
    expect(notify).toHaveBeenCalledWith('u3', 'billing.price_change', {
      planName: 'STAVE+',
      newPrice: 99000,
      effectiveDate: effectiveAt,
    });
  });

  it('UTCID02 rejects an effective date earlier than now plus the notice days', async () => {
    const { service, notify, builders } = setup(7);
    await expect(
      service.changePrice(
        adminId,
        planId,
        {
          priceVnd: 99000,
          effectiveAt: new Date(now.getTime() + 6 * DAY).toISOString(),
        },
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(builders.subscription_plans.update).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('UTCID03 with zero notice days the price may take effect immediately', async () => {
    const { service, notify } = setup(0);
    await service.changePrice(
      adminId,
      planId,
      { priceVnd: 99000, effectiveAt: now.toISOString() },
      now,
    );
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('UTCID04 a pending earlier change keeps the price still in force as previous', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        subscription_plans: [
          {
            data: planRow({
              price_vnd: 79000,
              previous_price_vnd: 49000,
              price_effective_at: new Date(
                now.getTime() + 3 * DAY,
              ).toISOString(),
            }),
          },
          { data: planRow({ price_vnd: 99000, previous_price_vnd: 49000 }) },
        ],
        subscriptions: [{ data: [] }],
        admin_audit_log: [{ error: null }],
      },
    });
    const service = new AdminPlansService(
      mock.client,
      {
        get: jest.fn().mockResolvedValue(1),
      } as unknown as PlatformSettingsService,
      { notify: jest.fn() } as unknown as NotificationsService,
    );
    await service.changePrice(
      adminId,
      planId,
      {
        priceVnd: 99000,
        effectiveAt: new Date(now.getTime() + 2 * DAY).toISOString(),
      },
      now,
    );
    expect(mock.builders.subscription_plans.update).toHaveBeenCalledWith(
      expect.objectContaining({ previous_price_vnd: 49000 }),
    );
  });

  it('UTCID05 a failing notification does not break the price change', async () => {
    const notify = jest.fn().mockRejectedValue(new Error('boom'));
    const { service } = setup(7, notify);
    const effectiveAt = new Date(now.getTime() + 7 * DAY).toISOString();
    await expect(
      service.changePrice(
        adminId,
        planId,
        { priceVnd: 99000, effectiveAt },
        now,
      ),
    ).resolves.toMatchObject({ priceVnd: 99000 });
  });
});
