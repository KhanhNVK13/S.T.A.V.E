import { AiRateLimiter } from './ai-rate-limiter';

describe('BE-AIX-01 AiRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-11-02')));
  afterEach(() => jest.useRealTimers());

  it('UTCID01 allows up to the limit then rejects', () => {
    const limiter = new AiRateLimiter();
    const results = Array.from({ length: 4 }, () =>
      limiter.tryConsume('u1', { limit: 3, windowMs: 1000 }),
    );
    expect(results).toEqual([true, true, true, false]);
  });

  it('UTCID02 does not extend the lockout with rejected attempts', () => {
    const limiter = new AiRateLimiter();
    const cfg = { limit: 1, windowMs: 1000 };
    expect(limiter.tryConsume('u1', cfg)).toBe(true);
    jest.advanceTimersByTime(900);
    expect(limiter.tryConsume('u1', cfg)).toBe(false);
    jest.advanceTimersByTime(150);
    expect(limiter.tryConsume('u1', cfg)).toBe(true);
  });

  it('UTCID03 tracks users independently', () => {
    const limiter = new AiRateLimiter();
    const cfg = { limit: 1, windowMs: 1000 };
    expect(limiter.tryConsume('u1', cfg)).toBe(true);
    expect(limiter.tryConsume('u2', cfg)).toBe(true);
  });
});
