import { DICTIONARIES, type TKey, type Vars } from "./i18n";
import { formatDate, formatDateTime } from "./format-date";
import { formatVnd } from "./format-vnd";

type Translate = (key: TKey, vars?: Vars) => string;

export interface NotificationLike {
  type: string;
  payload: { title?: string; body?: string; customText?: boolean; params?: Record<string, unknown> } & Record<
    string,
    unknown
  >;
}

const MONEY_KEYS = new Set(["amount", "newPrice", "refundAmountVnd"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

function hasKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(DICTIONARIES.en, key);
}

export function notificationVars(params: Record<string, unknown>): Vars {
  const vars: Vars = {};
  for (const [key, value] of Object.entries(params)) {
    if (MONEY_KEYS.has(key) && typeof value === "number") {
      vars[key] = formatVnd(value);
    } else if (typeof value === "string" && ISO_DATE.test(value) && /(Date|At)$/.test(key)) {
      vars[key] = key.endsWith("At") ? formatDateTime(value) : formatDate(value);
    } else if (typeof value === "string" || typeof value === "number") {
      vars[key] = value;
    }
  }
  return vars;
}

function bodyKey(item: NotificationLike): string {
  const base = `notif.${item.type}.body`;
  if (item.type === "billing.issue_resolved") {
    const remedy = item.payload.params?.remedy;
    if (typeof remedy === "string" && hasKey(`${base}.${remedy}`)) return `${base}.${remedy}`;
  }
  return base;
}

export function notificationText(item: NotificationLike, t: Translate): { title: string | null; body: string | null } {
  const stored = {
    title: typeof item.payload.title === "string" ? item.payload.title : null,
    body: typeof item.payload.body === "string" ? item.payload.body : null,
  };
  const titleKey = `notif.${item.type}.title`;
  const params = item.payload.params;
  const translatable =
    !item.payload.customText && hasKey(titleKey) && (params !== undefined || stored.title === null);
  if (!translatable) return stored;
  const vars = notificationVars(params ?? item.payload);
  return { title: t(titleKey as TKey, vars), body: t(bodyKey(item) as TKey, vars) };
}
