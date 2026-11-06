import { apiFetch } from "./api-client";
import type {
  CheckoutResponse,
  EffectiveSubscription,
  FakePaymentResult,
  PaymentOrder,
  PlanListItem,
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
