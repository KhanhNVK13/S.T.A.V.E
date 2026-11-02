import { Injectable, Inject } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';

/**
 * UC-109 (foundation): reads `platform_settings` (key: unique, value: jsonb)
 * with a 30s in-memory cache. Exported so other modules can rely on it.
 *
 * `value` holds a JSON-encoded payload. For scalar settings (e.g.
 * `custom_sound_quota_bytes` = 52428800) the jsonb is the scalar itself.
 */
@Injectable()
export class PlatformSettingsService {
  private static readonly CACHE_TTL_MS = 30_000;
  private readonly cache = new Map<string, { value: unknown; at: number }>();

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  /**
   * Read a single setting, caching for 30s. Returns `fallback` when the key
   * has no row or the DB errors (fail-open to the default, per BR-89 spirit:
   * a settings read must never take the feature down).
   */
  async get<T>(key: string, fallback: T): Promise<T> {
    const cached = this.cache.get(key);
    if (
      cached &&
      Date.now() - cached.at < PlatformSettingsService.CACHE_TTL_MS
    ) {
      return (cached.value ?? fallback) as T;
    }

    const { data, error } = await this.supabase
      .from('platform_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) return fallback;

    const value = data === null ? null : data.value;
    this.cache.set(key, { value, at: Date.now() });
    return (value ?? fallback) as T;
  }

  /** Drop a cached value (call after upserting). Missing keys no-op. */
  invalidate(key: string): void {
    this.cache.delete(key);
  }
}
