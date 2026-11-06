// Billing (UC-73..77, 104..108) — shapes shared with `backend/src/billing/`.
export const PLAN_FEATURES = [
  { key: "theme_from_image", label: "Theme tạo từ ảnh" },
  { key: "extra_storage", label: "Tăng dung lượng lưu trữ" },
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURES)[number]["key"];

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  priceVnd: number;
  features: Record<string, unknown>;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  priceEffectiveAt: string | null;
}

/** `none` = no subscription row still in effect, so the user is on the default plan. */
export type EffectiveSubscriptionStatus = "active" | "canceled" | "none";

/** GET /subscriptions/me */
export interface EffectiveSubscription {
  plan: SubscriptionPlan;
  status: EffectiveSubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: SubscriptionPlan | null;
  hasPaidAccess: boolean;
  inGrace: boolean;
}

export type PaymentOrderStatus = "pending" | "success" | "failed";

export interface PaymentOrder {
  orderCode: number;
  planName: string | null;
  amountVnd: number;
  status: PaymentOrderStatus;
}

export const FAKE_PAYMENT_RESULTS = ["success", "fail", "cancel"] as const;
export type FakePaymentResult = (typeof FAKE_PAYMENT_RESULTS)[number];

/** GET /subscription-plans — active plans plus the caller's current plan when it was deactivated. */
export interface PlanListItem extends SubscriptionPlan {
  isCurrent: boolean;
}
