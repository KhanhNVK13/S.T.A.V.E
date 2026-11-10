import { apiFetch } from "./api-client";

/** Gói dịch vụ như admin thấy ở trang quản trị. */
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
  subscriberCount: number;
}

export interface AdminPlanCreated {
  plan: AdminPlanItem;
  /** Cảnh báo tính năng trùng với gói Free — không chặn tạo gói. */
  warnings: string[];
}

export interface AdminPlanCreatePayload {
  name: string;
  priceVnd: number;
  features: Record<string, unknown>;
  description?: string;
  status?: "draft" | "active";
}

export function listAdminPlans(): Promise<AdminPlanItem[]> {
  return apiFetch<AdminPlanItem[]>("/admin/plans");
}

export function createAdminPlan(
  payload: AdminPlanCreatePayload,
): Promise<AdminPlanCreated> {
  return apiFetch<AdminPlanCreated>("/admin/plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function changeAdminPlanPrice(
  id: string,
  priceVnd: number,
  effectiveAt: string,
): Promise<AdminPlanItem> {
  return apiFetch<AdminPlanItem>(`/admin/plans/${id}/price`, {
    method: "PATCH",
    body: JSON.stringify({ priceVnd, effectiveAt }),
  });
}

export function setAdminPlanActive(
  id: string,
  active: boolean,
): Promise<AdminPlanItem> {
  return apiFetch<AdminPlanItem>(
    `/admin/plans/${id}/${active ? "activate" : "deactivate"}`,
    { method: "POST" },
  );
}
