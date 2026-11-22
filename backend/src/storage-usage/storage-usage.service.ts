import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StorageCategoryUsage, StorageUsage } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import { MAX_SOUND_SIZE_BYTES } from '../custom-sounds/dto/create-upload-url.dto';
import { MAX_SKETCH_SIZE_BYTES } from '../audio-sketches/dto/create-upload-url.dto';
import { SubscriptionsService } from '../billing/subscriptions.service';
import { extraStorageBytes } from '../billing/storage-quota';
import {
  AVATARS_BUCKET,
  AVATAR_MAX_BYTES,
} from '../common/utils/avatar-storage.util';

const SKETCH_ROW_LIMIT = 5000;
const AVATAR_LIST_LIMIT = 100;

@Injectable()
export class StorageUsageService {
  private readonly logger = new Logger(StorageUsageService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly customSounds: CustomSoundsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async getForUser(userId: string): Promise<StorageUsage> {
    const [sounds, sketches, avatar, effective] = await Promise.all([
      this.customSoundUsage(userId),
      this.audioSketchUsage(userId),
      this.avatarUsage(userId),
      this.subscriptions.getEffective(userId),
    ]);
    return {
      categories: [sounds, sketches, avatar],
      plan: {
        name: effective.plan.name,
        extraStorageBytes: extraStorageBytes(effective.plan.features),
      },
    };
  }

  private async customSoundUsage(
    userId: string,
  ): Promise<StorageCategoryUsage> {
    const [usedBytes, quotaBytes, counted] = await Promise.all([
      this.customSounds.getUsedBytes(userId),
      this.customSounds.getQuotaBytes(userId),
      this.supabase
        .from('custom_sounds')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .is('deleted_at', null),
    ]);
    if (counted.error) {
      this.logger.error(
        `Could not count custom sounds: ${counted.error.message}`,
      );
      throw new InternalServerErrorException('Could not load storage usage');
    }
    return {
      key: 'custom_sounds',
      usedBytes,
      count: counted.count ?? 0,
      quotaBytes,
      maxFileBytes: MAX_SOUND_SIZE_BYTES,
    };
  }

  private async audioSketchUsage(
    userId: string,
  ): Promise<StorageCategoryUsage> {
    const { data, error } = await this.supabase
      .from('audio_sketches')
      .select('size_bytes')
      .eq('created_by', userId)
      .limit(SKETCH_ROW_LIMIT)
      .returns<{ size_bytes: number }[]>();
    if (error) {
      this.logger.error(`Could not read audio sketches: ${error.message}`);
      throw new InternalServerErrorException('Could not load storage usage');
    }
    const rows = data ?? [];
    return {
      key: 'audio_sketches',
      usedBytes: rows.reduce((sum, row) => sum + Number(row.size_bytes), 0),
      count: rows.length,
      quotaBytes: null,
      maxFileBytes: MAX_SKETCH_SIZE_BYTES,
    };
  }

  private async avatarUsage(userId: string): Promise<StorageCategoryUsage> {
    const { data, error } = await this.supabase.storage
      .from(AVATARS_BUCKET)
      .list(userId, { limit: AVATAR_LIST_LIMIT });
    if (error) {
      this.logger.error(`Could not list avatars: ${error.message}`);
      throw new InternalServerErrorException('Could not load storage usage');
    }
    const files = (data ?? []).filter((file) => file.id !== null);
    const usedBytes = files.reduce((sum, file) => {
      const size = Number(
        (file.metadata as { size?: unknown } | null)?.size ?? 0,
      );
      return sum + (Number.isFinite(size) ? size : 0);
    }, 0);
    return {
      key: 'avatar',
      usedBytes,
      count: files.length,
      quotaBytes: null,
      maxFileBytes: AVATAR_MAX_BYTES,
    };
  }
}
