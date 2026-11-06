import { randomUUID } from 'crypto';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CheckoutPurpose,
  CheckoutResponse,
  EffectiveSubscription,
  PaymentOrder,
  PaymentOrderStatus,
} from '@stave/shared-types';
import { NotificationsService } from '../notifications/notifications.service';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { PLAN_COLUMNS, type PlanRow } from './effective-plan';
import { PAYMENT_GATEWAY, type PaymentGateway } from './payment-gateway';
import { isSafeReturnTo } from './return-to';
import { SubscriptionsService } from './subscriptions.service';

export const BILLING_FRONTEND_URL = Symbol('BILLING_FRONTEND_URL');
export const PENDING_EXPIRY_MS = 30 * 60 * 1000;
export const SYNC_COOLDOWN_MS = 3000;
const MAX_ORDER_CODE_ATTEMPTS = 3;
const UNIQUE_VIOLATION = '23505';

type StoredStatus = 'pending' | 'success' | 'failed';

export interface CompleteOrderResult {
  processed: boolean;
  status: StoredStatus | null;
  userId: string | null;
  planId: string | null;
  planName: string | null;
  amountVnd: number | null;
  transactionId: string | null;
  subscriptionId: string | null;
  activated: boolean | null;
  activationError: string | null;
  issueCreated: boolean;
}

interface CompleteOrderRpcRow {
  processed: boolean;
  status: StoredStatus | null;
  user_id: string | null;
  plan_id: string | null;
  plan_name: string | null;
  amount_vnd: number | null;
  transaction_id: string | null;
  subscription_id: string | null;
  activated: boolean | null;
  activation_error: string | null;
  issue_created: boolean | null;
}

interface OrderRow {
  order_code: number;
  user_id: string | null;
  amount_vnd: number;
  status: StoredStatus;
  created_at: string;
  plan: { name: string } | null;
}

interface PayerRow {
  status: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
}

const VND = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
});

export function formatVnd(amount: number): string {
  return VND.format(amount);
}

export function generateOrderCode(
  now: number = Date.now(),
  random: () => number = Math.random,
): number {
  return now * 100 + Math.floor(random() * 100);
}

export function toOrderStatus(
  status: StoredStatus,
  createdAt: string,
  now: Date,
): PaymentOrderStatus {
  if (
    status === 'pending' &&
    now.getTime() - new Date(createdAt).getTime() > PENDING_EXPIRY_MS
  ) {
    return 'expired';
  }
  return status;
}

