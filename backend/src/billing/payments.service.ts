import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaymentOrder, PaymentOrderStatus } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';

export interface CompleteOrderResult {
  processed: boolean;
  status: PaymentOrderStatus | null;
  userId: string | null;
  planId: string | null;
  transactionId: string | null;
  subscriptionId: string | null;
  activated: boolean | null;
  activationError: string | null;
}

interface CompleteOrderRpcRow {
  processed: boolean;
  status: PaymentOrderStatus | null;
  user_id: string | null;
  plan_id: string | null;
  transaction_id: string | null;
  subscription_id: string | null;
  activated: boolean | null;
  activation_error: string | null;
}

interface OrderRow {
  order_code: number;
  user_id: string | null;
  amount_vnd: number;
  status: PaymentOrderStatus;
  plan: { name: string } | null;
}

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async completeOrder(
    orderCode: number,
    success: boolean,
  ): Promise<CompleteOrderResult> {
    const { data, error } = await this.supabase.rpc('billing_complete_order', {
      p_order_code: orderCode,
      p_success: success,
    });
    if (error || !data) {
      throw new InternalServerErrorException('Could not complete the order');
    }
    const row = data as CompleteOrderRpcRow;
    return {
      processed: row.processed,
      status: row.status,
      userId: row.user_id,
      planId: row.plan_id,
      transactionId: row.transaction_id,
      subscriptionId: row.subscription_id,
      activated: row.activated,
      activationError: row.activation_error,
    };
  }

  async getOrderForUser(
    userId: string,
    orderCode: number,
  ): Promise<PaymentOrder> {
    const { data, error } = await this.supabase
      .from('transactions')
      .select(
        'order_code, user_id, amount_vnd, status, plan:subscription_plans!transactions_plan_id_fkey(name)',
      )
      .eq('order_code', orderCode)
      .maybeSingle<OrderRow>();
    if (error) {
      throw new InternalServerErrorException('Could not read the order');
    }
    if (!data || data.user_id !== userId) {
      throw new NotFoundException('Order not found');
    }
    return {
      orderCode: Number(data.order_code),
      planName: data.plan?.name ?? null,
      amountVnd: data.amount_vnd,
      status: data.status,
    };
  }
}
