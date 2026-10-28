import { Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

export const AVATARS_BUCKET = 'avatars';
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const logger = new Logger('AvatarStorage');

export async function purgeUserAvatars(
  supabase: SupabaseClient,
  userId: string,
  keepFileName?: string,
): Promise<void> {
  try {
    const { data: files, error } = await supabase.storage
      .from(AVATARS_BUCKET)
      .list(userId, { limit: 100 });
    if (error) {
      logger.error(`Could not list avatars of ${userId}: ${error.message}`);
      return;
    }
    const stale = (files ?? [])
      .map((file) => file.name)
      .filter((name) => name !== keepFileName)
      .map((name) => `${userId}/${name}`);
    if (stale.length === 0) return;
    const { error: removeError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .remove(stale);
    if (removeError) {
      logger.error(
        `Could not remove avatars of ${userId}: ${removeError.message}`,
      );
    }
  } catch (err) {
    logger.error(`Avatar cleanup failed for ${userId}: ${String(err)}`);
  }
}
