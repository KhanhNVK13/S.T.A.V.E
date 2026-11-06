import { apiFetch } from "./api-client";
import type {
  CancelPreview,
  CheckoutResponse,
  EffectiveSubscription,
  FakePaymentResult,
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
