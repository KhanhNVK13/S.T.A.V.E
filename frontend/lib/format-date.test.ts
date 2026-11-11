import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate, formatDateTime, formatMonthYear, formatRelativeTime } from './format-date';
import { setLang } from './i18n';

beforeEach(() => setLang('vi'));

afterEach(() => {
  vi.useRealTimers();
});

describe('Vitest runner smoke test', () => {
  it('runs in a jsdom environment', () => {
    expect(typeof document).toBe('object');
  });

  it('computes dates in UTC+7 (Asia/Ho_Chi_Minh)', () => {
    expect(formatDate('2026-01-01T18:30:00Z')).toBe('02/01/2026');
  });
});

// =============================================================================
// FE-LIB-15 — format-date.formatMonthYear(dateStr)
// =============================================================================

describe('FE-LIB-15 formatMonthYear(dateStr)', () => {
  it('UTCID01 (A) null returns an empty string', () => {
    expect(formatMonthYear(null)).toBe('');
  });

  it('UTCID02 (A) an empty string returns an empty string', () => {
    expect(formatMonthYear('')).toBe('');
  });

  it('UTCID03 (A) an invalid date string returns an empty string', () => {
    expect(formatMonthYear('2026-13-45')).toBe('');
  });

  it('UTCID04 (N) "2026-03-15T00:00:00Z" returns "tháng 3 năm 2026"', () => {
    expect(formatMonthYear('2026-03-15T00:00:00Z')).toBe('tháng 3 năm 2026');
  });
});

// =============================================================================
// FE-LIB-16 — format-date.formatDate(dateStr)
// =============================================================================

describe('FE-LIB-16 formatDate(dateStr)', () => {
  it('UTCID01 (A) undefined returns an empty string', () => {
    expect(formatDate(undefined)).toBe('');
  });

  it('UTCID02 (A) an empty string returns an empty string', () => {
    expect(formatDate('')).toBe('');
  });

  it('UTCID03 (A) "abc" returns an empty string', () => {
    expect(formatDate('abc')).toBe('');
  });

  it('UTCID04 (N) "2026-01-05" returns "05/01/2026"', () => {
    expect(formatDate('2026-01-05')).toBe('05/01/2026');
  });

  it('UTCID05 (B) "2026-12-31T10:00:00Z" returns "31/12/2026"', () => {
    expect(formatDate('2026-12-31T10:00:00Z')).toBe('31/12/2026');
  });

  it('UTCID06 (B) "2026-12-31T17:00:00Z" returns "01/01/2027" (local day rolls over)', () => {
    expect(formatDate('2026-12-31T17:00:00Z')).toBe('01/01/2027');
  });
});

// =============================================================================
// FE-LIB-14 — format-date.formatRelativeTime(dateStr)
// Sheet precondition: Date.now = 2026-10-08T12:00:00Z, TZ = Asia/Ho_Chi_Minh
// =============================================================================

describe('FE-LIB-14 formatRelativeTime(dateStr)', () => {
  const NOW = '2026-10-08T12:00:00Z';

  const at = (offsetMs: number) => new Date(Date.parse(NOW) + offsetMs).toISOString();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  it('UTCID01 (A) null returns an empty string', () => {
    expect(formatRelativeTime(null)).toBe('');
  });

  it('UTCID02 (A) an empty string returns an empty string', () => {
    expect(formatRelativeTime('')).toBe('');
  });

  it('UTCID03 (A) an unparsable date string returns an empty string', () => {
    expect(formatRelativeTime('not-a-date')).toBe('');
  });

  it('UTCID04 (B) 30 seconds ago returns "vừa xong"', () => {
    expect(formatRelativeTime(at(-30_000))).toBe('vừa xong');
  });

  it('UTCID05 (B) 59 seconds ago returns "vừa xong"', () => {
    expect(formatRelativeTime(at(-59_000))).toBe('vừa xong');
  });

  it('UTCID06 (B) exactly 60 seconds ago returns "1 phút trước"', () => {
    expect(formatRelativeTime(at(-60_000))).toBe('1 phút trước');
  });

  it('UTCID07 (B) 59 minutes ago returns "59 phút trước"', () => {
    expect(formatRelativeTime(at(-59 * 60_000))).toBe('59 phút trước');
  });

  it('UTCID08 (B) exactly 60 minutes ago returns "1 giờ trước"', () => {
    expect(formatRelativeTime(at(-60 * 60_000))).toBe('1 giờ trước');
  });

  it('UTCID09 (B) 23 h 59 min ago returns "23 giờ trước"', () => {
    expect(formatRelativeTime(at(-(23 * 60 + 59) * 60_000))).toBe('23 giờ trước');
  });

  it('UTCID10 (B) exactly 24 hours ago returns "1 ngày trước"', () => {
    expect(formatRelativeTime(at(-24 * 60 * 60_000))).toBe('1 ngày trước');
  });

  it('UTCID11 (B) 6 days ago returns "6 ngày trước"', () => {
    expect(formatRelativeTime(at(-6 * 24 * 60 * 60_000))).toBe('6 ngày trước');
  });

  it('UTCID12 (B) exactly 7 days ago returns "1 tuần trước"', () => {
    expect(formatRelativeTime(at(-7 * 24 * 60 * 60_000))).toBe('1 tuần trước');
  });

  it('UTCID13 (B) 29 days ago returns "4 tuần trước"', () => {
    expect(formatRelativeTime(at(-29 * 24 * 60 * 60_000))).toBe('4 tuần trước');
  });

  it('UTCID14 (B) 30 days ago falls back to the local date "08/09/2026"', () => {
    expect(formatRelativeTime(at(-30 * 24 * 60 * 60_000))).toBe('08/09/2026');
  });

  it('UTCID15 (A) a timestamp one hour in the future returns "vừa xong"', () => {
    expect(formatRelativeTime(at(60 * 60_000))).toBe('vừa xong');
  });
});

describe('formatDate and formatDateTime follow the selected language', () => {
  it('shows dd/MM/yyyy in Vietnamese', () => {
    expect(formatDate('2026-12-06T10:00:00Z')).toBe('06/12/2026');
    expect(formatDateTime('2026-12-06T10:00:00Z')).toContain('06/12/2026');
  });

  it('shows an unambiguous month name in English', () => {
    setLang('en');
    expect(formatDate('2026-12-06T10:00:00Z')).toBe('Dec 6, 2026');
    expect(formatDateTime('2026-12-06T10:00:00Z')).toContain('Dec 6, 2026');
  });

  it('returns an empty string for invalid input in both languages', () => {
    expect(formatDateTime('abc')).toBe('');
    setLang('en');
    expect(formatDate('abc')).toBe('');
    expect(formatDateTime(null)).toBe('');
  });
});
