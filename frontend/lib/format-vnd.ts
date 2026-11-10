import { APP_LOCALE } from "./format-date";

const VND = new Intl.NumberFormat(APP_LOCALE, { style: "currency", currency: "VND" });

export function formatVnd(amount: number): string {
  return VND.format(amount);
}
