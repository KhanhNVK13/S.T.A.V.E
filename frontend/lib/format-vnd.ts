import { appLocale } from "./format-date";

const formatters = new Map<string, Intl.NumberFormat>();

export function formatVnd(amount: number): string {
  const locale = appLocale();
  let formatter = formatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: "currency", currency: "VND" });
    formatters.set(locale, formatter);
  }
  return formatter.format(amount);
}
