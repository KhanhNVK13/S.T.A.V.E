// Billing (UC-73..77, 104..108) — shapes shared with `backend/src/billing/`.
export const PLAN_FEATURES = [
  { key: "theme_from_image", label: "Theme tạo từ ảnh" },
  { key: "extra_storage", label: "Tăng dung lượng lưu trữ" },
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURES)[number]["key"];
