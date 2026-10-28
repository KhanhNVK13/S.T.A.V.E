import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { AudioSketchesService } from '../audio-sketches/audio-sketches.service';
import { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import { purgeUserAvatars } from '../common/utils/avatar-storage.util';

@Injectable()
export class AccountRemovalService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly audioSketches: AudioSketchesService,
    private readonly customSounds: CustomSoundsService,
  ) {}

  async remove(
    userId: string,
    failureMessage: string,
    afterRecordsDeleted?: () => Promise<void>,
  ): Promise<void> {
    const { error: revokeError } = await this.supabase
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);
    if (revokeError) {
      throw new InternalServerErrorException(failureMessage);
    }

    const { data: ownedProjects, error: ownedProjectsError } =
      await this.supabase.from('projects').select('id').eq('owner_id', userId);
    if (ownedProjectsError) {
      throw new InternalServerErrorException(failureMessage);
    }
    const ownedProjectIds = (ownedProjects ?? []).map(
      (p: { id: string }) => p.id,
    );

    const { error: authDeleteError } =
      await this.supabase.auth.admin.deleteUser(userId);
    if (authDeleteError && authDeleteError.status !== 404) {
      throw new InternalServerErrorException(failureMessage);
    }

    const { error: deleteError } = await this.supabase
      .from('users')
      .delete()
      .eq('id', userId);
    if (deleteError) {
      throw new InternalServerErrorException(failureMessage);
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
