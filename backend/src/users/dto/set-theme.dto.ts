import { IsIn } from 'class-validator';
import { THEME_PRESET_KEYS, type ThemePresetKey } from '@stave/shared-types';

/**
 * Danh sách preset hợp lệ lấy từ `THEME_PRESET_KEYS` trong
 * `shared-types/src/theme.ts` (nơi giữ bảng màu).
 */
export const PRESET_THEME_KEYS = [...THEME_PRESET_KEYS];
export type PresetThemeKey = ThemePresetKey;

/** UC-78: chọn preset theme (miễn phí cho mọi gói). */
export class SetThemeDto {
  @IsIn(PRESET_THEME_KEYS, {
    message: `presetKey must be one of: ${PRESET_THEME_KEYS.join(', ')}`,
  })
  presetKey!: PresetThemeKey;
}
