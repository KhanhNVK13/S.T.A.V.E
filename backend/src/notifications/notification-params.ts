import {
  formatDateEn,
  formatDateVi,
  formatVnd,
  formatVndEn,
} from '../billing/billing-format';

const MONEY_KEYS = new Set(['amount', 'newPrice', 'refundAmountVnd']);
const DATE_KEY = /(Date|At)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

export function fallbackValues(
  params: Record<string, unknown>,
  lang: 'vi' | 'en' = 'vi',
): Record<string, unknown> {
  const money = lang === 'en' ? formatVndEn : formatVnd;
  const date = lang === 'en' ? formatDateEn : formatDateVi;
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (MONEY_KEYS.has(key) && typeof value === 'number') {
      values[key] = money(value);
    } else if (
      DATE_KEY.test(key) &&
      typeof value === 'string' &&
      ISO_DATE.test(value)
    ) {
      values[key] = date(value);
    } else {
      values[key] = value;
    }
  }
  return values;
}
