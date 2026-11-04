import type { Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

export const STORAGE_REMOVE_ATTEMPTS = 3;
const STORAGE_REMOVE_RETRY_DELAY_MS = 250;
const STORAGE_REMOVE_CHUNK = 100;
const STORAGE_LIST_PAGE = 1000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String(err.message);
  }
  return String(err);
}

/**
 * Lists every file name directly under `folder`, page by page. Throws when a
 * page cannot be read so the caller never mistakes a partial list for all of it.
 */
export async function listStorageFolder(
  supabase: SupabaseClient,
  bucket: string,
  folder: string,
): Promise<string[]> {
  const names: string[] = [];
  for (let offset = 0; ; offset += STORAGE_LIST_PAGE) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, {
      limit: STORAGE_LIST_PAGE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(messageOf(error));
    const page = data ?? [];
    names.push(...page.map((file) => file.name));
    if (page.length < STORAGE_LIST_PAGE) return names;
  }
}

/**
 * Removes files, retrying each batch a few times. Batches that still fail are
 * logged with their full paths (so they can be cleaned by hand) and returned.
 */
export async function removeStorageFiles(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
  logger: Logger,
): Promise<string[]> {
  const failed: string[] = [];
  for (let i = 0; i < paths.length; i += STORAGE_REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + STORAGE_REMOVE_CHUNK);
    let lastError = '';
    let removed = false;
    for (let attempt = 1; attempt <= STORAGE_REMOVE_ATTEMPTS; attempt++) {
      try {
        const { error } = await supabase.storage.from(bucket).remove(chunk);
        if (!error) {
          removed = true;
          break;
        }
        lastError = messageOf(error);
      } catch (err) {
        lastError = messageOf(err);
      }
      if (attempt < STORAGE_REMOVE_ATTEMPTS) {
        await wait(STORAGE_REMOVE_RETRY_DELAY_MS * attempt);
      }
    }
    if (!removed) {
      failed.push(...chunk);
      logger.error(
        `Orphaned files in bucket "${bucket}" after ${STORAGE_REMOVE_ATTEMPTS} attempts, remove them manually: ${chunk.join(', ')} (${lastError})`,
      );
    }
  }
  return failed;
}
