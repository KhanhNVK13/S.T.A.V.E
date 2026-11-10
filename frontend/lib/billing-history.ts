import {
  PAYMENT_ISSUE_DESCRIPTION_MAX,
  type EffectiveSubscription,
  type TransactionDisplayStatus,
  type TransactionKind,
} from "@stave/shared-types";
import { formatDate } from "./format-date";

export const DISPLAY_STATUS_LABEL: Record<TransactionDisplayStatus, string> = {
  success: "Thành công",
  failed: "Thất bại",
  incomplete: "Chưa hoàn tất",
};

export const DISPLAY_STATUS_VARIANT = {
  success: "success",
  failed: "danger",
  incomplete: "neutral",
} as const satisfies Record<TransactionDisplayStatus, string>;

export const KIND_LABEL: Partial<Record<TransactionKind, string>> = {
  refund: "Hoàn tiền",
  compensation: "Đền bù",
};

export function validateIssueDescription(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "Hãy mô tả sự cố bạn gặp.";
  if (trimmed.length > PAYMENT_ISSUE_DESCRIPTION_MAX) {
    return `Mô tả tối đa ${PAYMENT_ISSUE_DESCRIPTION_MAX} ký tự.`;
  }
  return null;
}

export function subscriptionSummary(subscription: EffectiveSubscription): string[] {
  if (!subscription.hasPaidAccess) return ["Bạn đang dùng gói miễn phí."];
  const lines: string[] = [];
  const end = formatDate(subscription.currentPeriodEnd);
  if (subscription.cancelAtPeriodEnd) {
    lines.push(`Đã huỷ gia hạn. Hiệu lực đến ${end}.`);
  } else if (subscription.inGrace) {
    lines.push(`Kỳ đã trả kết thúc ngày ${end}. Hãy gia hạn để tiếp tục dùng gói.`);
  } else {
    lines.push(`Thanh toán kế tiếp: ${end}.`);
  }
  if (subscription.pendingPlan) {
    lines.push(`Sẽ chuyển sang ${subscription.pendingPlan.name} vào ${end}.`);
  }
  return lines;
}
