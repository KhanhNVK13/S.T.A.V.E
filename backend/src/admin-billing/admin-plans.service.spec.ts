import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { AdminPlansService } from './admin-plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanPriceDto } from './dto/update-plan-price.dto';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-11T00:00:00.000Z');
const ADMIN = '99999999-9999-4999-8999-999999999999';
const PLAN = '55555555-5555-4555-8555-555555555555';
const FREE = '66666666-6666-4666-8666-666666666666';

function planRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN,
    name: 'STAVE+',
    description: '',
    price_vnd: 49000,
    features: { theme_from_image: true },
    is_active: true,
    is_default: false,
    sort_order: 100,
    price_effective_at: null,
    previous_price_vnd: null,
    ...overrides,
  };
}

const freeRow = (features: Record<string, unknown> = {}) =>
  planRow({
    id: FREE,
    name: 'Free',
    price_vnd: 0,
    features,
    is_default: true,
    sort_order: 0,
  });

const ok = (data: unknown): QueryResult => ({ data, error: null });
const fail = (code = 'XX000'): QueryResult => ({
  data: null,
  error: { code, message: 'db error' },
});

function make(tables: Record<string, QueryResult[]>, noticeDays = 7) {
  const mock = createSupabaseMock([], { tables });
  const notify = jest.fn().mockResolvedValue(undefined);
  const settings = {
    get: jest.fn().mockResolvedValue(noticeDays),
  } as unknown as PlatformSettingsService;
  const service = new AdminPlansService(mock.client, settings, {
    notify,
  } as unknown as NotificationsService);
  return { service, notify, ...mock };
}

describe('BE-ABL-03 AdminPlansService.listPlans', () => {
  it('UTCID01 lists every plan with its count of subscribers still in effect', async () => {
    const { service } = make({
      subscription_plans: [
        ok([planRow(), planRow({ id: 'p2', name: 'Draft', is_active: false })]),
      ],
      subscriptions: [
        ok([
          {
            user_id: 'u1',
            status: 'active',
            current_period_end: new Date(NOW.getTime() + DAY).toISOString(),
            plan_id: PLAN,
          },
          {
            user_id: 'u2',
            status: 'canceled',
            current_period_end: new Date(NOW.getTime() + DAY).toISOString(),
            plan_id: PLAN,
          },
          {
            user_id: 'u3',
            status: 'canceled',
            current_period_end: new Date(NOW.getTime() - DAY).toISOString(),
            plan_id: PLAN,
          },
        ]),
      ],
    });

    const plans = await service.listPlans(NOW);

    expect(plans.map((p) => p.name)).toEqual(['STAVE+', 'Draft']);
    expect(plans[0].subscriberCount).toBe(2);
    expect(plans[1].subscriberCount).toBe(0);
    expect(plans[1].isActive).toBe(false);
  });

  it('UTCID02 throws 500 when the plans cannot be read', async () => {
    const { service } = make({
      subscription_plans: [fail()],
      subscriptions: [ok([])],
    });
    await expect(service.listPlans(NOW)).rejects.toThrow(
      new InternalServerErrorException('Could not read subscription plans'),
    );
  });

  it('UTCID03 throws 500 when the subscribers cannot be counted', async () => {
    const { service } = make({
      subscription_plans: [ok([planRow()])],
      subscriptions: [fail()],
    });
    await expect(service.listPlans(NOW)).rejects.toThrow(
      new InternalServerErrorException('Could not count plan subscribers'),
    );
  });
});

