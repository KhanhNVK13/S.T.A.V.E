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

/**
 * Preset trang trí miễn phí (UC-78). `space` là giao diện mặc định trong
 * `globals.css` nên không có palette; các khoá còn lại chỉ ghi đè đúng 10 biến
 * `PALETTE_KEYS`, giữ nguyên độ sáng và độ bão hoà của mặc định, chỉ đổi sắc độ.
 */
export const THEME_PRESET_KEYS = ["space", "unleashed", "moss", "claret", "tide"] as const;
export type ThemePresetKey = (typeof THEME_PRESET_KEYS)[number];

export const THEME_PRESET_PALETTES: Record<Exclude<ThemePresetKey, "space">, Palette> = {
  moss: {
    "--background": "oklch(0.14 0.022 160)",
    "--surface": "oklch(0.19 0.03 160)",
    "--surface-subtle": "oklch(0.23 0.035 160)",
    "--surface-muted": "oklch(0.25 0.04 160)",
    "--foreground": "oklch(0.95 0.012 160)",
    "--muted-foreground": "oklch(0.83 0.03 160)",
    "--border": "oklch(0.34 0.04 160)",
    "--border-strong": "oklch(0.54 0.05 160)",
    "--metal": "oklch(0.82 0.07 95)",
    "--metal-muted": "oklch(0.24 0.03 95)",
  },
  claret: {
    "--background": "oklch(0.14 0.022 10)",
    "--surface": "oklch(0.19 0.03 10)",
    "--surface-subtle": "oklch(0.23 0.035 10)",
    "--surface-muted": "oklch(0.25 0.04 10)",
    "--foreground": "oklch(0.95 0.012 10)",
    "--muted-foreground": "oklch(0.83 0.03 10)",
    "--border": "oklch(0.34 0.04 10)",
    "--border-strong": "oklch(0.54 0.05 10)",
    "--metal": "oklch(0.82 0.07 60)",
    "--metal-muted": "oklch(0.24 0.03 60)",
  },
  unleashed: {
    "--background": "oklch(0.14 0.022 55)",
    "--surface": "oklch(0.19 0.03 55)",
    "--surface-subtle": "oklch(0.23 0.035 55)",
    "--surface-muted": "oklch(0.25 0.04 55)",
    "--foreground": "oklch(0.95 0.012 55)",
    "--muted-foreground": "oklch(0.83 0.03 55)",
    "--border": "oklch(0.34 0.04 55)",
    "--border-strong": "oklch(0.54 0.05 55)",
    "--metal": "oklch(0.82 0.07 78)",
    "--metal-muted": "oklch(0.24 0.03 78)",
  },
  tide: {
    "--background": "oklch(0.14 0.022 215)",
    "--surface": "oklch(0.19 0.03 215)",
    "--surface-subtle": "oklch(0.23 0.035 215)",
    "--surface-muted": "oklch(0.25 0.04 215)",
    "--foreground": "oklch(0.95 0.012 215)",
    "--muted-foreground": "oklch(0.83 0.03 215)",
    "--border": "oklch(0.34 0.04 215)",
    "--border-strong": "oklch(0.54 0.05 215)",
    "--metal": "oklch(0.82 0.07 175)",
    "--metal-muted": "oklch(0.24 0.03 175)",
  },
};

/** Palette của preset, hoặc null nếu là mặc định/khoá lạ (khi đó không áp gì). */
export function getPresetPalette(key: string | null | undefined): Palette | null {
  if (!key || !Object.prototype.hasOwnProperty.call(THEME_PRESET_PALETTES, key)) return null;
  return THEME_PRESET_PALETTES[key as keyof typeof THEME_PRESET_PALETTES];
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
  /** Có palette tạo từ ảnh đã lưu (kể cả khi đang dùng preset). */
  hasSavedCustom?: boolean;
}

/** PUT /themes/me/custom/activate — dùng lại palette từ ảnh đã lưu. */
export interface ActivateCustomThemeResponse {
  type: "custom";
  palette: Record<string, string>;
}

/** PUT /themes/me/custom */
export interface SaveCustomThemeRequest {
  palette: Record<string, string>;
}

export interface SaveCustomThemeResponse {
  type: "custom";
  palette: Record<string, string>;
}
