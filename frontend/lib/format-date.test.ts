import { describe, expect, it } from 'vitest';
import { formatDate } from '@/lib/format-date';

describe('Vitest runner smoke test', () => {
  it('runs in a jsdom environment', () => {
    expect(typeof document).toBe('object');
  });

  it('resolves the "@" alias to the frontend root', () => {
    expect(formatDate('2026-01-15T00:00:00Z')).toBe('15/01/2026');
  });

  it('computes dates in UTC+7 (Asia/Ho_Chi_Minh)', () => {
    // 2026-01-01T18:30Z is 02/01/2026 01:30 in UTC+7 but still 01/01 in UTC.
    expect(formatDate('2026-01-01T18:30:00Z')).toBe('02/01/2026');
  });
});
