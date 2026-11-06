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

/** `expired` = still pending in the database but older than 30 minutes, shown as not completed. */
export type PaymentOrderStatus = "pending" | "success" | "failed" | "expired";

export interface PaymentOrder {
  orderCode: number;
  planName: string | null;
  amountVnd: number;
  status: PaymentOrderStatus;
  createdAt: string;
}

export type CheckoutPurpose = "subscribe" | "upgrade" | "renew";

/** POST /subscriptions/checkout */
export interface CheckoutResponse {
  checkoutUrl: string;
  orderCode: number;
}

export const FAKE_PAYMENT_RESULTS = ["success", "fail", "cancel"] as const;
export type FakePaymentResult = (typeof FAKE_PAYMENT_RESULTS)[number];

/** GET /subscription-plans — active plans plus the caller's current plan when it was deactivated. */
export interface PlanListItem extends SubscriptionPlan {
  isCurrent: boolean;
}

export type TransactionKind = "charge" | "refund" | "compensation";
/** `incomplete` = still pending (shown the same whether or not the 30-minute window has passed). */
export type TransactionDisplayStatus = "success" | "failed" | "incomplete";

export interface TransactionHistoryItem {
  id: string;
  createdAt: string;
  description: string | null;
  amountVnd: number;
  kind: TransactionKind;
  displayStatus: TransactionDisplayStatus;
  planName: string | null;
  retryOf: { id: string; createdAt: string } | null;
  hasOpenIssue: boolean;
}

/** GET /billing/transactions */
export interface TransactionHistoryPage {
  items: TransactionHistoryItem[];
  nextCursor: string | null;
}

export interface TransactionDetails {
  id: string;
  createdAt: string;
  description: string | null;
  amountVnd: number;
  kind: TransactionKind;
  displayStatus: TransactionDisplayStatus;
  planName: string | null;
  orderCode: number | null;
}

/** GET /billing/transactions/:id/receipt — `receipt` is null when a receipt cannot be issued. */
export interface TransactionReceipt {
  available: boolean;
  details: TransactionDetails;
  receipt: {
    orderCode: number;
    createdAt: string;
    planName: string;
    amountVnd: number;
    payerName: string | null;
  } | null;
}

/** POST /billing/transactions/:id/issues */
export interface PaymentIssueCreated {
  id: string;
  transactionId: string;
  status: "open";
  createdAt: string;
}

export const PAYMENT_ISSUE_DESCRIPTION_MAX = 500;

export type PlanChangeKind = "upgrade" | "downgrade";

/** GET /subscriptions/change-preview — what confirming the change will do. */
export interface PlanChangePreview {
  kind: PlanChangeKind;
  planName: string;
  chargeVnd: number;
  effectiveAt: string | null;
}

/** POST /subscriptions/change */
export type PlanChangeResult =
  | { kind: "upgrade"; checkoutUrl: string; orderCode: number }
  | { kind: "downgrade"; planName: string; scheduledAt: string | null };

/** GET /subscriptions/cancel-preview */
export interface CancelPreview {
  endDate: string | null;
  paidOnlySettings: string[];
}
