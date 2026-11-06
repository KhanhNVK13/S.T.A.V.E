import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EffectiveSubscription } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import {
  PLAN_COLUMNS,
  SUBSCRIPTION_COLUMNS,
  resolveEffectivePlan,
  toSubscriptionPlan,
  type PlanRow,
  type SubscriptionRow,
} from './effective-plan';

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async getEffective(
    userId: string,
    now: Date = new Date(),
  ): Promise<EffectiveSubscription> {
    const [subResult, plansResult] = await Promise.all([
      this.supabase
        .from('subscriptions')
        .select(SUBSCRIPTION_COLUMNS)
        .eq('user_id', userId)
        .maybeSingle<SubscriptionRow>(),
      this.supabase
        .from('subscription_plans')
        .select(PLAN_COLUMNS)
        .returns<PlanRow[]>(),
    ]);
    if (subResult.error) {
      throw new InternalServerErrorException('Could not read subscription');
    }
    if (plansResult.error || !plansResult.data) {
      throw new InternalServerErrorException('Could not read plans');
    }

    const plans = plansResult.data;
    const defaultPlan = plans.find((plan) => plan.is_default);
    if (!defaultPlan) {
      throw new InternalServerErrorException('Default plan is not configured');
    }

    const resolved = resolveEffectivePlan(
      subResult.data,
      new Map(plans.map((plan) => [plan.id, plan])),
      defaultPlan,
      now,
    );
    return {
      ...resolved,
      plan: toSubscriptionPlan(resolved.plan),
      pendingPlan: resolved.pendingPlan
        ? toSubscriptionPlan(resolved.pendingPlan)
        : null,
    };
  }
}
