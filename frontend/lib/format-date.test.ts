import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  formatRelativeTime,
  formatMonthYear,
  formatDate,
} from './format-date';

// ============================================================================
// SHEET: FE-LIB-14 (formatRelativeTime)
// ============================================================================
describe('FE-LIB-14 formatRelativeTime', () => {
  const FIXED_NOW = new Date('2026-10-08T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('UTCID01 returns empty string for null input', () => {
    expect(formatRelativeTime(null)).toBe('');
  });

  it('UTCID02 returns empty string for empty string input', () => {
    expect(formatRelativeTime('')).toBe('');
  });

  it('UTCID03 returns empty string for invalid date string', () => {
    expect(formatRelativeTime('not-a-date')).toBe('');
  });

  it('UTCID04 returns "vừa xong" for 30 seconds ago', () => {
    const d = new Date(FIXED_NOW - 30 * 1000).toISOString();
    expect(formatRelativeTime(d)).toBe('vừa xong');
  });

  it('UTCID05 returns "vừa xong" for 59 seconds ago', () => {
    const d = new Date(FIXED_NOW - 59 * 1000).toISOString();
    expect(formatRelativeTime(d)).toBe('vừa xong');
  });

  it('UTCID06 returns "1 phút trước" for 60 seconds ago', () => {
    const d = new Date(FIXED_NOW - 60 * 1000).toISOString();
    expect(formatRelativeTime(d)).toBe('1 phút trước');
  });

  it('UTCID07 returns "59 phút trước" for 59 minutes ago', () => {
    const d = new Date(FIXED_NOW - 59 * 60 * 1000).toISOString();
    expect(formatRelativeTime(d)).toBe('59 phút trước');
  });

  it('UTCID08 returns "1 giờ trước" for 60 minutes ago', () => {
    const d = new Date(FIXED_NOW - 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(d)).toBe('1 giờ trước');
  });

  it('UTCID09 returns "23 giờ trước" for 23 hours 59 minutes ago', () => {
    const d = new Date(FIXED_NOW - (23 * 60 + 59) * 60 * 1000).toISOString();
    expect(formatRelativeTime(d)).toBe('23 giờ trước');
  });

  it('UTCID10 returns "1 ngày trước" for 24 hours ago', () => {
    const d = new Date(FIXED_NOW - 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(d)).toBe('1 ngày trước');
  });

  it('UTCID11 returns "6 ngày trước" for 6 days ago', () => {
    const d = new Date(FIXED_NOW - 6 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(d)).toBe('6 ngày trước');
  });

  it('UTCID12 returns "1 tuần trước" for 7 days ago', () => {
    const d = new Date(FIXED_NOW - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(d)).toBe('1 tuần trước');
  });

  it('UTCID13 returns "4 tuần trước" for 29 days ago', () => {
    const d = new Date(FIXED_NOW - 29 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(d)).toBe('4 tuần trước');
  });

  it('UTCID14 returns formatted date "08/09/2026" for 30 days ago', () => {
    const d = new Date(FIXED_NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(d)).toBe('08/09/2026');
  });

  it('UTCID15 returns "vừa xong" for future date (now + 1 hour)', () => {
    const d = new Date(FIXED_NOW + 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(d)).toBe('vừa xong');
  });
});

// ============================================================================
// SHEET: FE-LIB-15 (formatMonthYear)
// ============================================================================
describe('FE-LIB-15 formatMonthYear', () => {
  it('UTCID01 returns empty string for null input', () => {
    expect(formatMonthYear(null)).toBe('');
  });

  it('UTCID02 returns empty string for empty string input', () => {
    expect(formatMonthYear('')).toBe('');
  });

  it('UTCID03 returns empty string for invalid date "2026-13-45"', () => {
    expect(formatMonthYear('2026-13-45')).toBe('');
  });

  it('UTCID04 formats valid date string into Vietnamese month year format', () => {
    expect(formatMonthYear('2026-03-15T00:00:00Z')).toBe('tháng 3 năm 2026');
  });
});

// ============================================================================
// SHEET: FE-LIB-16 (formatDate)
// ============================================================================
describe('FE-LIB-16 formatDate', () => {
  it('UTCID01 returns empty string for undefined input', () => {
    expect(formatDate(undefined)).toBe('');
  });

  it('UTCID02 returns empty string for empty string input', () => {
    expect(formatDate('')).toBe('');
  });

  it('UTCID03 returns empty string for non-date string "abc"', () => {
    expect(formatDate('abc')).toBe('');
  });

  it('UTCID04 formats valid date "2026-01-05" to "05/01/2026"', () => {
    expect(formatDate('2026-01-05')).toBe('05/01/2026');
  });

  it('UTCID05 formats UTC date "2026-12-31T10:00:00Z" to "31/12/2026"', () => {
    expect(formatDate('2026-12-31T10:00:00Z')).toBe('31/12/2026');
  });

  it('UTCID06 rolls over day locally to "01/01/2027" for "2026-12-31T17:00:00Z" in UTC+7', () => {
    expect(formatDate('2026-12-31T17:00:00Z')).toBe('01/01/2027');
  });
});
