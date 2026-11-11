import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PLAN_FEATURES } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { formatDateVi, formatVnd } from '../billing/billing-format';
import type { CreatePlanDto } from './dto/create-plan.dto';
import { MAX_EXTRA_STORAGE_MB } from './dto/create-plan.dto';
import type { UpdatePlanPriceDto } from './dto/update-plan-price.dto';
import {
  ADMIN_PLAN_COLUMNS,
  PLAN_FEATURE_KEYS,
  type AdminPlanItem,
  type AdminPlanRow,
  type AdminPlanSubscription,
  type PlanFeatureOverlapWarning,
} from './admin-plans.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_NOTICE_DAYS = 7;

@Injectable()
export class AdminPlansService {
  private readonly logger = new Logger(AdminPlansService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly platformSettings: PlatformSettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** UC-105: tất cả gói (draft, active, inactive) + số người dùng còn hiệu lực. */
  async listPlans(now: Date = new Date()): Promise<AdminPlanItem[]> {
    const [plansResult, subsResult] = await Promise.all([
      this.supabase
        .from('subscription_plans')
        .select(ADMIN_PLAN_COLUMNS)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .returns<AdminPlanRow[]>(),
      this.supabase
        .from('subscriptions')
        .select('user_id, status, current_period_end, plan_id')
        .returns<AdminPlanSubscription[]>(),
    ]);
    if (plansResult.error || !plansResult.data) {
      throw new InternalServerErrorException(
        'Could not read subscription plans',
      );
    }
    if (subsResult.error) {
      throw new InternalServerErrorException(
        'Could not count plan subscribers',
      );
    }

    const counts = this.countActiveSubscribers(subsResult.data ?? [], now);
    return plansResult.data.map((plan) => this.toItem(plan, counts));
  }

  /** UC-105: tạo gói mới — không bao giờ mở bán gói mặc định, không đụng subscriptions. */
  async createPlan(
    adminId: string,
    dto: CreatePlanDto,
  ): Promise<{ plan: AdminPlanItem; warnings: PlanFeatureOverlapWarning[] }> {
    const name = dto.name.trim();
    if (name.length === 0 || name.length > 60) {
      throw new BadRequestException(
        'Plan name must be between 1 and 60 characters',
      );
    }
    const features = this.buildFeatures(dto.features);
    const free = await this.findDefaultPlan();
    const warnings = this.overlapWarnings(features, free);

    const { data, error } = await this.supabase
      .from('subscription_plans')
      .insert({
        name,
        description: dto.description?.trim() ?? '',
        price_vnd: dto.priceVnd,
        features,
        is_active: dto.status !== 'draft',
        is_default: false,
        sort_order: 100,
      })
      .select(ADMIN_PLAN_COLUMNS)
      .single<AdminPlanRow>();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('Plan name already exists');
      }
      throw new InternalServerErrorException(
        'Could not create subscription plan',
      );
    }
    if (!data)
      throw new InternalServerErrorException(
        'Could not create subscription plan',
      );

    await this.writeAuditLog(
      adminId,
      'plan.create',
      data.id,
      `Tạo gói "${data.name}" (${data.is_active ? 'đang bán' : 'nháp'}): ${formatVnd(data.price_vnd)}, tính năng ${JSON.stringify(data.features)}`,
    );

