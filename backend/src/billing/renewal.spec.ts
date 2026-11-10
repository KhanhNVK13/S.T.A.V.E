import {
  addOneMonth,
  computeNewPeriodEnd,
  computeRenewalPrice,
  currentReminderMilestone,
} from './renewal';

const iso = (value: string) => new Date(value);

describe('BE-BIL-35 computeRenewalPrice', () => {
  const now = iso('2026-11-06T00:00:00.000Z');

  it('UTCID01 uses the locked price before the new price takes effect', () => {
    expect(
      computeRenewalPrice(
        { price_vnd: 99000, price_effective_at: '2026-12-01T00:00:00.000Z' },
        { price_locked_vnd: 49000 },
        now,
      ),
    ).toBe(49000);
  });

  it('UTCID02 uses the new price once it has taken effect', () => {
    expect(
      computeRenewalPrice(
        { price_vnd: 99000, price_effective_at: '2026-11-01T00:00:00.000Z' },
        { price_locked_vnd: 49000 },
        now,
      ),
    ).toBe(99000);
  });

  it('UTCID03 uses the new price when there is no effective date', () => {
    expect(
      computeRenewalPrice(
        { price_vnd: 99000, price_effective_at: null },
        { price_locked_vnd: 49000 },
        now,
      ),
    ).toBe(99000);
  });

  it('UTCID04 keeps the locked price when the price goes up before the switch date', () => {
    expect(
      computeRenewalPrice(
        { price_vnd: 99000, price_effective_at: '2026-12-01T00:00:00.000Z' },
        { price_locked_vnd: 49000 },
        now,
      ),
    ).toBe(49000);
  });

  it('UTCID05 applies the new price when the price goes down after the switch date', () => {
    expect(
      computeRenewalPrice(
        { price_vnd: 39000, price_effective_at: '2026-11-01T00:00:00.000Z' },
        { price_locked_vnd: 49000 },
        now,
      ),
    ).toBe(39000);
  });

  it('UTCID06 treats the effective date itself as already in force', () => {
    expect(
      computeRenewalPrice(
        { price_vnd: 99000, price_effective_at: '2026-11-06T00:00:00.000Z' },
        { price_locked_vnd: 49000 },
        now,
      ),
    ).toBe(99000);
  });
});

describe('BE-BIL-36 computeNewPeriodEnd', () => {
  it('UTCID01 extends from the current period end when renewing early', () => {
    const result = computeNewPeriodEnd(
      '2026-12-06T10:00:00.000Z',
      iso('2026-11-06T00:00:00.000Z'),
    );
    expect(result.toISOString()).toBe('2027-01-06T10:00:00.000Z');
  });

  it('UTCID02 extends from now when renewing during the grace period', () => {
    const result = computeNewPeriodEnd(
      '2026-11-01T10:00:00.000Z',
      iso('2026-11-06T00:00:00.000Z'),
    );
    expect(result.toISOString()).toBe('2026-12-06T00:00:00.000Z');
  });

  it('UTCID03 clamps the 31st of January to the end of February', () => {
    const result = computeNewPeriodEnd(
      '2026-01-31T00:00:00.000Z',
      iso('2026-01-10T00:00:00.000Z'),
    );
    expect(result.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  it('UTCID04 clamps the 31st of March to the 30th of April', () => {
    const result = computeNewPeriodEnd(
      '2026-03-31T00:00:00.000Z',
      iso('2026-03-10T00:00:00.000Z'),
    );
    expect(result.toISOString()).toBe('2026-04-30T00:00:00.000Z');
  });

  it('UTCID05 keeps the day when the target month is long enough', () => {
    const result = computeNewPeriodEnd(
      '2026-01-30T00:00:00.000Z',
      iso('2026-01-10T00:00:00.000Z'),
    );
    expect(result.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  it('UTCID06 handles a leap year February', () => {
    expect(addOneMonth(iso('2028-01-31T00:00:00.000Z')).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
  });
});

describe('BE-BIL-37 currentReminderMilestone', () => {
  const periodEnd = '2026-11-10T00:00:00.000Z';
  const graceUntil = '2026-11-13T00:00:00.000Z';

  it('UTCID01 returns null before the three-day lead window', () => {
    expect(
      currentReminderMilestone(
        { current_period_end: periodEnd, grace_until: null },
        iso('2026-11-06T23:59:59.000Z'),
      ),
    ).toBeNull();
  });

  it('UTCID02 returns the three-day milestone once it is reached', () => {
    const milestone = currentReminderMilestone(
      { current_period_end: periodEnd, grace_until: null },
      iso('2026-11-07T00:00:00.000Z'),
    );
    expect(milestone?.toISOString()).toBe('2026-11-07T00:00:00.000Z');
  });

  it('UTCID03 returns the period end on the expiry day', () => {
    const milestone = currentReminderMilestone(
      { current_period_end: periodEnd, grace_until },
      iso('2026-11-10T12:00:00.000Z'),
    );
    expect(milestone?.toISOString()).toBe(periodEnd);
  });

  it('UTCID04 returns one milestone per grace day', () => {
    const first = currentReminderMilestone(
      { current_period_end: periodEnd, grace_until },
      iso('2026-11-11T09:00:00.000Z'),
    );
    const second = currentReminderMilestone(
      { current_period_end: periodEnd, grace_until },
      iso('2026-11-12T09:00:00.000Z'),
    );
    const third = currentReminderMilestone(
      { current_period_end: periodEnd, grace_until },
      iso('2026-11-13T09:00:00.000Z'),
    );
    expect(first?.toISOString()).toBe('2026-11-11T00:00:00.000Z');
    expect(second?.toISOString()).toBe('2026-11-12T00:00:00.000Z');
    expect(third?.toISOString()).toBe('2026-11-13T00:00:00.000Z');
  });

  it('UTCID05 returns null once the grace period has passed', () => {
    expect(
      currentReminderMilestone(
        { current_period_end: periodEnd, grace_until },
        iso('2026-11-14T00:00:00.000Z'),
      ),
    ).toBeNull();
  });

  it('UTCID06 returns null when the grace period was never opened', () => {
    expect(
      currentReminderMilestone(
        { current_period_end: periodEnd, grace_until: null },
        iso('2026-11-11T00:00:00.000Z'),
      ),
    ).toBeNull();
  });
});