const DESCRIPTION: Record<CheckoutPurpose, (plan: string) => string> = {
  subscribe: (plan) => `Đăng ký ${plan}`,
  upgrade: (plan) => `Nâng cấp lên ${plan}`,
  renew: (plan) => `Gia hạn ${plan}`,
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly lastSyncAt = new Map<number, number>();

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
    @Inject(BILLING_FRONTEND_URL)
    private readonly frontendUrl: string,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifications: NotificationsService,
  ) {}

  async createCheckout(
    userId: string,
    planId: string,
    purpose: CheckoutPurpose,
    returnTo?: string,
  ): Promise<CheckoutResponse> {
    const payer = await this.loadPayer(userId);
    if (payer.status !== 'active') {
      throw new ForbiddenException('Account is not active');
    }
    const plan = await this.loadPlan(planId);
    if (!plan.is_active && purpose !== 'renew') {
      throw new ConflictException('Plan is no longer available');
    }
    const effective = await this.subscriptions.getEffective(userId);
    this.assertPurpose(purpose, plan, effective);
    if (!Number.isSafeInteger(plan.price_vnd) || plan.price_vnd <= 0) {
      throw new BadRequestException('This plan does not need payment');
    }

    // TODO(P7): giá gia hạn theo price_locked_vnd / price_effective_at.
    const amountVnd = plan.price_vnd;
    const retryOf = await this.findRetryTarget(userId, plan.id);
    const { id, orderCode } = await this.insertPendingOrder({
      user_id: userId,
      plan_id: plan.id,
      amount_vnd: amountVnd,
      description: DESCRIPTION[purpose](plan.name),
      payer_name: payer.display_name ?? payer.username,
      payer_email: payer.email,
      retry_of: retryOf,
    });

    const back = isSafeReturnTo(returnTo)
      ? `&returnTo=${encodeURIComponent(returnTo)}`
      : '';
    let checkout: { checkoutUrl: string; providerRef: string };
    try {
      checkout = await this.gateway.createCheckout({
        orderCode,
        amountVnd,
        description: `STAVE ${orderCode}`,
        returnUrl: `${this.frontendUrl}/billing/result?orderCode=${orderCode}${back}`,
        cancelUrl: `${this.frontendUrl}/plans?canceled=1`,
      });
    } catch (err) {
      this.logger.warn(
        `Payment provider unavailable for order ${orderCode}: ${err instanceof Error ? err.name : 'unknown error'}`,
      );
      await this.discardPendingOrder(id);
      throw new BadGatewayException('Payment provider unavailable');
    }

    const { error } = await this.supabase
      .from('transactions')
      .update({ provider_ref: checkout.providerRef })
      .eq('id', id);
    if (error) {
      this.logger.error(`Could not save provider_ref for order ${orderCode}`);
    }
    return { checkoutUrl: checkout.checkoutUrl, orderCode };
  }

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
    const result: CompleteOrderResult = {
      processed: row.processed,
      status: row.status,
      userId: row.user_id,
      planId: row.plan_id,
      planName: row.plan_name,
      amountVnd: row.amount_vnd,
      transactionId: row.transaction_id,
      subscriptionId: row.subscription_id,
      activated: row.activated,
      activationError: row.activation_error,
      issueCreated: row.issue_created === true,
    };

    if (!result.transactionId) {
      this.logger.log(`Ignoring completion of unknown order ${orderCode}`);
      return result;
    }
    if (result.issueCreated) {
      this.logger.warn(`Payment issue opened for order ${orderCode}`);
    }
    if (!result.processed || !result.userId) return result;

    await this.notifications.notify(
      result.userId,
      result.status === 'success'
        ? 'billing.payment_success'
        : 'billing.payment_failed',
      {
        planName: result.planName ?? '',
        amount: formatVnd(result.amountVnd ?? 0),
        orderCode,
      },
    );
    return result;
  }

  async getOrderForUser(
    userId: string,
    orderCode: number,
    now: Date = new Date(),
  ): Promise<PaymentOrder> {
    const { data, error } = await this.supabase
      .from('transactions')
      .select(
        'order_code, user_id, amount_vnd, status, created_at, plan:subscription_plans!transactions_plan_id_fkey(name)',
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
      status: toOrderStatus(data.status, data.created_at, now),
      createdAt: data.created_at,
    };
  }

  async syncOrder(userId: string, orderCode: number): Promise<PaymentOrder> {
    const order = await this.getOrderForUser(userId, orderCode);
    if (order.status !== 'pending' && order.status !== 'expired') return order;

    const now = Date.now();
    const last = this.lastSyncAt.get(orderCode);
    if (last !== undefined && now - last < SYNC_COOLDOWN_MS) return order;
    this.rememberSync(orderCode, now);

    let status: 'success' | 'failed' | 'pending';
    try {
      status = await this.gateway.getPaymentStatus(orderCode);
    } catch {
      throw new BadGatewayException('Payment provider unavailable');
    }
    if (status === 'pending') return order;
    await this.completeOrder(orderCode, status === 'success');
    return this.getOrderForUser(userId, orderCode);
  }

  private assertPurpose(
    purpose: CheckoutPurpose,
    plan: PlanRow,
    effective: EffectiveSubscription,
  ): void {
    if (purpose === 'subscribe' && effective.hasPaidAccess) {
      throw new ConflictException('You already have a paid plan');
    }
    if (purpose === 'upgrade') {
      if (!effective.hasPaidAccess) {
        throw new ConflictException('You do not have a paid plan');
      }
      if (plan.id === effective.plan.id) {
        throw new ConflictException('You are already on this plan');
      }
      if (plan.price_vnd <= effective.plan.priceVnd) {
        throw new ConflictException(
          'Only a more expensive plan can be bought as an upgrade',
        );
      }
    }
    if (
      purpose === 'renew' &&
      (!effective.hasPaidAccess || plan.id !== effective.plan.id)
    ) {
      throw new ConflictException('Only your current paid plan can be renewed');
    }
  }

  private async loadPayer(userId: string): Promise<PayerRow> {
    const { data, error } = await this.supabase
      .from('users')
      .select('status, email, username, display_name')
      .eq('id', userId)
      .maybeSingle<PayerRow>();
    if (error) {
      throw new InternalServerErrorException('Could not read your account');
    }
    if (!data) throw new ForbiddenException('Account is not active');
    return data;
  }

  private async loadPlan(planId: string): Promise<PlanRow> {
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .select(PLAN_COLUMNS)
      .eq('id', planId)
      .maybeSingle<PlanRow>();
    if (error) throw new InternalServerErrorException('Could not read plans');
    if (!data) throw new NotFoundException('Plan not found');
    return data;
  }

  private async findRetryTarget(
    userId: string,
    planId: string,
  ): Promise<string | null> {
    const { data: failed, error } = await this.supabase
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .eq('kind', 'charge')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (error) {
      throw new InternalServerErrorException('Could not read transactions');
    }
    if (!failed) return null;

    const { data: retried, error: retriedError } = await this.supabase
      .from('transactions')
      .select('id')
      .eq('retry_of', failed.id)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (retriedError) {
      throw new InternalServerErrorException('Could not read transactions');
    }
    return retried ? null : failed.id;
  }

  private async insertPendingOrder(
    fields: Record<string, unknown>,
  ): Promise<{ id: string; orderCode: number }> {
    for (let attempt = 0; attempt < MAX_ORDER_CODE_ATTEMPTS; attempt++) {
      const id = randomUUID();
      const orderCode = generateOrderCode();
      const { error } = await this.supabase.from('transactions').insert({
        ...fields,
        id,
        order_code: orderCode,
        status: 'pending',
        kind: 'charge',
        created_at: new Date().toISOString(),
      });
      if (!error) return { id, orderCode };
      if ((error as { code?: string }).code !== UNIQUE_VIOLATION) break;
    }
    throw new InternalServerErrorException('Could not create the order');
  }

  private async discardPendingOrder(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('status', 'pending');
    if (error) {
      this.logger.error(`Could not remove pending transaction ${id}`);
    }
  }

  private rememberSync(orderCode: number, now: number): void {
    if (this.lastSyncAt.size > 1000) {
      for (const [code, at] of this.lastSyncAt) {
        if (now - at >= SYNC_COOLDOWN_MS) this.lastSyncAt.delete(code);
      }
    }
    this.lastSyncAt.set(orderCode, now);
  }
}
