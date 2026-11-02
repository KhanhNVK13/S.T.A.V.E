import { Injectable } from '@nestjs/common';

export interface AiRateLimit {
  /** Maximum calls allowed within the window. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
}

/**
 * UC-70/71: per-user in-memory rate limiter to protect the Gemini quota
 * (AI rule 6). Callers check `tryConsume(userId)` right before invoking the
 * model; `false` means the caller should return the non-AI fallback.
 *
 * In-memory by design: a process restart clears the counters, which is
 * acceptable for a rate-limit guard (it is a backstop, not an entitlement).
 */
@Injectable()
export class AiRateLimiter {
  private static readonly DEFAULTS: AiRateLimit = {
    limit: 10,
    windowMs: 60_000,
  };

  private readonly calls = new Map<string, number[]>();

  /**
   * Record a call for `userId` and return whether it is within the limit.
   * `config` lets callers override the limit/window per feature.
   */
  tryConsume(userId: string, config: Partial<AiRateLimit> = {}): boolean {
    const { limit, windowMs } = { ...AiRateLimiter.DEFAULTS, ...config };
    const now = Date.now();
    const bucket = (this.calls.get(userId) ?? []).filter(
      (ts) => now - ts < windowMs,
    );
    if (bucket.length >= limit) {
      this.calls.set(userId, bucket);
      return false;
    }
    bucket.push(now);
    this.calls.set(userId, bucket);
    return true;
  }

  /** Drop a user's counters (e.g. on logout). */
  clear(userId: string): void {
    this.calls.delete(userId);
  }
}
