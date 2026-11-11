import { apiFetch } from "./api-client";
import type {
  ActivateCustomThemeResponse,
  CancelPreview,
  CheckoutResponse,
  EffectiveSubscription,
  EffectiveTheme,
  FakePaymentResult,
  SaveCustomThemeResponse,
  PaymentIssueCreated,
  PaymentOrder,
  PlanChangePreview,
  PlanChangeResult,
  PlanListItem,
  TransactionHistoryPage,
  TransactionReceipt,
} from "@stave/shared-types";

export async function getMySubscription(): Promise<EffectiveSubscription> {
  return apiFetch<EffectiveSubscription>("/subscriptions/me");
}

/** UC-79 — theme có hiệu lực (kèm cờ quyền trả phí). */
export async function getMyEffectiveTheme(): Promise<EffectiveTheme> {
  return apiFetch<EffectiveTheme>("/themes/me/effective");
}

/** UC-78 — chọn preset theme (miễn phí mọi gói). */
export async function setMyPresetTheme(presetKey: string): Promise<void> {
  await apiFetch<unknown>("/users/me/theme", {
    method: "PUT",
    body: JSON.stringify({ presetKey }),
  });
}

/** UC-79 — dùng lại palette từ ảnh đã lưu. */
export async function activateSavedCustomTheme(): Promise<ActivateCustomThemeResponse> {
  return apiFetch<ActivateCustomThemeResponse>("/themes/me/custom/activate", {
    method: "PUT",
  });
}

/** UC-79 — lưu palette theme tạo từ ảnh. */
export async function saveMyCustomTheme(
  palette: Record<string, string>,
): Promise<SaveCustomThemeResponse> {
  return apiFetch<SaveCustomThemeResponse>("/themes/me/custom", {
    method: "PUT",
    body: JSON.stringify({ palette }),
  });
}

export async function getFakePaymentOrder(orderCode: number): Promise<PaymentOrder> {
  return apiFetch<PaymentOrder>(`/dev/fake-payment/${orderCode}`);
}

export async function submitFakePaymentResult(
  orderCode: number,
  result: FakePaymentResult,
): Promise<PaymentOrder> {
  return apiFetch<PaymentOrder>(`/dev/fake-payment/${orderCode}/${result}`, {
    method: "POST",
  });
}

export async function listSubscriptionPlans(): Promise<PlanListItem[]> {
  return apiFetch<PlanListItem[]>("/subscription-plans");
}

export async function startCheckout(planId: string, returnTo: string | null): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>("/subscriptions/checkout", {
    method: "POST",
    body: JSON.stringify(returnTo ? { planId, returnTo } : { planId }),
  });
}

export async function getPaymentOrder(orderCode: number): Promise<PaymentOrder> {
  return apiFetch<PaymentOrder>(`/payments/orders/${orderCode}`);
}

export async function syncPaymentOrder(orderCode: number): Promise<PaymentOrder> {
  return apiFetch<PaymentOrder>(`/payments/orders/${orderCode}/sync`, { method: "POST" });
}

export async function listTransactions(cursor?: string | null): Promise<TransactionHistoryPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiFetch<TransactionHistoryPage>(`/billing/transactions${query}`);
}

export async function getTransactionReceipt(id: string): Promise<TransactionReceipt> {
  return apiFetch<TransactionReceipt>(`/billing/transactions/${id}/receipt`);
}

export async function reportPaymentIssue(id: string, description: string): Promise<PaymentIssueCreated> {
  return apiFetch<PaymentIssueCreated>(`/billing/transactions/${id}/issues`, {
    method: "POST",
    body: JSON.stringify({ description }),
  });
}

export async function previewPlanChange(planId: string): Promise<PlanChangePreview> {
  return apiFetch<PlanChangePreview>(`/subscriptions/change-preview?planId=${encodeURIComponent(planId)}`);
}

export async function changePlan(planId: string): Promise<PlanChangeResult> {
  return apiFetch<PlanChangeResult>("/subscriptions/change", { method: "POST", body: JSON.stringify({ planId }) });
}

export async function cancelScheduledDowngrade(): Promise<EffectiveSubscription> {
  return apiFetch<EffectiveSubscription>("/subscriptions/cancel-downgrade", { method: "POST" });
}

export async function previewCancellation(): Promise<CancelPreview> {
  return apiFetch<CancelPreview>("/subscriptions/cancel-preview");
}

export async function cancelSubscription(): Promise<EffectiveSubscription> {
  return apiFetch<EffectiveSubscription>("/subscriptions/cancel", { method: "POST" });
}

export async function resumeSubscription(): Promise<EffectiveSubscription> {
  return apiFetch<EffectiveSubscription>("/subscriptions/resume", { method: "POST" });
}

export async function renewSubscription(): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>("/subscriptions/renew", { method: "POST" });
}
