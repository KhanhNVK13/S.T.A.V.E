import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { AudioSketchesService } from '../audio-sketches/audio-sketches.service';
import { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import { purgeUserAvatars } from '../common/utils/avatar-storage.util';

const REMOVAL_BAN = '87600h';

@Injectable()
export class AccountRemovalService {
  private readonly logger = new Logger(AccountRemovalService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly audioSketches: AudioSketchesService,
    private readonly customSounds: CustomSoundsService,
  ) {}

  /**
   * Thứ tự: khoá đăng nhập (đảo ngược được) → xoá hồ sơ → xoá hẳn tài khoản
   * Auth. Xoá hồ sơ lỗi thì gỡ khoá (nếu trước đó chưa bị khoá) để người dùng
   * không mất đăng nhập mà hồ sơ còn nguyên.
   */
  async remove(
    userId: string,
    failureMessage: string,
    afterRecordsDeleted?: () => Promise<void>,
  ): Promise<void> {
    const fail = () => new InternalServerErrorException(failureMessage);

    const { data: authData, error: authReadError } =
      await this.supabase.auth.admin.getUserById(userId);
    const authMissing = authReadError?.status === 404;
    if (authReadError && !authMissing) throw fail();
    const bannedUntil = authData?.user?.banned_until;
    const wasBanned = !!bannedUntil && new Date(bannedUntil) > new Date();

    const { error: revokeError } = await this.supabase
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);
    if (revokeError) throw fail();

    const { data: ownedProjects, error: ownedProjectsError } =
      await this.supabase.from('projects').select('id').eq('owner_id', userId);
    if (ownedProjectsError) throw fail();
    const ownedProjectIds = (ownedProjects ?? []).map(
      (p: { id: string }) => p.id,
    );

    if (!authMissing) {
      const { error: banError } = await this.supabase.auth.admin.updateUserById(
        userId,
        {
          ban_duration: REMOVAL_BAN,
        },
      );
      if (banError && banError.status !== 404) throw fail();
    }

    const { error: deleteError } = await this.supabase
      .from('users')
      .delete()
      .eq('id', userId);
    if (deleteError) {
      if (!authMissing && !wasBanned) {
        const { error: unbanError } =
          await this.supabase.auth.admin.updateUserById(userId, {
            ban_duration: 'none',
          });
        if (unbanError) {
          this.logger.error(
            `Could not lift the removal ban of ${userId} after a failed profile delete: ${unbanError.message}`,
          );
        }
      }
      throw fail();
    }

    if (!authMissing) {
      const { error: authDeleteError } =
        await this.supabase.auth.admin.deleteUser(userId);
      if (authDeleteError && authDeleteError.status !== 404) {
        this.logger.error(
          `Profile of ${userId} was deleted but its banned auth account remains: ${authDeleteError.message}`,
        );
      }
    }

    try {
      await afterRecordsDeleted?.();
    } finally {
      await this.audioSketches.purgeProjectFiles(ownedProjectIds);
      await this.customSounds.removeAllFilesOf(userId);
      await this.customSounds.collectGarbage();
      await purgeUserAvatars(this.supabase, userId);
    }
  }
}
