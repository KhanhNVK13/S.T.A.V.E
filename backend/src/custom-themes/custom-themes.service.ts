import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SubscriptionsService } from '../billing/subscriptions.service';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type { EffectiveTheme, Palette } from '@stave/shared-types';

/** 1 dòng `themes` (cột thật). */
interface ThemeRow {
  id: string;
  user_id: string;
  type: 'preset' | 'custom';
  preset_key: string | null;
  generated_palette: Palette | null;
  created_at: string;
}

/**
 * UC-79 — theme tạo từ ảnh (STAVE+).
 *
 * Ghi bảng `themes` với `type = 'custom'` và cập nhật `users.active_theme_id`.
 * Không sửa module `users` — chỉ ghi thẳng bảng `users` cho 1 cột (xem
 * team-workload.md trước khi dùng lại pattern này).
 */
@Injectable()
export class CustomThemesService {
  private readonly logger = new Logger(CustomThemesService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /**
   * Lưu palette custom và đặt nó thành theme đang dùng.
   *
   * - Kiểm quyền trả phí; không có → 403.
   * - Upsert MỘT dòng `themes` type `custom` của user (idempotent theo
   *   `user_id` + `type`), rồi `UPDATE users.active_theme_id`.
   */
  async saveCustomTheme(
    userId: string,
    palette: Palette,
  ): Promise<{ type: 'custom'; palette: Palette }> {
    const eff = await this.subscriptions.getEffective(userId);
    if (!eff.hasPaidAccess) {
      throw new ForbiddenException('Paid access required');
    }

    const { data: existing, error: readError } = await this.supabase
      .from('themes')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'custom')
      .maybeSingle<{ id: string }>();

    if (readError) {
      this.logger.error('Failed to read the current custom theme', readError);
      throw new InternalServerErrorException('Could not save theme');
    }

    let themeId: string;
    if (existing) {
      const { error } = await this.supabase
        .from('themes')
        .update({ generated_palette: palette })
        .eq('id', existing.id);
      if (error) throw new InternalServerErrorException('Could not save theme');
      themeId = existing.id;
    } else {
      const { data: inserted, error } = await this.supabase
        .from('themes')
        .insert({ user_id: userId, type: 'custom', generated_palette: palette })
        .select('id')
        .single<{ id: string }>();
      if (error || !inserted) {
        throw new InternalServerErrorException('Could not save theme');
      }
      themeId = inserted.id;
    }

    const { error: linkError } = await this.supabase
      .from('users')
      .update({ active_theme_id: themeId })
      .eq('id', userId);
    if (linkError) {
      this.logger.error('Failed to link active theme', linkError);
      throw new InternalServerErrorException('Could not apply theme');
    }

    return { type: 'custom', palette };
  }

  /**
   * Theme đang áp dụng + quyền trả phí (BR-89).
   *
   * - `users.active_theme_id = NULL` → `{ type: null, presetKey: null,
   *   palette: null }`.
   * - Preset hiện hành → `type: 'preset'`, trả `presetKey`.
   * - Custom hiện hành → `type: 'custom'`, trả `palette`. **KHÔNG** xoá
   *   `generated_palette` khi user hết hạn — front tự quyết định có áp hay
   *   không.
   */
  async getEffectiveTheme(userId: string): Promise<EffectiveTheme> {
    const eff = await this.subscriptions.getEffective(userId);

    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('active_theme_id')
      .eq('id', userId)
      .maybeSingle<{ active_theme_id: string | null }>();

    if (userError) {
      this.logger.error('Failed to read the account theme link', userError);
      throw new InternalServerErrorException('Could not read your account');
    }
    if (!user) {
      throw new InternalServerErrorException('Could not read your account');
    }
    if (!user.active_theme_id) {
      return {
        type: null,
        presetKey: null,
        palette: null,
        hasPaidAccess: eff.hasPaidAccess,
      };
    }

    const { data: theme } = await this.supabase
      .from('themes')
      .select('*')
      .eq('id', user.active_theme_id)
      .maybeSingle<ThemeRow>();

    if (!theme) {
      return {
        type: null,
        presetKey: null,
        palette: null,
        hasPaidAccess: eff.hasPaidAccess,
      };
    }

    if (theme.type === 'custom') {
      return {
        type: 'custom',
        presetKey: null,
        palette: theme.generated_palette,
        hasPaidAccess: eff.hasPaidAccess,
      };
    }

    return {
      type: 'preset',
      presetKey: theme.preset_key,
      palette: null,
      hasPaidAccess: eff.hasPaidAccess,
    };
  }
}
