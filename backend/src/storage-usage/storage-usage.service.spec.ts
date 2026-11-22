import { InternalServerErrorException } from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { StorageUsageService } from './storage-usage.service';
import type { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import type { SubscriptionsService } from '../billing/subscriptions.service';

const USER = '11111111-1111-4111-8111-111111111111';
const MB = 1024 * 1024;

function build(
  overrides: {
    sketches?: { data?: unknown; error?: unknown };
    avatars?: { data?: unknown; error?: unknown };
    soundCount?: { count?: number; error?: unknown };
    features?: Record<string, unknown>;
  } = {},
) {
  const mock = createSupabaseMock([], {
    tables: {
      custom_sounds: [
        {
          data: null,
          count: overrides.soundCount?.count ?? 3,
          error: overrides.soundCount?.error ?? null,
        },
      ],
      audio_sketches: [
        overrides.sketches ?? {
          data: [{ size_bytes: 4 * MB }, { size_bytes: 6 * MB }],
          error: null,
        },
      ],
    },
    storage: {
      avatars: {
        list: [
          overrides.avatars ?? {
            data: [{ id: 'f1', name: 'a.png', metadata: { size: 300000 } }],
            error: null,
          },
        ],
      },
    },
  });
  const customSounds = {
    getUsedBytes: jest.fn().mockResolvedValue(12 * MB),
    getQuotaBytes: jest.fn().mockResolvedValue(50 * MB),
  };
  const subscriptions = {
    getEffective: jest.fn().mockResolvedValue({
      plan: { name: 'STAVE+', features: overrides.features ?? {} },
    }),
  };
  const service = new StorageUsageService(
    mock.client,
    customSounds as unknown as CustomSoundsService,
    subscriptions as unknown as SubscriptionsService,
  );
  return { service, customSounds };
}

describe('BE-STO-01 StorageUsageService.getForUser', () => {
  it('UTCID01 reports sounds, sketches and avatar with their limits', async () => {
    const { service, customSounds } = build();
    const usage = await service.getForUser(USER);

    expect(customSounds.getQuotaBytes).toHaveBeenCalledWith(USER);
    expect(usage.categories.map((c) => c.key)).toEqual([
      'custom_sounds',
      'audio_sketches',
      'avatar',
    ]);
    expect(usage.categories[0]).toMatchObject({
      usedBytes: 12 * MB,
      count: 3,
      quotaBytes: 50 * MB,
      maxFileBytes: 10 * MB,
    });
    expect(usage.categories[1]).toMatchObject({
      usedBytes: 10 * MB,
      count: 2,
      quotaBytes: null,
      maxFileBytes: 20 * MB,
    });
    expect(usage.categories[2]).toMatchObject({
      usedBytes: 300000,
      count: 1,
      quotaBytes: null,
      maxFileBytes: 2 * MB,
    });
  });

  it('UTCID02 shows the extra storage that comes with the plan', async () => {
    const { service } = build({ features: { extra_storage_mb: 2048 } });
    const usage = await service.getForUser(USER);
    expect(usage.plan).toEqual({
      name: 'STAVE+',
      extraStorageBytes: 2048 * MB,
    });
  });

  it('UTCID03 no sketches and no avatar report zero, not an error', async () => {
    const { service } = build({
      sketches: { data: [], error: null },
      avatars: { data: [], error: null },
    });
    const usage = await service.getForUser(USER);
    expect(usage.categories[1]).toMatchObject({ usedBytes: 0, count: 0 });
    expect(usage.categories[2]).toMatchObject({ usedBytes: 0, count: 0 });
  });

  it('UTCID04 folder placeholders in the avatar list are not counted', async () => {
    const { service } = build({
      avatars: {
        data: [
          { id: null, name: 'folder', metadata: null },
          { id: 'f1', name: 'a.png', metadata: { size: 1000 } },
        ],
        error: null,
      },
    });
    const usage = await service.getForUser(USER);
    expect(usage.categories[2]).toMatchObject({ usedBytes: 1000, count: 1 });
  });

  it('UTCID05 a failed read is an error, never a silent zero', async () => {
    await expect(
      build({
        sketches: { data: null, error: { message: 'boom' } },
      }).service.getForUser(USER),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(
      build({
        avatars: { data: null, error: { message: 'boom' } },
      }).service.getForUser(USER),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(
      build({ soundCount: { error: { message: 'boom' } } }).service.getForUser(
        USER,
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
