import { formatDateVi, formatVnd } from '../billing/billing-format';

const MONEY_KEYS = new Set(['amount', 'newPrice', 'refundAmountVnd']);
const DATE_KEY = /(Date|At)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

export function fallbackValues(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (MONEY_KEYS.has(key) && typeof value === 'number') {
      values[key] = formatVnd(value);
    } else if (
      DATE_KEY.test(key) &&
      typeof value === 'string' &&
      ISO_DATE.test(value)
    ) {
      values[key] = formatDateVi(value);
    } else {
      values[key] = value;
    }
  }
  return values;
}
