import {
  PAYMENT_ISSUE_DESCRIPTION_MAX,
  type EffectiveSubscription,
  type TransactionDisplayStatus,
  type TransactionKind,
} from "@stave/shared-types";
import { formatDate } from "./format-date";
import { tNow } from "./i18n";

export function displayStatusLabel(status: TransactionDisplayStatus): string {
  return tNow(`bill.status.${status}`);
}

export const DISPLAY_STATUS_VARIANT = {
  success: "success",
  failed: "danger",
  incomplete: "neutral",
} as const satisfies Record<TransactionDisplayStatus, string>;

export function kindLabel(kind: TransactionKind): string | null {
  if (kind === "refund") return tNow("bill.kind.refund");
  if (kind === "compensation") return tNow("bill.kind.compensation");
  return null;
}

export function validateIssueDescription(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return tNow("bill.issue.required");
  if (trimmed.length > PAYMENT_ISSUE_DESCRIPTION_MAX) {
    return tNow("bill.issue.tooLong", { max: PAYMENT_ISSUE_DESCRIPTION_MAX });
  }
  return null;
}

export function subscriptionSummary(subscription: EffectiveSubscription): string[] {
  if (!subscription.hasPaidAccess) return [tNow("bill.sub.free")];
  const lines: string[] = [];
  const end = formatDate(subscription.currentPeriodEnd);
  if (subscription.cancelAtPeriodEnd) {
    lines.push(tNow("bill.sub.canceled", { date: end }));
  } else if (subscription.inGrace) {
    lines.push(tNow("bill.sub.grace", { date: end }));
  } else {
    lines.push(tNow("bill.sub.next", { date: end }));
  }
  if (subscription.pendingPlan) {
    lines.push(tNow("bill.sub.pending", { plan: subscription.pendingPlan.name, date: end }));
  }
  return lines;
}
