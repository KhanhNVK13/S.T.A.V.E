import { Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listStorageFolder, removeStorageFiles } from './storage-cleanup.util';

export const AVATARS_BUCKET = 'avatars';
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const logger = new Logger('AvatarStorage');

export async function purgeUserAvatars(
  supabase: SupabaseClient,
  userId: string,
  keepFileName?: string,
): Promise<void> {
  try {
    const names = await listStorageFolder(supabase, AVATARS_BUCKET, userId);
    const stale = names
      .filter((name) => name !== keepFileName)
      .map((name) => `${userId}/${name}`);
    await removeStorageFiles(supabase, AVATARS_BUCKET, stale, logger);
  } catch (err) {
    logger.error(
      `Could not list avatars of ${userId}, old files may remain: ${String(err)}`,
    );
  }
}