    return { plan: this.toItem(data, new Map()), warnings };
  }

  /** UC-106: hẹn giờ đổi giá — không làm đổi tính năng từ kỳ sau. */
  async changePrice(
    adminId: string,
    id: string,
    dto: UpdatePlanPriceDto,
    now: Date = new Date(),
  ): Promise<AdminPlanItem> {
    const plan = await this.getPlan(id);
    const noticeDays =
      (await this.platformSettings.get(
        'price_change_notice_days',
        DEFAULT_NOTICE_DAYS,
      )) ?? DEFAULT_NOTICE_DAYS;
    const earliest = new Date(now.getTime() + noticeDays * DAY_MS);
    const effectiveAt = new Date(dto.effectiveAt);
    if (
      Number.isNaN(effectiveAt.getTime()) ||
      effectiveAt.getTime() < earliest.getTime()
    ) {
      throw new BadRequestException({
        message: 'Price change takes effect too soon',
        earliestEffectiveAt: earliest.toISOString(),
        noticeDays,
      });
    }

    const { data, error } = await this.supabase
      .from('subscription_plans')
      .update({
        price_vnd: dto.priceVnd,
        price_effective_at: effectiveAt.toISOString(),
      })
      .eq('id', id)
      .select(ADMIN_PLAN_COLUMNS)
      .single<AdminPlanRow>();
    if (error || !data) {
      throw new InternalServerErrorException('Could not update plan price');
    }

    await this.notifySubscribersOfPriceChange(plan, data, dto.priceVnd);
    await this.writeAuditLog(
      adminId,
      'plan.price_change',
      id,
      `${formatVnd(plan.price_vnd)} → ${formatVnd(dto.priceVnd)}, áp dụng từ ${effectiveAt.toISOString()}`,
    );

    return this.toItem(data, new Map());
  }

  /** UC-107: kích hoạt / ngưng kích hoạt gói (không có endpoint xoá). */
  async setActive(
    adminId: string,
    id: string,
    active: boolean,
  ): Promise<AdminPlanItem> {
    const plan = await this.getPlan(id);
    if (!active && plan.is_default) {
      throw new BadRequestException('Default plan cannot be deactivated');
    }

    const { data, error } = await this.supabase
      .from('subscription_plans')
      .update({ is_active: active })
      .eq('id', id)
      .select(ADMIN_PLAN_COLUMNS)
      .single<AdminPlanRow>();
    if (error || !data) {
      throw new InternalServerErrorException('Could not update plan status');
    }

    await this.writeAuditLog(
      adminId,
      active ? 'plan.activate' : 'plan.deactivate',
      id,
      active
        ? `Mở bán lại gói "${plan.name}"`
        : `Ngừng mở bán gói "${plan.name}"`,
    );

    return this.toItem(data, new Map());
  }

  /** Tính số người dùng còn hiệu lực cho từng gói (active + canceled chưa hết hạn). */
  private countActiveSubscribers(
    rows: AdminPlanSubscription[],
    now: Date,
  ): Map<string, number> {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const stillInEffect =
        row.status === 'active' ||
        (row.status === 'canceled' &&
          new Date(row.current_period_end).getTime() > now.getTime());
      if (!stillInEffect) continue;
      counts.set(row.plan_id, (counts.get(row.plan_id) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Chỉ giữ các tính năng hợp lệ: cờ có trong danh mục `PLAN_FEATURES` hoặc
   * `extra_storage_mb` (số MB 0–102400). Từ chối mọi thứ khác.
   */
  private buildFeatures(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const features: Record<string, unknown> = {};
    const known = new Set([...PLAN_FEATURE_KEYS, 'extra_storage_mb']);
    for (const [key, value] of Object.entries(input)) {
      if (!known.has(key)) {
        throw new BadRequestException(`Unknown plan feature: ${key}`);
      }
      if (key === 'extra_storage_mb') {
        if (
          typeof value !== 'number' ||
          value < 0 ||
          value > MAX_EXTRA_STORAGE_MB
        ) {
          throw new BadRequestException(
            `extra_storage_mb must be between 0 and ${MAX_EXTRA_STORAGE_MB} MB`,
          );
        }
        features[key] = value;
      } else {
        if (typeof value !== 'boolean') {
          throw new BadRequestException(`Feature ${key} must be a boolean`);
        }
        features[key] = value;
      }
    }
    return features;
  }

  /**
   * Cảnh báo (không chặn) các tính năng đã có sẵn trong gói Free mặc định —
   * cho thấy gói mới không thêm giá trị về mặt tính năng.
   */
  private overlapWarnings(
    features: Record<string, unknown>,
    free: AdminPlanRow | null,
  ): PlanFeatureOverlapWarning[] {
    if (!free) return [];
    const freeFeatures = free.features ?? {};
    return PLAN_FEATURES.filter(
      ({ key }) => features[key] === true && freeFeatures[key] === true,
    ).map(({ label }) => `Tính năng "${label}" đã có trong gói Free mặc định`);
  }

  private async getPlan(id: string): Promise<AdminPlanRow> {
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .select(ADMIN_PLAN_COLUMNS)
      .eq('id', id)
      .maybeSingle<AdminPlanRow>();
    if (error)
      throw new InternalServerErrorException(
        'Could not read subscription plan',
      );
    if (!data) throw new NotFoundException('Subscription plan not found');
    return data;
  }

  private async findDefaultPlan(): Promise<AdminPlanRow | null> {
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .select(ADMIN_PLAN_COLUMNS)
      .eq('is_default', true)
      .maybeSingle<AdminPlanRow>();
    if (error)
      throw new InternalServerErrorException('Could not read default plan');
    return data;
  }

  /** Gửi thông báo giá đổi cho mọi người dùng đang dùng gói này. */
  private async notifySubscribersOfPriceChange(
    plan: AdminPlanRow,
    updated: AdminPlanRow,
    newPrice: number,
  ): Promise<void> {
    const now = new Date();
    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('user_id, status, current_period_end')
      .eq('plan_id', plan.id)
      .returns<AdminPlanSubscription[]>();
    if (error) {
      this.logger.error(
        `Could not load subscribers of plan ${plan.id} for price-change notice: ${error.message}`,
      );
      return;
    }
    for (const row of data ?? []) {
      const stillInEffect =
        row.status === 'active' ||
        (row.status === 'canceled' &&
          new Date(row.current_period_end).getTime() > now.getTime());
      if (!stillInEffect) continue;
      await this.notifications.notify(row.user_id, 'billing.price_change', {
        planName: plan.name,
        newPrice: formatVnd(newPrice),
        effectiveDate: formatDateVi(updated.price_effective_at),
      });
    }
  }

  /** Ghi audit log theo mẫu chung — INSERT-only, không bao giờ chặn nghiệp vụ. */
  private async writeAuditLog(
    adminId: string,
    action: string,
    targetId: string,
    reason: string,
  ): Promise<void> {
    const { error } = await this.supabase.from('admin_audit_log').insert({
      admin_id: adminId,
      action,
      target_type: 'subscription_plan',
      target_id: targetId,
      reason,
    });
    if (error) {
      this.logger.error(
        `Could not write audit entry ${action} for ${targetId}: ${error.message}`,
      );
    }
  }

  private toItem(
    plan: AdminPlanRow,
    counts: Map<string, number>,
  ): AdminPlanItem {
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description ?? '',
      priceVnd: plan.price_vnd,
      features: plan.features ?? {},
      isActive: plan.is_active,
      isDefault: plan.is_default,
      sortOrder: plan.sort_order,
      priceEffectiveAt: plan.price_effective_at,
      subscriberCount: counts.get(plan.id) ?? 0,
    };
  }
}
