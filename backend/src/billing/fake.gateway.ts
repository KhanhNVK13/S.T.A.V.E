import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CheckoutOrder,
  GatewayPaymentStatus,
  PaymentGateway,
} from './payment-gateway';

export class FakeGateway implements PaymentGateway {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly frontendUrl: string,
  ) {}

  createCheckout(order: CheckoutOrder) {
    return Promise.resolve({
      checkoutUrl: `${this.frontendUrl}/dev/fake-payment?orderCode=${order.orderCode}`,
      providerRef: `fake-${order.orderCode}`,
    });
  }

  verifyWebhook() {
    return Promise.resolve(null);
  }

  async getPaymentStatus(orderCode: number): Promise<GatewayPaymentStatus> {
    const { data, error } = await this.supabase
      .from('transactions')
      .select('status')
      .eq('order_code', orderCode)
      .maybeSingle<{ status: GatewayPaymentStatus }>();
    if (error) throw new Error('Could not read payment status');
    return data?.status ?? 'failed';
  }

  cancelPayment(): Promise<void> {
    return Promise.resolve();
  }
}