describe('BE-ABL-04 AdminPlansService.createPlan', () => {
  const dto = (over: Partial<CreatePlanDto> = {}): CreatePlanDto => ({
    name: '  Studio  ',
    priceVnd: 99000,
    features: { theme_from_image: true, extra_storage_mb: 2048 },
    ...over,
  });

  it('UTCID01 creates an active non-default plan with a trimmed name, leaves subscribers alone and records the action', async () => {
    const { service, builders } = make({
      subscription_plans: [
        ok(freeRow()),
        ok(planRow({ name: 'Studio', price_vnd: 99000 })),
      ],
      admin_audit_log: [{ error: null }],
    });

    const result = await service.createPlan(ADMIN, dto());

    expect(result.plan.name).toBe('Studio');
    expect(result.warnings).toEqual([]);
    expect(builders.subscription_plans.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Studio',
        price_vnd: 99000,
        is_active: true,
        is_default: false,
      }),
    );
    expect(builders.subscriptions).toBeUndefined();
    expect(builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: ADMIN,
        action: 'plan.create',
        target_type: 'subscription_plan',
      }),
    );
  });

  it('UTCID02 saves the plan as inactive when it is created as a draft', async () => {
    const { service, builders } = make({
      subscription_plans: [ok(freeRow()), ok(planRow({ is_active: false }))],
      admin_audit_log: [{ error: null }],
    });

    const result = await service.createPlan(ADMIN, dto({ status: 'draft' }));

    expect(result.plan.isActive).toBe(false);
    expect(builders.subscription_plans.insert).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false }),
    );
  });

  it('UTCID03 refuses an empty name and creates nothing', async () => {
    const { service, builders } = make({});
    await expect(
      service.createPlan(ADMIN, dto({ name: '   ' })),
    ).rejects.toThrow(BadRequestException);
    expect(builders.subscription_plans).toBeUndefined();
  });

  it('UTCID04 answers 409 when the name is already used', async () => {
    const { service, builders } = make({
      subscription_plans: [ok(freeRow()), fail('23505')],
    });
    await expect(service.createPlan(ADMIN, dto())).rejects.toThrow(
      new ConflictException('Plan name already exists'),
    );
    expect(builders.admin_audit_log).toBeUndefined();
  });

  it('UTCID05 reports a server error and records nothing', async () => {
    const { service, builders } = make({
      subscription_plans: [ok(freeRow()), fail()],
    });
    await expect(service.createPlan(ADMIN, dto())).rejects.toThrow(
      new InternalServerErrorException('Could not create subscription plan'),
    );
    expect(builders.admin_audit_log).toBeUndefined();
  });

  it('UTCID06 refuses a feature that is not in the catalogue', async () => {
    const { service } = make({});
    await expect(
      service.createPlan(ADMIN, dto({ features: { unlimited_ai: true } })),
    ).rejects.toThrow(BadRequestException);
  });

  it('UTCID07 allows a feature the free plan already has but warns about it', async () => {
    const { service } = make({
      subscription_plans: [
        ok(freeRow({ theme_from_image: true })),
        ok(planRow()),
      ],
      admin_audit_log: [{ error: null }],
    });

    const result = await service.createPlan(ADMIN, dto());

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Theme tạo từ ảnh');
  });

  it('UTCID08 refuses a storage amount outside 0 to 102400 MB', async () => {
    const { service } = make({});
    await expect(
      service.createPlan(
        ADMIN,
        dto({ features: { extra_storage_mb: 102401 } }),
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createPlan(ADMIN, dto({ features: { extra_storage_mb: -1 } })),
    ).rejects.toThrow(BadRequestException);
  });

  it('UTCID09 refuses a feature flag that is not a boolean', async () => {
    const { service } = make({});
    await expect(
      service.createPlan(ADMIN, dto({ features: { theme_from_image: 'yes' } })),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('BE-ABL-05 AdminPlansService.changePrice (additional cases)', () => {
  const effective = new Date(NOW.getTime() + 7 * DAY).toISOString();

  it('UTCID08 answers 404 for an unknown plan', async () => {
    const { service } = make({ subscription_plans: [ok(null)] });
    await expect(
      service.changePrice(
        ADMIN,
        PLAN,
        { priceVnd: 99000, effectiveAt: effective },
        NOW,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('UTCID09 keeps the existing price, sends no notice and records nothing when the update fails', async () => {
    const { service, notify, builders } = make({
      subscription_plans: [ok(planRow()), fail()],
    });
    await expect(
      service.changePrice(
        ADMIN,
        PLAN,
        { priceVnd: 99000, effectiveAt: effective },
        NOW,
      ),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not update plan price'),
    );
    expect(notify).not.toHaveBeenCalled();
    expect(builders.admin_audit_log).toBeUndefined();
  });

  it('UTCID10 treats a lower price like any other change and remembers the old price', async () => {
    const { service, builders } = make({
      subscription_plans: [
        ok(planRow()),
        ok(
          planRow({
            price_vnd: 29000,
            previous_price_vnd: 49000,
            price_effective_at: effective,
          }),
        ),
      ],
      subscriptions: [ok([])],
      admin_audit_log: [{ error: null }],
    });

    const result = await service.changePrice(
      ADMIN,
      PLAN,
      { priceVnd: 29000, effectiveAt: effective },
      NOW,
    );

    expect(result.priceVnd).toBe(29000);
    expect(builders.subscription_plans.update).toHaveBeenCalledWith({
      price_vnd: 29000,
      previous_price_vnd: 49000,
      price_effective_at: effective,
    });
  });

  it('UTCID11 rejects an effective date that is not a valid date', async () => {
    const { service, builders } = make({ subscription_plans: [ok(planRow())] });
    await expect(
      service.changePrice(
        ADMIN,
        PLAN,
        { priceVnd: 99000, effectiveAt: 'not-a-date' },
        NOW,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(builders.subscription_plans.update).not.toHaveBeenCalled();
  });

  it('UTCID12 records the previous and new price in the audit log', async () => {
    const { service, builders } = make({
      subscription_plans: [
        ok(planRow()),
        ok(
          planRow({
            price_vnd: 99000,
            previous_price_vnd: 49000,
            price_effective_at: effective,
          }),
        ),
      ],
      subscriptions: [ok([])],
      admin_audit_log: [{ error: null }],
    });

    await service.changePrice(
      ADMIN,
      PLAN,
      { priceVnd: 99000, effectiveAt: effective },
      NOW,
    );

    expect(builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: ADMIN,
        action: 'plan.price_change',
        target_id: PLAN,
      }),
    );
  });
});

describe('BE-ABL-06 AdminPlansService.setActive', () => {
  it('UTCID01 deactivates a plan, leaves subscribers untouched and records the action', async () => {
    const { service, builders } = make({
      subscription_plans: [ok(planRow()), ok(planRow({ is_active: false }))],
      admin_audit_log: [{ error: null }],
    });

    const result = await service.setActive(ADMIN, PLAN, false);

    expect(result.isActive).toBe(false);
    expect(builders.subscription_plans.update).toHaveBeenCalledWith({
      is_active: false,
    });
    expect(builders.subscriptions).toBeUndefined();
    expect(builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'plan.deactivate', target_id: PLAN }),
    );
  });

  it('UTCID02 refuses to deactivate the free default plan', async () => {
    const { service, builders } = make({ subscription_plans: [ok(freeRow())] });
    await expect(service.setActive(ADMIN, FREE, false)).rejects.toThrow(
      new BadRequestException('Default plan cannot be deactivated'),
    );
    expect(builders.subscription_plans.update).not.toHaveBeenCalled();
  });

  it('UTCID03 puts a deactivated plan back on sale and records the action', async () => {
    const { service, builders } = make({
      subscription_plans: [ok(planRow({ is_active: false })), ok(planRow())],
      admin_audit_log: [{ error: null }],
    });

    const result = await service.setActive(ADMIN, PLAN, true);

    expect(result.isActive).toBe(true);
    expect(builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'plan.activate' }),
    );
  });

  it('UTCID04 answers 404 for an unknown plan', async () => {
    const { service } = make({ subscription_plans: [ok(null)] });
    await expect(service.setActive(ADMIN, PLAN, false)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('UTCID05 reports a failure and leaves the plan on sale without recording anything', async () => {
    const { service, builders } = make({
      subscription_plans: [ok(planRow()), fail()],
    });
    await expect(service.setActive(ADMIN, PLAN, false)).rejects.toThrow(
      new InternalServerErrorException('Could not update plan status'),
    );
    expect(builders.admin_audit_log).toBeUndefined();
  });
});

describe('BE-ABL-10 plan request validation (CreatePlanDto, UpdatePlanPriceDto)', () => {
  const errors = (cls: new () => object, body: object) =>
    validate(plainToInstance(cls, body));

  const valid = { name: 'Studio', priceVnd: 99000, features: {} };

  it('UTCID01 accepts a valid new plan', async () => {
    await expect(errors(CreatePlanDto, valid)).resolves.toHaveLength(0);
  });

  it('UTCID02 rejects an empty plan name', async () => {
    await expect(
      errors(CreatePlanDto, { ...valid, name: '' }),
    ).resolves.not.toHaveLength(0);
  });

  it('UTCID03 rejects a plan name longer than 60 characters', async () => {
    await expect(
      errors(CreatePlanDto, { ...valid, name: 'x'.repeat(61) }),
    ).resolves.not.toHaveLength(0);
  });

  it('UTCID04 rejects a negative or non-integer price', async () => {
    await expect(
      errors(CreatePlanDto, { ...valid, priceVnd: -1 }),
    ).resolves.not.toHaveLength(0);
    await expect(
      errors(CreatePlanDto, { ...valid, priceVnd: 1.5 }),
    ).resolves.not.toHaveLength(0);
  });

  it('UTCID05 rejects a creation status other than draft or active', async () => {
    await expect(
      errors(CreatePlanDto, { ...valid, status: 'archived' }),
    ).resolves.not.toHaveLength(0);
    await expect(
      errors(CreatePlanDto, { ...valid, status: 'draft' }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID06 accepts a price change with an amount and an ISO date', async () => {
    await expect(
      errors(UpdatePlanPriceDto, {
        priceVnd: 59000,
        effectiveAt: '2026-12-01T00:00:00.000Z',
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID07 rejects a negative price or a date that is not ISO in a price change', async () => {
    await expect(
      errors(UpdatePlanPriceDto, {
        priceVnd: -5,
        effectiveAt: '2026-12-01T00:00:00.000Z',
      }),
    ).resolves.not.toHaveLength(0);
    await expect(
      errors(UpdatePlanPriceDto, { priceVnd: 5000, effectiveAt: 'tomorrow' }),
    ).resolves.not.toHaveLength(0);
  });
});
