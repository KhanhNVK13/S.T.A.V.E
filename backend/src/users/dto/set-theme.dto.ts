import { IsIn } from 'class-validator';

/**
 * Danh sách preset hợp lệ — phải khớp đúng các khối `[data-theme="…"]` khai
 * trong `frontend/app/globals.css`. Thêm preset mới thì sửa cả hai nơi.
 */
export const PRESET_THEME_KEYS = ['unleashed', 'moss', 'claret'] as const;
export type PresetThemeKey = (typeof PRESET_THEME_KEYS)[number];

/** UC-78: chọn preset theme (miễn phí cho mọi gói). */
export class SetThemeDto {
  @IsIn(PRESET_THEME_KEYS, {
    message: `presetKey must be one of: ${PRESET_THEME_KEYS.join(', ')}`,
  })
  presetKey!: PresetThemeKey;
}
