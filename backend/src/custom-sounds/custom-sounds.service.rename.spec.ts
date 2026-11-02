import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { CustomSoundsService } from './custom-sounds.service';

const ownerId = '11111111-1111-4111-8111-111111111111';
const soundId = '22222222-2222-4222-8222-222222222222';

function row(name: string) {
  return {
    id: soundId,
    owner_id: ownerId,
    name,
    file_url: `${ownerId}/${soundId}.wav`,
    duration_sec: 1,
    size_bytes: 100,
    source: 'uploaded',
    created_at: '2026-10-28T00:00:00Z',
    deleted_at: null,
  };
}

function makeService(
  result: { data: unknown; error?: unknown },
  signed = { data: { signedUrl: 'https://x/y.wav' }, error: null },
) {
  const mock = createSupabaseMock([], {
    tables: { custom_sounds: [result] },
    storage: { 'custom-sounds': { createSignedUrl: [signed] } },
  });
  return { service: new CustomSoundsService(mock.client), ...mock };
}

describe('CustomSoundsService.rename', () => {
  it('renames only a live sound of the caller and trims control characters', async () => {
    const { service, builders } = makeService({ data: row('Kick') });
    const result = await service.rename(ownerId, soundId, '  Ki\u0000ck  ');
    expect(result.name).toBe('Kick');
    expect(builders.custom_sounds.update).toHaveBeenCalledWith({
      name: 'Kick',
    });
    expect(builders.custom_sounds.eq).toHaveBeenCalledWith('owner_id', ownerId);
    expect(builders.custom_sounds.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('refuses a name that is empty after cleaning', async () => {
    const { service } = makeService({ data: row('Kick') });
    await expect(
      service.rename(ownerId, soundId, ' \u0001 '),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers not found for someone else’s or a deleted sound', async () => {
    const { service } = makeService({ data: null });
    await expect(
      service.rename(ownerId, soundId, 'Snare'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
