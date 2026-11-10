// Theme tạo từ ảnh (UC-79) — hợp đồng dùng chung giữa frontend và backend.
//
// BR-90: một theme chỉ được đổi màu TRANG TRÍ. Các màu mang ý nghĩa hệ
// thống (`--accent*`, `--success*`, `--warning*`, `--danger*`) không bao giờ
// nằm trong palette do người dùng tạo.

/**
 * Đúng 10 biến trang trí được phép ghi đè. Thêm/bớt ở đây thì phải sửa cùng
 * lúc `frontend/lib/theme-from-image.ts` (hằng `PALETTE_KEYS`) và bảng
 * `THEME_REFERENCE_TOKENS` ở đó.
 */
export const PALETTE_KEYS = [
  "--background",
  "--surface",
  "--surface-subtle",
  "--surface-muted",
  "--foreground",
  "--muted-foreground",
  "--border",
  "--border-strong",
  "--metal",
  "--metal-muted",
] as const;

export type PaletteKey = (typeof PALETTE_KEYS)[number];

/** Bảng màu đầy đủ 10 biến, dùng cho cả kiểm tra lẫn ghi DB. */
export type Palette = Record<PaletteKey, string>;

/**
 * Biểu thức chính quy cho giá trị `oklch(L C H)`.
 *
 * - `L` ∈ [0, 1] — độ sáng.
 * - `C` ∈ [0, 0.4] — độ bão hoà.
 * - `H` ∈ [0, 360) — sắc độ, được phép ghi `none` (màu không có sắc độ).
 *
 * Cố ý KHÔNG cho phép `none` cho L/C và không cho phép số âm, phần thập phân
 * thừa, `calc(...)`, `var(...)` hay bất kỳ hàm CSS nào khác — đây là ranh giới
 * chống chèn CSS (BR-91).
 */
export const OKLCH_STRICT_REGEX =
  /^oklch\(\s*(0(?:\.\d{1,4})?|1(?:\.0{1,4})?)\s+(0(?:\.\d{1,4})?|0\.\d{1,4}|0\.4(?:0{1,3})?)\s+(none|(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?)\s*\)$/;

/**
 * Kiểm tra 1 giá trị đơn lẻ có đúng định dạng OKLCH hợp lệ không.
 *
 * Regex đã chặt về cú pháp, nhưng khoảng giá trị của `H` cần kiểm tra riêng:
 * regex cho phép `359.99` (đúng) nhưng cũng phải loại `360` và `360.5`.
 */
export function isValidOklch(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = OKLCH_STRICT_REGEX.exec(value);
  if (!match) return false;

  const lightness = Number(match[1]);
  const chroma = Number(match[2]);
  const hue = match[3];

  if (!Number.isFinite(lightness) || lightness < 0 || lightness > 1) return false;
  if (!Number.isFinite(chroma) || chroma < 0 || chroma > 0.4) return false;
  if (hue !== "none") {
    const h = Number(hue);
    if (!Number.isFinite(h) || h < 0 || h >= 360) return false;
  }
  return true;
}

/**
 * Kiểm tra 1 bảng màu có đúng 10 khóa hợp lệ, không thừa không thiếu, và mọi
 * giá trị đều là OKLCH hợp lệ không.
 */
export function isValidPalette(palette: unknown): palette is Palette {
  if (!palette || typeof palette !== "object" || Array.isArray(palette)) {
    return false;
  }
  const entries = Object.entries(palette as Record<string, unknown>);
  if (entries.length !== PALETTE_KEYS.length) return false;

  const allowed = new Set<string>(PALETTE_KEYS);
  for (const [key, value] of entries) {
    if (!allowed.has(key)) return false;
    if (!isValidOklch(value)) return false;
  }
  return PALETTE_KEYS.every((key) => key in (palette as Record<string, unknown>));
}

/** Theme đang áp dụng — `preset` là preset có sẵn, `custom` là palette từ ảnh. */
export type ThemeType = "preset" | "custom";

/**
 * GET /themes/me/effective
 *
 * Khi `type = 'custom'` mà `hasPaidAccess = false` (hết hạn gói trả phí), vẫn
 * TRẢ về `palette` — client tự quyết định có áp hay không. Backend KHÔNG
 * được xoá `generated_palette` để khôi phục được khi đăng ký lại (BR-89).
 */
export interface EffectiveTheme {
  type: ThemeType | null;
  presetKey: string | null;
  palette: Record<string, string> | null;
  hasPaidAccess: boolean;
}

/** PUT /themes/me/custom */
export interface SaveCustomThemeRequest {
  palette: Record<string, string>;
}

export interface SaveCustomThemeResponse {
  type: "custom";
  palette: Record<string, string>;
}
