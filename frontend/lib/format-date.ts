import { LOCALES, getLang, tNow } from './i18n';

export const APP_LOCALE = 'vi-VN';

export function appLocale(): string {
  return LOCALES[getLang()];
}

/**
 * Format a date string to relative time in the active language.
 * E.g. "just now", "5 minutes ago", "2 hours ago", "3 days ago", "dd/MM/yyyy"
 */
export function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return tNow('time.justNow');
  if (diffMin < 60) return tNow('time.minute', { n: diffMin });
  if (diffHour < 24) return tNow('time.hour', { n: diffHour });
  if (diffDay < 7) return tNow('time.day', { n: diffDay });
  if (diffDay < 30) return tNow('time.week', { n: Math.floor(diffDay / 7) });

  // Fallback to dd/MM/yyyy
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format a date string to month and year in the active locale — used for "joined on" style dates.
 */
export function formatMonthYear(dateStr: string | null | undefined): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  return date.toLocaleDateString(appLocale(), { year: 'numeric', month: 'long' });
}

/**
 * Format a date string to dd/MM/yyyy
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Số ngày còn lại tới một mốc thời gian (âm = đã qua).
 */
export function daysUntil(dateStr: string | null | undefined, now: Date = new Date()): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
}

/**
 * Format a date string to date and time (locale-driven)
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  return date.toLocaleString(appLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
