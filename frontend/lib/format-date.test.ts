import { beforeEach, describe, expect, it } from 'vitest';
import { formatDate, formatMonthYear } from './format-date';
import { setLang } from './i18n';

beforeEach(() => setLang('vi'));

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
