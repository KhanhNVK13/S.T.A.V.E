export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface CheckoutOrder {
  orderCode: number;
  amountVnd: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}

export type GatewayPaymentStatus = 'success' | 'failed' | 'pending';

export interface PaymentGateway {
  createCheckout(
    order: CheckoutOrder,
  ): Promise<{ checkoutUrl: string; providerRef: string }>;
  verifyWebhook(
    body: unknown,
    headers: Record<string, string>,
  ): Promise<{ orderCode: number; success: boolean } | null>;
  getPaymentStatus(orderCode: number): Promise<GatewayPaymentStatus>;
  cancelPayment(orderCode: number, reason?: string): Promise<void>;
}
