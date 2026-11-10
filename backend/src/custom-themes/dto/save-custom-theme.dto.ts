import { IsObject } from 'class-validator';
import { isValidPalette } from '@stave/shared-types';

/**
 * UC-79 — lưu palette theme tạo từ ảnh.
 *
 * Palette được kiểm bằng validator dùng chung `isValidPalette` trong
 * `shared-types` — cùng một bộ quy tắc với frontend, nên không thể lệch.
 *
 * Validator này CHẶN:
 * - thiếu/thừa khoá (đúng 10 khoá trang trí);
 * - giá trị không phải `oklch(L C H)` hợp lệ (chặn CSS injection: `;`, `}`,
 *   `!important`, `var(`, `url(`, `expression(`, `@import`…);
 * - khoá không cho phép (`--accent`, `--color-primary`…).
 */
export class SaveCustomThemeDto {
  @IsObject()
  palette!: Record<string, string>;
}

/**
 * Kiểm tra payload palette. Trả về danh sách lỗi (rỗng = hợp lệ).
 *
 * Dùng trong pipe để chặn ở biên, và dùng lại trong unit test.
 */
export function validatePalettePayload(
  payload: unknown,
): { ok: true } | { ok: false; reason: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'palette must be an object' };
  }
  const palette = (payload as Record<string, unknown>).palette;
  if (!palette || typeof palette !== 'object' || Array.isArray(palette)) {
    return { ok: false, reason: 'palette must be an object' };
  }
  if (!isValidPalette(palette)) {
    return {
      ok: false,
      reason:
        'palette must contain exactly the 10 allowed CSS variables with valid oklch(L C H) values',
    };
  }
  return { ok: true };
}
