import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { PAYMENT_GATEWAY, type PaymentGateway } from './payment-gateway';

const ACCOUNT_REMOVAL_REASON = 'Account removed';

@Injectable()
export class AccountBillingCancellation {
  private readonly logger = new Logger(AccountBillingCancellation.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
  ) {}

  async cancelAll(userId: string, failureMessage: string): Promise<void> {
    const { data: pending, error: pendingError } = await this.supabase
      .from('transactions')
      .select('id, order_code')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .returns<{ id: string; order_code: number | null }[]>();
    if (pendingError) throw new InternalServerErrorException(failureMessage);

    for (const order of pending ?? []) {
      if (order.order_code === null) continue;
      try {
        await this.gateway.cancelPayment(
          order.order_code,
          ACCOUNT_REMOVAL_REASON,
        );
      } catch (err) {
        this.logger.error(
          `Could not cancel order ${order.order_code} at the payment gateway: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new ServiceUnavailableException(
          'Payment gateway is unreachable. Try again shortly',
        );
      }
    }

    if ((pending ?? []).length > 0) {
      const { error: failError } = await this.supabase
        .from('transactions')
        .update({ status: 'failed' })
        .eq('user_id', userId)
        .eq('status', 'pending');
      if (failError) throw new InternalServerErrorException(failureMessage);
    }

    const { error: cancelError } = await this.supabase
      .from('subscriptions')
      .update({ status: 'canceled', pending_plan_id: null })
      .eq('user_id', userId)
      .eq('status', 'active');
    if (cancelError) throw new InternalServerErrorException(failureMessage);
  }
}
