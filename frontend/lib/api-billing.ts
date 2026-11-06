import { apiFetch } from "./api-client";
import type {
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
