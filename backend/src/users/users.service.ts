import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { PresetThemeKey } from './dto/set-theme.dto';
import type { UserRow } from './user-row.type';

/** 1 dòng của bảng `themes` (cột thật, đã tra `information_schema`). */
interface ThemeRow {
  id: string;
  user_id: string;
  type: 'preset' | 'custom';
  preset_key: string | null;
  generated_palette: Record<string, string> | null;
  created_at: string;
}

/** Theme đang áp dụng của 1 người dùng; `null` = chưa chọn (dùng mặc định). */
export interface ActiveTheme {
  type: 'preset' | 'custom';
  presetKey: string | null;
  generatedPalette: Record<string, string> | null;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  /** UC-14 */
  async getProfile(userId: string): Promise<UserRow> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle<UserRow>();

    if (error || !data) throw new NotFoundException('Profile not found');
    return data;
  }

  /** UC-15 */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserRow> {
    const patch: Record<string, string> = {};
    if (dto.displayName !== undefined) patch.display_name = dto.displayName;
    if (dto.username !== undefined) patch.username = dto.username;
    if (dto.bio !== undefined) patch.bio = dto.bio;
    if (dto.avatarUrl !== undefined) patch.avatar_url = dto.avatarUrl;

    const { data, error } = await this.supabase
      .from('users')
      .update(patch)
      .eq('id', userId)
      .select('*')
      .single<UserRow>();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException('Username already taken');
      }
      throw new BadRequestException('Could not update profile');
    }
    return data;
  }

  /**
   * UC-78 — đọc theme đang áp dụng của tài khoản.
   *
   * `users.active_theme_id` trỏ tới 1 dòng của bảng `themes`; chưa chọn bao giờ
   * thì cột đó NULL và API trả `null` để client dùng preset mặc định.
   */
  async getActiveTheme(userId: string): Promise<ActiveTheme | null> {
    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('active_theme_id')
      .eq('id', userId)
      .maybeSingle<{ active_theme_id: string | null }>();

    if (userError || !user) throw new NotFoundException('Profile not found');
    if (!user.active_theme_id) return null;

    const { data: theme } = await this.supabase
      .from('themes')
      .select('*')
      .eq('id', user.active_theme_id)
      .maybeSingle<ThemeRow>();

    if (!theme) return null;
    return {
      type: theme.type,
      presetKey: theme.preset_key,
      generatedPalette: theme.generated_palette,
    };
  }

  /**
   * UC-78 — lưu preset theme vào tài khoản (POST-3: bền qua mọi thiết bị/phiên).
   *
   * Mỗi người dùng chỉ giữ ĐÚNG 1 dòng `themes` kiểu `preset` và cập nhật lại
   * dòng đó, thay vì thêm dòng mới mỗi lần đổi theme — nếu không bảng sẽ phình
   * ra vô hạn theo số lần bấm. (Bảng không có unique constraint nào để dựa vào,
   * nên phải tự tìm-rồi-ghi ở đây.)
   */
  async setPresetTheme(
    userId: string,
    presetKey: PresetThemeKey,
  ): Promise<ActiveTheme> {
    const { data: existing } = await this.supabase
      .from('themes')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'preset')
      .maybeSingle<{ id: string }>();

    let themeId: string;

    if (existing) {
      const { error } = await this.supabase
        .from('themes')
        .update({ preset_key: presetKey })
        .eq('id', existing.id);
      if (error) throw new BadRequestException('Could not save theme');
      themeId = existing.id;
    } else {
      const { data: inserted, error } = await this.supabase
        .from('themes')
        .insert({ user_id: userId, type: 'preset', preset_key: presetKey })
        .select('id')
        .single<{ id: string }>();
      if (error || !inserted)
        throw new BadRequestException('Could not save theme');
      themeId = inserted.id;
    }

    const { error: linkError } = await this.supabase
      .from('users')
      .update({ active_theme_id: themeId })
      .eq('id', userId);
    if (linkError) throw new BadRequestException('Could not apply theme');

    return { type: 'preset', presetKey, generatedPalette: null };
  }
}
