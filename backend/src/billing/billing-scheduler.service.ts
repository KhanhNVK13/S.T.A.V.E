import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NotificationsService } from '../notifications/notifications.service';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { formatDateVi } from './billing-format';
import {
  PLAN_COLUMNS,
  SUBSCRIPTION_COLUMNS,
  type PlanRow,
  type SubscriptionRow,
} from './effective-plan';
import { PENDING_EXPIRY_MS } from './payments.service';
import { PAYMENT_GATEWAY, type PaymentGateway } from './payment-gateway';
import { PaymentsService } from './payments.service';
import {
  GRACE_DAYS,
  REMINDER_LEAD_DAYS,
  addDays,
  currentReminderMilestone,
} from './renewal';

export const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
export const BILLING_PAYMENT_PROVIDER = Symbol('BILLING_PAYMENT_PROVIDER');

interface PendingTransactionRow {
  id: string;
  order_code: number | null;
}

@Injectable()
export class BillingSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingSchedulerService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
    @Inject(BILLING_PAYMENT_PROVIDER)
    private readonly provider: string,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    if (this.isDisabled()) return;
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Quét định kỳ — mỗi bước bọc try/catch riêng để lỗi một bước không chặn bước khác. */
  async sweep(now: Date = new Date()): Promise<void> {
    await this.runStep('openGracePeriods', () => this.openGracePeriods(now));
    await this.runStep('sendRenewalReminders', () =>
      this.sendRenewalReminders(now),
    );
    await this.runStep('applyScheduledDowngrades', () =>
      this.applyScheduledDowngrades(now),
    );
    await this.runStep('failStalePendingOrders', () =>
      this.failStalePendingOrders(now),
    );
  }

  private isDisabled(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      process.env.BILLING_SCHEDULER_ENABLED === 'false'
    );
  }

  private async runStep(
    name: string,
    step: () => Promise<void>,
  ): Promise<void> {
    try {
      await step();
    } catch (err) {
      this.logger.error(
        `Billing sweep step ${name} failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  /**
   * Mở ân hạn 3 ngày (BR-86) cho gói đã quá hạn, chưa có ân hạn và chưa có
   * lịch chuyển gói. PostgREST không cho phép cộng khoảng thời gian vào cột
   * nên giá trị được tính bằng JS; update có điều kiện an toàn đa instance.
   */
  async openGracePeriods(now: Date = new Date()): Promise<void> {
    const nowIso = now.toISOString();
    const { data, error } = await this.supabase
      .from('subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('status', 'active')
      .lt('current_period_end', nowIso)
      .is('grace_until', null)
      .is('pending_plan_id', null)
      .returns<SubscriptionRow[]>();
    if (error) {
      throw new Error(`Could not read subscriptions: ${error.message}`);
    }
    if (!data?.length) return;

    for (const subscription of data) {
      const graceUntil = addDays(
        new Date(subscription.current_period_end),
        GRACE_DAYS,
      ).toISOString();
      const { data: updated, error: updateError } = await this.supabase
        .from('subscriptions')
        .update({ grace_until: graceUntil })
        .eq('id', subscription.id)
        .is('grace_until', null)
        .select('id')
        .returns<{ id: string }[]>();
      if (updateError) {
        this.logger.error(
          `Could not open grace period for ${subscription.id}: ${updateError.message}`,
        );
        continue;
      }
      if (updated?.length) {
        this.logger.log(`Opened a grace period for ${subscription.id}`);
      }
    }
  }

  /**
   * Nhắc gia hạn ở các mốc: T-3 ngày, ngày hết hạn và mỗi ngày trong ân hạn
   * (BR-86). Lọc thô bằng một select (kỳ trong cửa sổ nhắc HOẶC đang ân hạn),
   * xác định mốc bằng hàm thuần rồi update có điều kiện — chỉ gửi thông báo cho
   * dòng thật sự được cập nhật.
   */
  async sendRenewalReminders(now: Date = new Date()): Promise<void> {
    const nowIso = now.toISOString();
    const leadWindow = addDays(now, REMINDER_LEAD_DAYS).toISOString();

    const { data, error } = await this.supabase
      .from('subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('status', 'active')
      .is('pending_plan_id', null)
      .or(`current_period_end.lte.${leadWindow},grace_until.gt.${nowIso}`)
      .returns<SubscriptionRow[]>();
    if (error) {
      throw new Error(`Could not read subscriptions: ${error.message}`);
    }
    if (!data?.length) return;

    const plans = await this.loadPlans();
    for (const subscription of data) {
      const milestone = currentReminderMilestone(subscription, now);
      if (!milestone) continue;

      const milestoneIso = milestone.toISOString();
      const { data: updated, error: updateError } = await this.supabase
        .from('subscriptions')
        .update({ renewal_notified_at: nowIso })
        .eq('id', subscription.id)
        .or(
          `renewal_notified_at.is.null,renewal_notified_at.lt.${milestoneIso}`,
        )
        .select('id')
        .returns<{ id: string }[]>();
      if (updateError) {
        this.logger.error(
          `Could not mark reminder for ${subscription.id}: ${updateError.message}`,
        );
        continue;
      }
      if (!updated?.length) continue;

      const planName = plans.get(subscription.plan_id)?.name ?? '';
      await this.notifications.notify(
        subscription.user_id,
        'billing.renewal_due',
        {
          planName,
          dueDate: formatDateVi(subscription.current_period_end),
        },
      );
    }
  }

  /**
   * Áp dụng hạ cấp đã đặt lịch khi kỳ hiện tại kết thúc. Hạ về gói miễn phí
   * thì chỉ gỡ lịch; hạ sang gói trả phí thì đổi gói và khoá giá gói mới.
   */
  async applyScheduledDowngrades(now: Date = new Date()): Promise<void> {
    const nowIso = now.toISOString();
    const { data, error } = await this.supabase
      .from('subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .not('pending_plan_id', 'is', null)
      .lte('current_period_end', nowIso)
      .returns<SubscriptionRow[]>();
    if (error) {
      throw new Error(`Could not read subscriptions: ${error.message}`);
    }
    if (!data?.length) return;

    const plans = await this.loadPlans();
    for (const subscription of data) {
      const target = subscription.pending_plan_id
        ? plans.get(subscription.pending_plan_id)
        : undefined;
      if (!target) {
        this.logger.error(
          `Scheduled plan ${subscription.pending_plan_id} for ${subscription.id} is missing`,
        );
        continue;
      }

      const patch: Record<string, unknown> = target.is_default
        ? { pending_plan_id: null }
        : {
            plan_id: target.id,
            price_locked_vnd: target.price_vnd,
            pending_plan_id: null,
          };
      const { data: updated, error: updateError } = await this.supabase
        .from('subscriptions')
        .update(patch)
        .eq('id', subscription.id)
        .eq('pending_plan_id', target.id)
        .select('id')
        .returns<{ id: string }[]>();
      if (updateError) {
        this.logger.error(
          `Could not apply scheduled plan change for ${subscription.id}: ${updateError.message}`,
        );
        continue;
      }
      if (!updated?.length) continue;

      await this.notifications.notify(
        subscription.user_id,
        'billing.plan_changed',
        {
          planName: target.name,
          effectiveDate: formatDateVi(subscription.current_period_end),
        },
      );
    }
  }

  /**
   * Giao dịch pending quá 30 phút. Với PayOS thì hỏi cổng trước — thành công
   * thì hoàn tất đơn, cổng lỗi thì bỏ qua lượt này để thử lại lần quét sau.
   * Cổng giả hoặc đơn thất bại thật thì đánh dấu thất bại.
   */
  async failStalePendingOrders(now: Date = new Date()): Promise<void> {
    const cutoff = new Date(now.getTime() - PENDING_EXPIRY_MS).toISOString();
    const { data, error } = await this.supabase
      .from('transactions')
      .select('id, order_code')
      .eq('status', 'pending')
      .lt('created_at', cutoff)
      .returns<PendingTransactionRow[]>();
    if (error) {
      throw new Error(`Could not read transactions: ${error.message}`);
    }
    if (!data?.length) return;

    for (const transaction of data) {
      if (this.provider === 'payos') {
        if (transaction.order_code === null) continue;
        let status: Awaited<ReturnType<PaymentGateway['getPaymentStatus']>>;
        try {
          status = await this.gateway.getPaymentStatus(transaction.order_code);
        } catch {
          this.logger.warn(
            `Payment provider unreachable for order ${transaction.order_code}; will retry next sweep`,
          );
          continue;
        }
        if (status === 'success') {
          await this.payments.completeOrder(transaction.order_code, true);
          continue;
        }
      }
      await this.markTransactionFailed(transaction.id);
    }
  }

  private async markTransactionFailed(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('transactions')
      .update({ status: 'failed' })
      .eq('id', id)
      .eq('status', 'pending');
    if (error) {
      throw new Error(`Could not fail transaction ${id}: ${error.message}`);
    }
  }

  private async loadPlans(): Promise<Map<string, PlanRow>> {
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .select(PLAN_COLUMNS)
      .returns<PlanRow[]>();
    if (error) {
      throw new Error(`Could not read plans: ${error.message}`);
    }
    return new Map((data ?? []).map((plan) => [plan.id, plan]));
  }
}
