const FRACTION_BEYOND_MILLIS = /(\.\d{3})\d+/;

export function parseOccurredAt(value: string): Date | null {
  const date = new Date(value.replace(FRACTION_BEYOND_MILLIS, "$1"));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatOccurredAt(value: string, locale: string): string {
  const date = parseOccurredAt(value);
  return date ? date.toLocaleString(locale) : value;
}
