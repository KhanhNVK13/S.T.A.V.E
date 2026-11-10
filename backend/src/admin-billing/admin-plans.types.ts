import { PLAN_FEATURES } from '@stave/shared-types';

export const PLAN_FEATURE_KEYS: string[] = PLAN_FEATURES.map(
  ({ key }) => key,
);

export const ADMIN_PLAN_COLUMNS =
  'id,name,description,price_vnd,features,is_active,is_default,sort_order,price_effective_at';

export interface AdminPlanRow {
  id: string;
  name: string;
  description: string | null;
  price_vnd: number;
  features: Record<string, unknown> | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  price_effective_at: string | null;
}

export interface AdminPlanSubscription {
  user_id: string;
  status: string;
  current_period_end: string;
  plan_id: string;
}

/** Gói như admin thấy ở trang quản trị — kèm số người dùng còn hiệu lực. */
export interface AdminPlanItem {
  id: string;
  name: string;
  description: string;
  priceVnd: number;
  features: Record<string, unknown>;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  priceEffectiveAt: string | null;
  /** Người đang có subscription còn hiệu lực trên gói (active + canceled chưa hết hạn). */
  subscriberCount: number;
}

export type PlanFeatureOverlapWarning = string;
