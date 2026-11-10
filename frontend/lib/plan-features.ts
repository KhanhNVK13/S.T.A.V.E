import { PLAN_FEATURES, type PlanFeatureKey } from "@stave/shared-types";

export interface PlanFeatureItem {
  key: PlanFeatureKey;
  label: string;
}

export function planFeatureList(features: Record<string, unknown>): PlanFeatureItem[] {
  return PLAN_FEATURES.filter((feature) => features[feature.key] === true).map(({ key, label }) => ({ key, label }));
}

export function parsePlanFeature(value: string | string[] | undefined): PlanFeatureKey | null {
  if (typeof value !== "string") return null;
  return PLAN_FEATURES.find((feature) => feature.key === value)?.key ?? null;
}
