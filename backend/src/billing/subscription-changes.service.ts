import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CancelPreview,
  CheckoutResponse,
  EffectiveSubscription,
  PlanChangeKind,
  PlanChangePreview,
  PlanChangeResult,
} from '@stave/shared-types';
import { NotificationsService } from '../notifications/notifications.service';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { PLAN_COLUMNS, type PlanRow } from './effective-plan';
import { classifyChange } from './plan-change';
import { PaymentsService } from './payments.service';
import { SubscriptionsService } from './subscriptions.service';

export const THEME_FROM_IMAGE_SETTING = 'Theme tạo từ ảnh';

interface ResolvedChange {
  effective: EffectiveSubscription;
  target: PlanRow;
  kind: PlanChangeKind;
}

@Injectable()
export class SubscriptionChangesService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly subscriptions: SubscriptionsService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
  ) {}

  async previewChange(
    userId: string,
    planId: string,
  ): Promise<PlanChangePreview> {
    const { effective, target, kind } = await this.resolveChange(
      userId,
      planId,
    );
    return {
      kind,
      planName: target.name,
      chargeVnd: kind === 'upgrade' ? target.price_vnd : 0,
      effectiveAt:
        kind === 'upgrade'
          ? new Date().toISOString()
          : effective.currentPeriodEnd,
    };
  }

  async change(userId: string, planId: string): Promise<PlanChangeResult> {
    const { effective, target, kind } = await this.resolveChange(
      userId,
      planId,
    );
    if (kind === 'upgrade') {
      const checkout = await this.payments.createCheckout(
        userId,
        target.id,
        'upgrade',
      );
      return { kind: 'upgrade', ...checkout };
    }

    const { data, error } = await this.supabase
      .from('subscriptions')
      .update({ pending_plan_id: target.id })
      .eq('user_id', userId)
      .eq('plan_id', effective.plan.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle<{ id: string }>();
    if (error) {
      throw new InternalServerErrorException('Could not update subscription');
    }
    if (!data) throw new ConflictException('No active paid plan to change');

    await this.notifications.notify(userId, 'billing.plan_changed', {
      planName: target.name,
      effectiveDate: effective.currentPeriodEnd,
    });
    return {
      kind: 'downgrade',
      planName: target.name,
      scheduledAt: effective.currentPeriodEnd,
    };
  }

  async cancelDowngrade(userId: string): Promise<EffectiveSubscription> {
    const { data, error } = await this.supabase
      .from('subscriptions')
      .update({ pending_plan_id: null })
      .eq('user_id', userId)
      .not('pending_plan_id', 'is', null)
      .select('id')
      .maybeSingle<{ id: string }>();
    if (error) {
      throw new InternalServerErrorException('Could not update subscription');
    }
    if (!data) throw new ConflictException('No plan change is scheduled');
    return this.subscriptions.getEffective(userId);
  }

  async previewCancel(userId: string): Promise<CancelPreview> {
    const effective = await this.subscriptions.getEffective(userId);
    this.assertCancellable(effective);
    return {
      endDate: effective.currentPeriodEnd,
      paidOnlySettings: await this.loadPaidOnlySettings(userId),
    };
  }

  async cancel(userId: string): Promise<EffectiveSubscription> {
    const effective = await this.subscriptions.getEffective(userId);
    this.assertCancellable(effective);

    const { data, error } = await this.supabase
      .from('subscriptions')
      .update({ status: 'canceled', pending_plan_id: null })
      .eq('user_id', userId)
      .eq('status', 'active')
      .select('id')
      .maybeSingle<{ id: string }>();
    if (error) {
      throw new InternalServerErrorException('Could not update subscription');
    }
    if (!data) throw new ConflictException('No active paid plan to cancel');

    await this.notifications.notify(userId, 'billing.canceled', {
      planName: effective.plan.name,
      endDate: effective.currentPeriodEnd,
    });
    return this.subscriptions.getEffective(userId);
  }

  async resume(userId: string): Promise<EffectiveSubscription> {
    const effective = await this.subscriptions.getEffective(userId);
    if (!effective.hasPaidAccess || effective.status !== 'canceled') {
      throw new ConflictException(
        'Only a canceled plan that is still running can be resumed',
      );
    }

    const { data, error } = await this.supabase
      .from('subscriptions')
      .update({ status: 'active' })
      .eq('user_id', userId)
      .eq('status', 'canceled')
      .select('id')
      .maybeSingle<{ id: string }>();
    if (error) {
      throw new InternalServerErrorException('Could not update subscription');
    }
    if (!data) {
      throw new ConflictException(
        'Only a canceled plan that is still running can be resumed',
      );
    }
    return this.subscriptions.getEffective(userId);
  }

  /**
   * Gia hạn gói đang dùng. Gói đã bị admin tắt vẫn gia hạn được (BR-120);
   * gói đang có lịch hạ cấp thì không gia hạn được (phải huỷ lịch trước).
   */
  async renew(userId: string): Promise<CheckoutResponse> {
    const effective = await this.subscriptions.getEffective(userId);
    if (!effective.hasPaidAccess || effective.status !== 'active') {
      throw new ConflictException('Only your current paid plan can be renewed');
    }
    if (effective.pendingPlan) {
      throw new ConflictException('Cannot renew while downgrade is scheduled');
    }
    return this.payments.createCheckout(userId, effective.plan.id, 'renew');
  }

  private async resolveChange(
    userId: string,
    planId: string,
  ): Promise<ResolvedChange> {
    const effective = await this.subscriptions.getEffective(userId);
    if (!effective.hasPaidAccess) {
      throw new ConflictException('You do not have a paid plan');
    }
    const target = await this.loadPlan(planId);
    if (target.id === effective.plan.id) {
      throw new ConflictException('You are already on this plan');
    }
    if (!target.is_active) {
      throw new ConflictException('Plan is no longer available');
    }
    const kind = classifyChange(effective.plan.priceVnd, target.price_vnd);
    if (kind === 'downgrade' && effective.cancelAtPeriodEnd) {
      throw new ConflictException(
        'Resume your plan before scheduling a change',
      );
    }
    if (kind === 'downgrade' && effective.inGrace) {
      throw new ConflictException('Renew your plan before scheduling a change');
    }
    return { effective, target, kind };
  }

  private assertCancellable(effective: EffectiveSubscription): void {
    if (!effective.hasPaidAccess || effective.status !== 'active') {
      throw new ConflictException('No active paid plan to cancel');
    }
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

  private async loadPaidOnlySettings(userId: string): Promise<string[]> {
    const { data: user, error } = await this.supabase
      .from('users')
      .select('active_theme_id')
      .eq('id', userId)
      .maybeSingle<{ active_theme_id: string | null }>();
    if (error) {
      throw new InternalServerErrorException('Could not read your account');
    }
    if (!user?.active_theme_id) return [];

    const { data: theme, error: themeError } = await this.supabase
      .from('themes')
      .select('type')
      .eq('id', user.active_theme_id)
      .maybeSingle<{ type: string }>();
    if (themeError) {
      throw new InternalServerErrorException('Could not read your theme');
    }
    return theme?.type === 'custom' ? [THEME_FROM_IMAGE_SETTING] : [];
  }
}
