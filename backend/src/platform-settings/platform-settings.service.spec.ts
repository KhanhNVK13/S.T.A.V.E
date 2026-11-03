import { PlatformSettingsService } from './platform-settings.service';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';

/**
 * PlatformSettingsService reads `platform_settings` with a 30s in-memory
 * cache and fails open to the caller's fallback.
 */
describe('BE-PLS-01 PlatformSettingsService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-02'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const row = (
    value: unknown,
    key = 'custom_sound_quota_bytes',
  ): QueryResult => ({
    data: { key, value },
    error: null,
  });

  it('UTCID01 returns the stored value and serves repeat reads from the cache', async () => {
    const mock = createSupabaseMock([], {
      tables: { platform_settings: [row(52_428_800)] },
    });
    const svc = new PlatformSettingsService(mock.client);

    await expect(svc.get('custom_sound_quota_bytes', 0)).resolves.toBe(
      52_428_800,
    );
    // Second read is a cache hit: the mock has no second result queued,
    // so a re-query would throw "ran out of results".
    await expect(svc.get('custom_sound_quota_bytes', 0)).resolves.toBe(
      52_428_800,
    );
    expect(mock.builders.platform_settings.maybeSingle).toHaveBeenCalledTimes(
      1,
    );
  });

  it('UTCID02 re-queries once the 30s cache window has passed', async () => {
    const mock = createSupabaseMock([], {
      tables: { platform_settings: [row(1), row(2)] },
    });
    const svc = new PlatformSettingsService(mock.client);

    await expect(svc.get('k', 0)).resolves.toBe(1);
    jest.advanceTimersByTime(29_999);
    // Still inside the window -> cached.
    await expect(svc.get('k', 0)).resolves.toBe(1);
    jest.advanceTimersByTime(1);
    // 30.000s elapsed -> cache miss, second queued result.
    await expect(svc.get('k', 0)).resolves.toBe(2);
    expect(mock.builders.platform_settings.maybeSingle).toHaveBeenCalledTimes(
      2,
    );
  });

  it('UTCID03 is keyed per setting: two keys are cached and expired independently', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        platform_settings: [
          { data: { key: 'a', value: 'A' }, error: null },
          { data: { key: 'b', value: 'B' }, error: null },
          { data: { key: 'a', value: 'A2' }, error: null },
        ],
      },
    });
    const svc = new PlatformSettingsService(mock.client);

    await expect(svc.get('a', '')).resolves.toBe('A');
    jest.advanceTimersByTime(20_000);
    await expect(svc.get('b', '')).resolves.toBe('B');
    jest.advanceTimersByTime(10_000);
    // t=30s: 'a' (cached at t=0) has expired, 'b' (cached at t=20s) has not.
    await expect(svc.get('a', '')).resolves.toBe('A2');
    await expect(svc.get('b', '')).resolves.toBe('B');
    expect(mock.builders.platform_settings.maybeSingle).toHaveBeenCalledTimes(
      3,
    );
  });

  it('UTCID04 returns the fallback when no row exists for the key', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        platform_settings: [{ data: null, error: null }],
      },
    });
    const svc = new PlatformSettingsService(mock.client);
    await expect(svc.get('missing_key', 'fallback')).resolves.toBe('fallback');
  });

  it('UTCID05 returns the fallback when the stored value is JSON null', async () => {
    const mock = createSupabaseMock([], {
      tables: { platform_settings: [row(null)] },
    });
    const svc = new PlatformSettingsService(mock.client);
    await expect(svc.get('custom_sound_quota_bytes', 7)).resolves.toBe(7);
  });

  it('UTCID06 fails open on a DB error without caching the error', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        platform_settings: [
          { data: null, error: { message: 'postgres down' } },
          row(42),
        ],
      },
    });
    const svc = new PlatformSettingsService(mock.client);

    await expect(svc.get('k', 9)).resolves.toBe(9);
    await expect(svc.get('k', 9)).resolves.toBe(42);
    expect(mock.builders.platform_settings.maybeSingle).toHaveBeenCalledTimes(
      2,
    );
  });

  it('UTCID07 invalidates a single key so the next read re-queries', async () => {
    const mock = createSupabaseMock([], {
      tables: { platform_settings: [row(1), row(2), row(3)] },
    });
    const svc = new PlatformSettingsService(mock.client);

    await expect(svc.get('k', 0)).resolves.toBe(1);
    svc.invalidate('k');
    // No timer advance: the fresh read must still hit the DB.
    await expect(svc.get('k', 0)).resolves.toBe(2);
    expect(mock.builders.platform_settings.maybeSingle).toHaveBeenCalledTimes(
      2,
    );
    // Invalidate is a no-op for keys that were never cached (no re-query).
    svc.invalidate('never-read');
    await expect(svc.get('k', 0)).resolves.toBe(2);
  });

  it('UTCID08 supports structured (jsonb object) values', async () => {
    const payload = { enabled: true, maxPerDay: 5 };
    const mock = createSupabaseMock([], {
      tables: {
        platform_settings: [
          { data: { key: 'feature', value: payload }, error: null },
        ],
      },
    });
    const svc = new PlatformSettingsService(mock.client);
    await expect(
      svc.get<{ enabled: boolean; maxPerDay: number }>('feature', {
        enabled: false,
        maxPerDay: 0,
      }),
    ).resolves.toEqual(payload);
  });
});
