import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import {
  CustomSoundsService,
  CUSTOM_SOUNDS_BUCKET,
  type CustomSoundRow,
} from './custom-sounds.service';

const ownerId = '11111111-1111-4111-8111-111111111111';
const otherOwnerId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const soundId = '44444444-4444-4444-8444-444444444444';
const otherSoundId = '55555555-5555-4555-8555-555555555555';

function makeCustomSound(
  overrides: Partial<CustomSoundRow> = {},
): CustomSoundRow {
  return {
    id: soundId,
    owner_id: ownerId,
    name: 'Kick 01',
    file_url: `${ownerId}/${soundId}.wav`,
    duration_sec: 2,
    size_bytes: 1048576,
    source: 'uploaded',
    created_at: '2026-10-21T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function makeWav(seconds: number, sampleRate = 44100, channels = 1): Buffer {
  const dataBytes = Math.round(seconds * sampleRate) * channels * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * 2, 28); // byteRate
  buf.writeUInt16LE(channels * 2, 32); // blockAlign
  buf.writeUInt16LE(16, 34); // bitsPerSample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

function makeBlob(buffer: Buffer) {
  return {
    arrayBuffer: () =>
      Promise.resolve(
        buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ),
      ),
  };
}

function makeService(
  results: Parameters<typeof createSupabaseMock>[0] = [],
  options: SupabaseMockOptions = {},
) {
  const mock = createSupabaseMock(results, options);
  const service = new CustomSoundsService(mock.client);
  return { service, mock };
}

describe('BE-SND CustomSoundsService', () => {
  describe('BE-SND-04 resolveForProject(userId, projectId, ids)', () => {
    it('UTCID01 resolves playable sound when caller is project owner and sound owner', async () => {
      const row = makeCustomSound({ id: soundId, owner_id: ownerId });
      const { service } = makeService([], {
        tables: {
          projects: [{ data: { owner_id: ownerId, visibility: 'private' } }],
          custom_sounds: [{ data: [row] }],
          sound_mappings: [{ data: [] }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            createSignedUrl: [{ data: { signedUrl: 'https://cdn/kick.wav' } }],
          },
        },
      });

      const res = await service.resolveForProject(ownerId, projectId, [
        soundId,
      ]);
      expect(res).toEqual([
        {
          id: soundId,
          name: 'Kick 01',
          playable: true,
          reason: null,
          playbackUrl: 'https://cdn/kick.wav',
        },
      ]);
    });

    it('UTCID02 resolves playable sound when project is public and sound is referenced in mappings', async () => {
      const row = makeCustomSound({ id: soundId, owner_id: otherOwnerId });
      const { service } = makeService([], {
        tables: {
          projects: [
            { data: { owner_id: otherOwnerId, visibility: 'public' } },
          ],
          custom_sounds: [{ data: [row] }],
          sound_mappings: [{ data: [{ custom_sound_id: soundId }] }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            createSignedUrl: [{ data: { signedUrl: 'https://cdn/sound.wav' } }],
          },
        },
      });

      const res = await service.resolveForProject(ownerId, projectId, [
        soundId,
      ]);
      expect(res).toEqual([
        {
          id: soundId,
          name: 'Kick 01',
          playable: true,
          reason: null,
          playbackUrl: 'https://cdn/sound.wav',
        },
      ]);
    });

    it('UTCID03 resolves playable sound when caller is collaborator on private project', async () => {
      const row = makeCustomSound({ id: soundId, owner_id: ownerId });
      const { service } = makeService([], {
        tables: {
          projects: [
            { data: { owner_id: otherOwnerId, visibility: 'private' } },
          ],
          project_collaborators: [{ data: { permission_level: 'edit' } }],
          custom_sounds: [{ data: [row] }],
          sound_mappings: [{ data: [] }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            createSignedUrl: [{ data: { signedUrl: 'https://cdn/sound.wav' } }],
          },
        },
      });

      const res = await service.resolveForProject(ownerId, projectId, [
        soundId,
      ]);
      expect(res).toEqual([
        {
          id: soundId,
          name: 'Kick 01',
          playable: true,
          reason: null,
          playbackUrl: 'https://cdn/sound.wav',
        },
      ]);
    });

    it('UTCID04 returns empty array when ids is empty', async () => {
      const { service } = makeService([], {
        tables: {
          projects: [{ data: { owner_id: ownerId, visibility: 'private' } }],
        },
      });

      const res = await service.resolveForProject(ownerId, projectId, []);
      expect(res).toEqual([]);
    });

    it('UTCID05 returns missing reason when sound belongs to other user and not referenced', async () => {
      const row = makeCustomSound({ id: soundId, owner_id: otherOwnerId });
      const { service } = makeService([], {
        tables: {
          projects: [{ data: { owner_id: ownerId, visibility: 'private' } }],
          custom_sounds: [{ data: [row] }],
          sound_mappings: [{ data: [] }],
        },
      });

      const res = await service.resolveForProject(ownerId, projectId, [
        soundId,
      ]);
      expect(res).toEqual([
        {
          id: soundId,
          name: null,
          playable: false,
          reason: 'missing',
          playbackUrl: null,
        },
      ]);
    });

    it('UTCID06 returns missing reason when sound is not found in custom_sounds', async () => {
      const { service } = makeService([], {
        tables: {
          projects: [{ data: { owner_id: ownerId, visibility: 'private' } }],
          custom_sounds: [{ data: [] }],
          sound_mappings: [{ data: [] }],
        },
      });

      const res = await service.resolveForProject(ownerId, projectId, [
        soundId,
      ]);
      expect(res).toEqual([
        {
          id: soundId,
          name: null,
          playable: false,
          reason: 'missing',
          playbackUrl: null,
        },
      ]);
    });

    it('UTCID07 returns deleted reason when sound is soft-deleted and owned by project owner', async () => {
      const row = makeCustomSound({
        id: soundId,
        owner_id: ownerId,
        deleted_at: '2026-10-22T00:00:00.000Z',
      });
      const { service } = makeService([], {
        tables: {
          projects: [{ data: { owner_id: ownerId, visibility: 'private' } }],
          custom_sounds: [{ data: [row] }],
          sound_mappings: [{ data: [] }],
        },
      });

      const res = await service.resolveForProject(ownerId, projectId, [
        soundId,
      ]);
      expect(res).toEqual([
        {
          id: soundId,
          name: 'Kick 01',
          playable: false,
          reason: 'deleted',
          playbackUrl: null,
        },
      ]);
    });

    it('UTCID08 resolves playable sound when soft-deleted but owner is not project owner and referenced', async () => {
      const row = makeCustomSound({
        id: soundId,
        owner_id: otherOwnerId,
        deleted_at: '2026-10-22T00:00:00.000Z',
      });
      const { service } = makeService([], {
        tables: {
          projects: [{ data: { owner_id: ownerId, visibility: 'public' } }],
          custom_sounds: [{ data: [row] }],
          sound_mappings: [{ data: [{ custom_sound_id: soundId }] }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            createSignedUrl: [{ data: { signedUrl: 'https://cdn/sound.wav' } }],
          },
        },
      });

      const res = await service.resolveForProject(otherOwnerId, projectId, [
        soundId,
      ]);
      expect(res).toEqual([
        {
          id: soundId,
          name: 'Kick 01',
          playable: true,
          reason: null,
          playbackUrl: 'https://cdn/sound.wav',
        },
      ]);
    });

    it('UTCID09 throws InternalServerErrorException when query fails', async () => {
      const { service } = makeService([], {
        tables: {
          projects: [{ data: { owner_id: ownerId, visibility: 'private' } }],
          custom_sounds: [{ error: new Error('DB error') }],
          sound_mappings: [{ data: [] }],
        },
      });

      await expect(
        service.resolveForProject(ownerId, projectId, [soundId]),
      ).rejects.toThrow(
        new InternalServerErrorException('Could not resolve custom sounds'),
      );
    });

    it('UTCID10 sets playbackUrl to null when storage signing returns null', async () => {
      const row = makeCustomSound({ id: soundId, owner_id: ownerId });
      const { service } = makeService([], {
        tables: {
          projects: [{ data: { owner_id: ownerId, visibility: 'private' } }],
          custom_sounds: [{ data: [row] }],
          sound_mappings: [{ data: [] }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            createSignedUrl: [{ data: null }],
          },
        },
      });

      const res = await service.resolveForProject(ownerId, projectId, [
        soundId,
      ]);
      expect(res).toEqual([
        {
          id: soundId,
          name: 'Kick 01',
          playable: true,
          reason: null,
          playbackUrl: null,
        },
      ]);
    });

    it('UTCID11 throws ForbiddenException when caller has no access to private project', async () => {
      const { service } = makeService([], {
        tables: {
          projects: [
            { data: { owner_id: otherOwnerId, visibility: 'private' } },
          ],
          project_collaborators: [{ data: null }],
        },
      });

      await expect(
        service.resolveForProject(ownerId, projectId, [soundId]),
      ).rejects.toThrow(
        new ForbiddenException('You do not have access to this project'),
      );
    });

    it('UTCID12 throws NotFoundException when project is not found', async () => {
      const { service } = makeService([], {
        tables: {
          projects: [{ data: null }],
        },
      });

      await expect(
        service.resolveForProject(ownerId, projectId, [soundId]),
      ).rejects.toThrow(new NotFoundException('Project not found'));
    });

    it('UTCID13 throws InternalServerErrorException when project query fails', async () => {
      const { service } = makeService([], {
        tables: {
          projects: [{ error: new Error('DB error') }],
        },
      });

      await expect(
        service.resolveForProject(ownerId, projectId, [soundId]),
      ).rejects.toThrow(
        new InternalServerErrorException('Could not read project'),
      );
    });
  });

  describe('BE-SND-05 getQuotaBytes()', () => {
    it('UTCID01 returns positive numeric setting value', async () => {
      const { service } = makeService([], {
        tables: {
          platform_settings: [{ data: { value: 104857600 } }],
        },
      });

      expect(await service.getQuotaBytes()).toBe(104857600);
    });

    it('UTCID02 parses numeric string setting value', async () => {
      const { service } = makeService([], {
        tables: {
          platform_settings: [{ data: { value: '20971520' } }],
        },
      });

      expect(await service.getQuotaBytes()).toBe(20971520);
    });

    it('UTCID03 returns 1 when setting value is 1', async () => {
      const { service } = makeService([], {
        tables: {
          platform_settings: [{ data: { value: 1 } }],
        },
      });

      expect(await service.getQuotaBytes()).toBe(1);
    });

    it('UTCID04 falls back to default 50MB when setting value is 0', async () => {
      const { service } = makeService([], {
        tables: {
          platform_settings: [{ data: { value: 0 } }],
        },
      });

      expect(await service.getQuotaBytes()).toBe(52428800);
    });

    it('UTCID05 falls back to default 50MB when setting value is negative', async () => {
      const { service } = makeService([], {
        tables: {
          platform_settings: [{ data: { value: -5 } }],
        },
      });

      expect(await service.getQuotaBytes()).toBe(52428800);
    });

    it('UTCID06 falls back to default 50MB when setting value is NaN', async () => {
      const { service } = makeService([], {
        tables: {
          platform_settings: [{ data: { value: 'abc' } }],
        },
      });

      expect(await service.getQuotaBytes()).toBe(52428800);
    });

    it('UTCID07 falls back to default 50MB when setting row is null', async () => {
      const { service } = makeService([], {
        tables: {
          platform_settings: [{ data: null }],
        },
      });

      expect(await service.getQuotaBytes()).toBe(52428800);
    });
  });

  describe('BE-SND-06 getUsedBytes(ownerId)', () => {
    it('UTCID01 returns number from RPC result', async () => {
      const { service } = makeService([], {
        rpc: {
          custom_sound_usage_bytes: { data: 1048576 },
        },
      });

      expect(await service.getUsedBytes(ownerId)).toBe(1048576);
    });

    it('UTCID02 converts string number from RPC to numeric value', async () => {
      const { service } = makeService([], {
        rpc: {
          custom_sound_usage_bytes: { data: '2048' },
        },
      });

      expect(await service.getUsedBytes(ownerId)).toBe(2048);
    });

    it('UTCID03 returns 0 when RPC returns 0', async () => {
      const { service } = makeService([], {
        rpc: {
          custom_sound_usage_bytes: { data: 0 },
        },
      });

      expect(await service.getUsedBytes(ownerId)).toBe(0);
    });

    it('UTCID04 returns 0 when RPC returns null', async () => {
      const { service } = makeService([], {
        rpc: {
          custom_sound_usage_bytes: { data: null },
        },
      });

      expect(await service.getUsedBytes(ownerId)).toBe(0);
    });

    it('UTCID05 throws InternalServerErrorException on RPC error', async () => {
      const { service } = makeService([], {
        rpc: {
          custom_sound_usage_bytes: { error: new Error('RPC failure') },
        },
      });

      await expect(service.getUsedBytes(ownerId)).rejects.toThrow(
        new InternalServerErrorException('Could not read custom sound usage'),
      );
    });
  });

  describe('BE-SND-07 createUploadUrl(ownerId, payload)', () => {
    it('UTCID01 returns upload URL token within limits and quota', async () => {
      const { service } = makeService([], {
        rpc: {
          custom_sound_usage_bytes: { data: 10 * 1024 * 1024 },
        },
        tables: {
          platform_settings: [{ data: { value: 50 * 1024 * 1024 } }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            createSignedUploadUrl: { data: { token: 'upload-token-123' } },
          },
        },
      });

      const res = await service.createUploadUrl(ownerId, {
        durationSec: 10,
        sizeBytes: 1048576,
      });

      expect(res.soundId).toBeDefined();
      expect(res.path).toBe(`${ownerId}/${res.soundId}.wav`);
      expect(res.token).toBe('upload-token-123');
    });

    it('UTCID02 succeeds when used bytes plus payload size equals quota exactly', async () => {
      const quota = 50 * 1024 * 1024;
      const sizeBytes = 10 * 1024 * 1024;
      const usedBytes = quota - sizeBytes;
      const { service } = makeService([], {
        rpc: {
          custom_sound_usage_bytes: { data: usedBytes },
        },
        tables: {
          platform_settings: [{ data: { value: quota } }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            createSignedUploadUrl: { data: { token: 'token-exact' } },
          },
        },
      });

      const res = await service.createUploadUrl(ownerId, {
        durationSec: 30,
        sizeBytes,
      });

      expect(res.token).toBe('token-exact');
    });

    it('UTCID03 throws BadRequestException when duration exceeds 30 seconds', async () => {
      const { service } = makeService();

      await expect(
        service.createUploadUrl(ownerId, {
          durationSec: 30.01,
          sizeBytes: 1048576,
        }),
      ).rejects.toThrow(
        new BadRequestException('Âm thanh tối đa 30 giây và 10MB'),
      );
    });

    it('UTCID04 throws BadRequestException when size exceeds 10MB', async () => {
      const { service } = makeService();

      await expect(
        service.createUploadUrl(ownerId, {
          durationSec: 10,
          sizeBytes: 10485761,
        }),
      ).rejects.toThrow(
        new BadRequestException('Âm thanh tối đa 30 giây và 10MB'),
      );
    });

    it('UTCID05 throws BadRequestException when size exceeds remaining quota', async () => {
      const quota = 50 * 1024 * 1024;
      const { service } = makeService([], {
        rpc: {
          custom_sound_usage_bytes: { data: quota },
        },
        tables: {
          platform_settings: [{ data: { value: quota } }],
        },
      });

      await expect(
        service.createUploadUrl(ownerId, {
          durationSec: 10,
          sizeBytes: 1048576,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Thư viện âm thanh đã đầy (tối đa 50MB). Hãy xoá bớt âm thanh cũ rồi thử lại.',
        ),
      );
    });

    it('UTCID06 throws InternalServerErrorException when usage RPC fails', async () => {
      const { service } = makeService([], {
        rpc: {
          custom_sound_usage_bytes: { error: new Error('RPC error') },
        },
        tables: {
          platform_settings: [{ data: { value: 52428800 } }],
        },
      });

      await expect(
        service.createUploadUrl(ownerId, {
          durationSec: 10,
          sizeBytes: 1048576,
        }),
      ).rejects.toThrow(
        new InternalServerErrorException('Could not read custom sound usage'),
      );
    });

    it('UTCID07 throws InternalServerErrorException when storage createSignedUploadUrl fails', async () => {
      const { service } = makeService([], {
        rpc: {
          custom_sound_usage_bytes: { data: 10 * 1024 * 1024 },
        },
        tables: {
          platform_settings: [{ data: { value: 52428800 } }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            createSignedUploadUrl: { error: new Error('Storage error') },
          },
        },
      });

      await expect(
        service.createUploadUrl(ownerId, {
          durationSec: 10,
          sizeBytes: 1048576,
        }),
      ).rejects.toThrow(
        new InternalServerErrorException('Could not create upload URL'),
      );
    });
  });

  describe('BE-SND-08 confirmUpload(ownerId, payload)', () => {
    it('UTCID01 confirms uploaded WAV sound and returns DTO with playbackUrl', async () => {
      const wav = makeWav(2);
      const row = makeCustomSound({
        id: soundId,
        owner_id: ownerId,
        name: 'Kick 01',
        duration_sec: 2,
        size_bytes: wav.length,
      });

      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ data: makeBlob(wav) }],
            createSignedUrl: [{ data: { signedUrl: 'https://cdn/sound.wav' } }],
          },
        },
        rpc: {
          custom_sound_usage_bytes: [{ data: 0 }],
        },
        tables: {
          platform_settings: [{ data: { value: 52428800 } }],
          custom_sounds: [{ data: row }],
        },
      });

      const res = await service.confirmUpload(ownerId, {
        soundId,
        name: 'Kick 01',
        source: 'uploaded',
      });

      expect(res).toEqual({
        id: soundId,
        name: 'Kick 01',
        durationSec: 2,
        sizeBytes: wav.length,
        source: 'uploaded',
        createdAt: row.created_at,
        playbackUrl: 'https://cdn/sound.wav',
      });
    });

    it('UTCID02 trims spaces and control characters from sound name', async () => {
      const wav = makeWav(2);
      const row = makeCustomSound({
        id: soundId,
        owner_id: ownerId,
        name: 'Snare',
        source: 'recorded',
      });

      const { service, mock } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ data: makeBlob(wav) }],
            createSignedUrl: [{ data: { signedUrl: 'https://cdn/snare.wav' } }],
          },
        },
        rpc: {
          custom_sound_usage_bytes: [{ data: 0 }],
        },
        tables: {
          platform_settings: [{ data: { value: 52428800 } }],
          custom_sounds: [{ data: row }],
        },
      });

      const res = await service.confirmUpload(ownerId, {
        soundId,
        name: '  Snare\t',
        source: 'recorded',
      });

      expect(res.name).toBe('Snare');
      expect(mock.builders.custom_sounds.insert).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Snare' }),
      );
    });

    it('UTCID03 accepts WAV with duration of exactly 30 seconds', async () => {
      const wav = makeWav(30);
      const row = makeCustomSound({
        id: soundId,
        duration_sec: 30,
        size_bytes: wav.length,
      });

      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ data: makeBlob(wav) }],
            createSignedUrl: [{ data: { signedUrl: 'https://cdn/sound.wav' } }],
          },
        },
        rpc: {
          custom_sound_usage_bytes: [{ data: 0 }],
        },
        tables: {
          platform_settings: [{ data: { value: 52428800 } }],
          custom_sounds: [{ data: row }],
        },
      });

      const res = await service.confirmUpload(ownerId, {
        soundId,
        name: 'Kick 01',
        source: 'uploaded',
      });

      expect(res.durationSec).toBe(30);
    });

    it('UTCID04 rejects 30.05s sound (code allows tolerance up to 30.05s, SRS forbids)', async () => {
      const wav = makeWav(30.05);
      const row = makeCustomSound({ id: soundId, duration_sec: 30 });
      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ data: makeBlob(wav) }],
            remove: [{ data: null }],
            createSignedUrl: [{ data: { signedUrl: 'https://cdn/30s.wav' } }],
          },
        },
        rpc: {
          custom_sound_usage_bytes: [{ data: 0 }],
        },
        tables: {
          platform_settings: [{ data: { value: 52428800 } }],
          custom_sounds: [{ data: row }],
        },
      });

      await expect(
        service.confirmUpload(ownerId, {
          soundId,
          name: 'Kick 01',
          source: 'uploaded',
        }),
      ).rejects.toThrow(new BadRequestException('Âm thanh tối đa 30 giây'));
    });

    it('UTCID05 accepts WAV of exactly 10MB size', async () => {
      const sampleRate = 192000;
      const channels = 2;
      const totalBytes = 10485760;
      const dataBytes = totalBytes - 44;
      const exact10Mb = Buffer.alloc(totalBytes);
      exact10Mb.write('RIFF', 0, 'ascii');
      exact10Mb.writeUInt32LE(totalBytes - 8, 4);
      exact10Mb.write('WAVE', 8, 'ascii');
      exact10Mb.write('fmt ', 12, 'ascii');
      exact10Mb.writeUInt32LE(16, 16);
      exact10Mb.writeUInt16LE(1, 20);
      exact10Mb.writeUInt16LE(channels, 22);
      exact10Mb.writeUInt32LE(sampleRate, 24);
      exact10Mb.writeUInt32LE(sampleRate * channels * 2, 28);
      exact10Mb.writeUInt16LE(channels * 2, 32);
      exact10Mb.writeUInt16LE(16, 34);
      exact10Mb.write('data', 36, 'ascii');
      exact10Mb.writeUInt32LE(dataBytes, 40);

      const row = makeCustomSound({
        id: soundId,
        duration_sec:
          Math.round((dataBytes / (sampleRate * channels * 2)) * 1000) / 1000,
        size_bytes: totalBytes,
      });

      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ data: makeBlob(exact10Mb) }],
            createSignedUrl: [{ data: { signedUrl: 'https://cdn/sound.wav' } }],
          },
        },
        rpc: {
          custom_sound_usage_bytes: [{ data: 0 }],
        },
        tables: {
          platform_settings: [{ data: { value: 52428800 } }],
          custom_sounds: [{ data: row }],
        },
      });

      const res = await service.confirmUpload(ownerId, {
        soundId,
        name: 'Kick 01',
        source: 'uploaded',
      });

      expect(res.sizeBytes).toBe(10485760);
    });

    it('UTCID06 throws BadRequestException when name contains only spaces', async () => {
      const { service } = makeService();

      await expect(
        service.confirmUpload(ownerId, {
          soundId,
          name: '   ',
          source: 'uploaded',
        }),
      ).rejects.toThrow(
        new BadRequestException('Tên âm thanh không được để trống'),
      );
    });

    it('UTCID07 throws BadRequestException when name contains only control characters', async () => {
      const { service } = makeService();

      await expect(
        service.confirmUpload(ownerId, {
          soundId,
          name: '\u0001\u0002',
          source: 'uploaded',
        }),
      ).rejects.toThrow(
        new BadRequestException('Tên âm thanh không được để trống'),
      );
    });

    it('UTCID08 throws BadRequestException when download from storage fails or file missing', async () => {
      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ error: new Error('Download failed') }],
          },
        },
      });

      await expect(
        service.confirmUpload(ownerId, {
          soundId,
          name: 'Kick 01',
          source: 'uploaded',
        }),
      ).rejects.toThrow(
        new BadRequestException('Chưa thấy file đã tải lên cho âm thanh này'),
      );
    });

    it('UTCID09 removes file and rejects when file size exceeds 10MB by 1 byte', async () => {
      const oversize = Buffer.alloc(10485761);
      const { service, mock } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ data: makeBlob(oversize) }],
            remove: [{ data: null }],
          },
        },
      });

      await expect(
        service.confirmUpload(ownerId, {
          soundId,
          name: 'Kick 01',
          source: 'uploaded',
        }),
      ).rejects.toThrow(new BadRequestException('Âm thanh tối đa 10MB'));

      expect(mock.storage.from).toHaveBeenCalledWith(CUSTOM_SOUNDS_BUCKET);
    });

    it('UTCID10 accepts valid MP3 sound (code currently only supports WAV)', async () => {
      const mp3 = Buffer.alloc(100);
      mp3.write('ID3', 0, 'ascii');
      const row = makeCustomSound({ id: soundId, duration_sec: 2 });

      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ data: makeBlob(mp3) }],
            remove: [{ data: null }],
            createSignedUrl: [{ data: { signedUrl: 'https://cdn/mp3.mp3' } }],
          },
        },
        rpc: {
          custom_sound_usage_bytes: [{ data: 0 }],
        },
        tables: {
          platform_settings: [{ data: { value: 52428800 } }],
          custom_sounds: [{ data: row }],
        },
      });

      const res = await service.confirmUpload(ownerId, {
        soundId,
        name: 'Kick 01',
        source: 'uploaded',
      });
      expect(res.id).toBe(soundId);
    });

    it('UTCID11 removes file and rejects when file is not audio (PNG bytes)', async () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ data: makeBlob(png) }],
            remove: [{ data: null }],
          },
        },
      });

      await expect(
        service.confirmUpload(ownerId, {
          soundId,
          name: 'Kick 01',
          source: 'uploaded',
        }),
      ).rejects.toThrow(
        new BadRequestException('File tải lên không phải âm thanh WAV hợp lệ'),
      );
    });

    it('UTCID12 removes file and rejects when WAV has 0-byte data chunk', async () => {
      const wav = makeWav(0);
      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ data: makeBlob(wav) }],
            remove: [{ data: null }],
          },
        },
      });

      await expect(
        service.confirmUpload(ownerId, {
          soundId,
          name: 'Kick 01',
          source: 'uploaded',
        }),
      ).rejects.toThrow(
        new BadRequestException('File tải lên không phải âm thanh WAV hợp lệ'),
      );
    });

    it('UTCID13 removes file and rejects when valid WAV exceeds 30.05 seconds', async () => {
      const wav = makeWav(30.06);
      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ data: makeBlob(wav) }],
            remove: [{ data: null }],
          },
        },
      });

      await expect(
        service.confirmUpload(ownerId, {
          soundId,
          name: 'Kick 01',
          source: 'uploaded',
        }),
      ).rejects.toThrow(new BadRequestException('Âm thanh tối đa 30 giây'));
    });

    it('UTCID14 removes file and rejects when upload exceeds storage quota', async () => {
      const wav = makeWav(2);
      const quota = 52428800;
      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ data: makeBlob(wav) }],
            remove: [{ data: null }],
          },
        },
        rpc: {
          custom_sound_usage_bytes: [{ data: quota }],
        },
        tables: {
          platform_settings: [{ data: { value: quota } }],
        },
      });

      await expect(
        service.confirmUpload(ownerId, {
          soundId,
          name: 'Kick 01',
          source: 'uploaded',
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Thư viện âm thanh đã đầy (tối đa 50MB). Hãy xoá bớt âm thanh cũ rồi thử lại.',
        ),
      );
    });

    it('UTCID15 throws ConflictException on unique constraint error 23505', async () => {
      const wav = makeWav(2);
      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ data: makeBlob(wav) }],
          },
        },
        rpc: {
          custom_sound_usage_bytes: [{ data: 0 }],
        },
        tables: {
          platform_settings: [{ data: { value: 52428800 } }],
          custom_sounds: [{ error: { code: '23505', message: 'duplicate' } }],
        },
      });

      await expect(
        service.confirmUpload(ownerId, {
          soundId,
          name: 'Kick 01',
          source: 'uploaded',
        }),
      ).rejects.toThrow(new ConflictException('Âm thanh này đã được lưu'));
    });

    it('UTCID16 throws InternalServerErrorException on DB insert error', async () => {
      const wav = makeWav(2);
      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ data: makeBlob(wav) }],
            remove: [{ data: null }],
          },
        },
        rpc: {
          custom_sound_usage_bytes: [{ data: 0 }],
        },
        tables: {
          platform_settings: [{ data: { value: 52428800 } }],
          custom_sounds: [{ error: { code: '50000', message: 'fatal' } }],
        },
      });

      await expect(
        service.confirmUpload(ownerId, {
          soundId,
          name: 'Kick 01',
          source: 'uploaded',
        }),
      ).rejects.toThrow(
        new InternalServerErrorException('Could not save custom sound'),
      );
    });
  });

  describe('BE-SND-09 list(ownerId)', () => {
    it('UTCID01 returns 2 active sounds with signed playback URLs and default quota', async () => {
      const row1 = makeCustomSound({ id: soundId, size_bytes: 1048576 });
      const row2 = makeCustomSound({ id: otherSoundId, size_bytes: 2097152 });
      const { service } = makeService([], {
        tables: {
          custom_sounds: [{ data: [row1, row2] }],
          platform_settings: [{ data: null }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            createSignedUrl: [
              { data: { signedUrl: 'https://cdn/1.wav' } },
              { data: { signedUrl: 'https://cdn/2.wav' } },
            ],
          },
        },
      });

      const res = await service.list(ownerId);
      expect(res.items).toHaveLength(2);
      expect(res.usedBytes).toBe(3145728);
      expect(res.quotaBytes).toBe(52428800);
      expect(res.items[0].playbackUrl).toBe('https://cdn/1.wav');
      expect(res.items[1].playbackUrl).toBe('https://cdn/2.wav');
    });

    it('UTCID02 returns active sounds with custom configured quota bytes', async () => {
      const row1 = makeCustomSound({ id: soundId, size_bytes: 1048576 });
      const row2 = makeCustomSound({ id: otherSoundId, size_bytes: 2097152 });
      const { service } = makeService([], {
        tables: {
          custom_sounds: [{ data: [row1, row2] }],
          platform_settings: [{ data: { value: 104857600 } }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            createSignedUrl: [
              { data: { signedUrl: 'https://cdn/1.wav' } },
              { data: { signedUrl: 'https://cdn/2.wav' } },
            ],
          },
        },
      });

      const res = await service.list(ownerId);
      expect(res.quotaBytes).toBe(104857600);
    });

    it('UTCID03 returns empty items array and 0 used bytes when user has no sounds', async () => {
      const { service } = makeService([], {
        tables: {
          custom_sounds: [{ data: [] }],
          platform_settings: [{ data: null }],
        },
      });

      const res = await service.list(ownerId);
      expect(res.items).toEqual([]);
      expect(res.usedBytes).toBe(0);
      expect(res.quotaBytes).toBe(52428800);
    });

    it('UTCID04 returns empty items array when query returns null data', async () => {
      const { service } = makeService([], {
        tables: {
          custom_sounds: [{ data: null }],
          platform_settings: [{ data: null }],
        },
      });

      const res = await service.list(ownerId);
      expect(res.items).toEqual([]);
      expect(res.usedBytes).toBe(0);
      expect(res.quotaBytes).toBe(52428800);
    });

    it('UTCID05 sets playbackUrl to null when storage signing fails', async () => {
      const row1 = makeCustomSound({ id: soundId, size_bytes: 1048576 });
      const row2 = makeCustomSound({ id: otherSoundId, size_bytes: 2097152 });
      const { service } = makeService([], {
        tables: {
          custom_sounds: [{ data: [row1, row2] }],
          platform_settings: [{ data: null }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            createSignedUrl: [{ data: null }, { data: null }],
          },
        },
      });

      const res = await service.list(ownerId);
      expect(res.items[0].playbackUrl).toBeNull();
      expect(res.items[1].playbackUrl).toBeNull();
    });

    it('UTCID06 throws InternalServerErrorException when custom_sounds query fails', async () => {
      const { service } = makeService([], {
        tables: {
          custom_sounds: [{ error: new Error('DB list error') }],
        },
      });

      await expect(service.list(ownerId)).rejects.toThrow(
        new InternalServerErrorException('Could not list custom sounds'),
      );
    });
  });

  describe('BE-SND-10 getUsage(ownerId, soundId)', () => {
    it('UTCID01 returns external project count of 3 for owned sound', async () => {
      const { service } = makeService([], {
        tables: {
          custom_sounds: [{ data: { id: soundId } }],
        },
        rpc: {
          custom_sound_external_project_count: [{ data: 3 }],
        },
      });

      const res = await service.getUsage(ownerId, soundId);
      expect(res).toEqual({ externalProjectCount: 3 });
    });

    it('UTCID02 returns external project count of 0 when count is 0', async () => {
      const { service } = makeService([], {
        tables: {
          custom_sounds: [{ data: { id: soundId } }],
        },
        rpc: {
          custom_sound_external_project_count: [{ data: 0 }],
        },
      });

      const res = await service.getUsage(ownerId, soundId);
      expect(res).toEqual({ externalProjectCount: 0 });
    });

    it('UTCID03 returns external project count of 0 when RPC returns null', async () => {
      const { service } = makeService([], {
        tables: {
          custom_sounds: [{ data: { id: soundId } }],
        },
        rpc: {
          custom_sound_external_project_count: [{ data: null }],
        },
      });

      const res = await service.getUsage(ownerId, soundId);
      expect(res).toEqual({ externalProjectCount: 0 });
    });

    it('UTCID04 throws NotFoundException when sound does not exist', async () => {
      const { service } = makeService([], {
        tables: {
          custom_sounds: [{ data: null }],
        },
      });

      await expect(service.getUsage(ownerId, soundId)).rejects.toThrow(
        new NotFoundException('Custom sound not found'),
      );
    });

    it('UTCID05 throws NotFoundException when sound is owned by another user', async () => {
      const { service } = makeService([], {
        tables: {
          custom_sounds: [{ data: null }],
        },
      });

      await expect(service.getUsage(otherOwnerId, soundId)).rejects.toThrow(
        new NotFoundException('Custom sound not found'),
      );
    });

    it('UTCID06 throws NotFoundException when sound is soft-deleted', async () => {
      const { service } = makeService([], {
        tables: {
          custom_sounds: [{ data: null }],
        },
      });

      await expect(service.getUsage(ownerId, soundId)).rejects.toThrow(
        new NotFoundException('Custom sound not found'),
      );
    });

    it('UTCID07 throws InternalServerErrorException when usage RPC fails', async () => {
      const { service } = makeService([], {
        tables: {
          custom_sounds: [{ data: { id: soundId } }],
        },
        rpc: {
          custom_sound_external_project_count: [
            { error: new Error('RPC error') },
          ],
        },
      });

      await expect(service.getUsage(ownerId, soundId)).rejects.toThrow(
        new InternalServerErrorException('Could not read custom sound usage'),
      );
    });
  });

  describe('BE-SND-11 delete(ownerId, soundId, mode)', () => {
    it('UTCID01 deletes sound in self mode when unreferenced, removes file and runs GC', async () => {
      const { service } = makeService([], {
        rpc: {
          delete_custom_sound: [
            {
              data: [
                {
                  removed: true,
                  file_url: `${ownerId}/${soundId}.wav`,
                  affected_projects: 0,
                },
              ],
            },
          ],
          collect_custom_sound_garbage: [{ data: [] }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            remove: [{ data: null }],
          },
        },
      });

      const res = await service.delete(ownerId, soundId, 'self');
      expect(res).toEqual({ removed: true, affectedProjects: 0 });
    });

    it('UTCID02 marks soft-deleted in self mode when still referenced, does not remove file', async () => {
      const { service } = makeService([], {
        rpc: {
          delete_custom_sound: [
            {
              data: [
                {
                  removed: false,
                  file_url: null,
                  affected_projects: 2,
                },
              ],
            },
          ],
          collect_custom_sound_garbage: [{ data: [] }],
        },
      });

      const res = await service.delete(ownerId, soundId, 'self');
      expect(res).toEqual({ removed: false, affectedProjects: 2 });
    });

    it('UTCID03 force-deletes in hard mode, removes file even if referenced', async () => {
      const { service } = makeService([], {
        rpc: {
          delete_custom_sound: [
            {
              data: [
                {
                  removed: true,
                  file_url: `${ownerId}/${soundId}.wav`,
                  affected_projects: 2,
                },
              ],
            },
          ],
          collect_custom_sound_garbage: [{ data: [] }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            remove: [{ data: null }],
          },
        },
      });

      const res = await service.delete(ownerId, soundId, 'hard');
      expect(res).toEqual({ removed: true, affectedProjects: 2 });
    });

    it('UTCID04 skips file removal when removed is true but file_url is null', async () => {
      const { service } = makeService([], {
        rpc: {
          delete_custom_sound: [
            {
              data: [
                {
                  removed: true,
                  file_url: null,
                  affected_projects: 0,
                },
              ],
            },
          ],
          collect_custom_sound_garbage: [{ data: [] }],
        },
      });

      const res = await service.delete(ownerId, soundId, 'self');
      expect(res).toEqual({ removed: true, affectedProjects: 0 });
    });

    it('UTCID05 throws NotFoundException when delete_custom_sound returns empty array', async () => {
      const { service } = makeService([], {
        rpc: {
          delete_custom_sound: [{ data: [] }],
        },
      });

      await expect(service.delete(ownerId, soundId, 'self')).rejects.toThrow(
        new NotFoundException('Custom sound not found'),
      );
    });

    it('UTCID06 throws NotFoundException when delete_custom_sound returns null', async () => {
      const { service } = makeService([], {
        rpc: {
          delete_custom_sound: [{ data: null }],
        },
      });

      await expect(service.delete(ownerId, soundId, 'hard')).rejects.toThrow(
        new NotFoundException('Custom sound not found'),
      );
    });

    it('UTCID07 throws InternalServerErrorException when delete RPC fails', async () => {
      const { service } = makeService([], {
        rpc: {
          delete_custom_sound: [{ error: new Error('Delete RPC error') }],
        },
      });

      await expect(service.delete(ownerId, soundId, 'self')).rejects.toThrow(
        new InternalServerErrorException('Could not delete custom sound'),
      );
    });

    it('UTCID08 completes without throwing when storage file removal fails', async () => {
      const { service } = makeService([], {
        rpc: {
          delete_custom_sound: [
            {
              data: [
                {
                  removed: true,
                  file_url: `${ownerId}/${soundId}.wav`,
                  affected_projects: 0,
                },
              ],
            },
          ],
          collect_custom_sound_garbage: [{ data: [] }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            remove: [{ error: new Error('Storage removal error') }],
          },
        },
      });

      const res = await service.delete(ownerId, soundId, 'self');
      expect(res).toEqual({ removed: true, affectedProjects: 0 });
    });
  });

  describe('BE-SND-12 collectGarbage()', () => {
    it('UTCID01 removes files when RPC returns paths', async () => {
      const { service, mock } = makeService([], {
        rpc: {
          collect_custom_sound_garbage: [
            {
              data: [
                { file_url: `${ownerId}/1.wav` },
                { file_url: `${ownerId}/2.wav` },
              ],
            },
          ],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            remove: [{ data: null }],
          },
        },
      });

      await service.collectGarbage();
      expect(mock.storage.from).toHaveBeenCalledWith(CUSTOM_SOUNDS_BUCKET);
    });

    it('UTCID02 skips file removal when RPC returns empty array', async () => {
      const { service, mock } = makeService([], {
        rpc: {
          collect_custom_sound_garbage: [{ data: [] }],
        },
      });

      await service.collectGarbage();
      expect(mock.storage.from).not.toHaveBeenCalled();
    });

    it('UTCID03 skips file removal when RPC returns null', async () => {
      const { service, mock } = makeService([], {
        rpc: {
          collect_custom_sound_garbage: [{ data: null }],
        },
      });

      await service.collectGarbage();
      expect(mock.storage.from).not.toHaveBeenCalled();
    });

    it('UTCID04 filters out empty or null file_urls from removal paths', async () => {
      const { service } = makeService([], {
        rpc: {
          collect_custom_sound_garbage: [
            {
              data: [{ file_url: '' }, { file_url: `${ownerId}/valid.wav` }],
            },
          ],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            remove: [{ data: null }],
          },
        },
      });

      await expect(service.collectGarbage()).resolves.toBeUndefined();
    });

    it('UTCID05 splits removal into chunks of 100 when more than 100 paths are returned', async () => {
      const items = Array.from({ length: 150 }, (_, i) => ({
        file_url: `${ownerId}/${i}.wav`,
      }));

      const { service } = makeService([], {
        rpc: {
          collect_custom_sound_garbage: [{ data: items }],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            remove: [{ data: null }, { data: null }],
          },
        },
      });

      await expect(service.collectGarbage()).resolves.toBeUndefined();
    });

    it('UTCID06 logs error and resolves without throwing when RPC fails', async () => {
      const { service } = makeService([], {
        rpc: {
          collect_custom_sound_garbage: [{ error: new Error('GC RPC error') }],
        },
      });

      await expect(service.collectGarbage()).resolves.toBeUndefined();
    });

    it('UTCID07 logs error and resolves without throwing when storage remove fails', async () => {
      const { service } = makeService([], {
        rpc: {
          collect_custom_sound_garbage: [
            { data: [{ file_url: `${ownerId}/sound.wav` }] },
          ],
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            remove: [{ error: new Error('Storage remove error') }],
          },
        },
      });

      await expect(service.collectGarbage()).resolves.toBeUndefined();
    });
  });

  describe('BE-SND-13 removeAllFilesOf(ownerId)', () => {
    it('UTCID01 lists files and calls remove with ownerId/name paths', async () => {
      const files = [{ name: 'a.wav' }, { name: 'b.wav' }, { name: 'c.wav' }];
      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            list: [{ data: files }],
            remove: [{ data: null }],
          },
        },
      });

      await expect(service.removeAllFilesOf(ownerId)).resolves.toBeUndefined();
    });

    it('UTCID02 skips remove call when storage list returns empty array', async () => {
      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            list: [{ data: [] }],
          },
        },
      });

      await expect(service.removeAllFilesOf(ownerId)).resolves.toBeUndefined();
    });

    it('UTCID03 chunks removal calls when file count exceeds 100', async () => {
      const files = Array.from({ length: 250 }, (_, i) => ({
        name: `sound_${i}.wav`,
      }));

      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            list: [{ data: files }],
            remove: [{ data: null }, { data: null }, { data: null }],
          },
        },
      });

      await expect(service.removeAllFilesOf(ownerId)).resolves.toBeUndefined();
    });

    it('UTCID04 queries list with limit 1000 and removes files', async () => {
      const files = Array.from({ length: 1000 }, (_, i) => ({
        name: `sound_${i}.wav`,
      }));
      const removeChunks = Array.from({ length: 10 }, () => ({ data: null }));

      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            list: [{ data: files }],
            remove: removeChunks,
          },
        },
      });

      await expect(service.removeAllFilesOf(ownerId)).resolves.toBeUndefined();
    });

    it('UTCID05 logs error and resolves without throwing when storage list fails', async () => {
      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            list: [{ error: new Error('List failed') }],
          },
        },
      });

      await expect(service.removeAllFilesOf(ownerId)).resolves.toBeUndefined();
    });

    it('UTCID06 logs error and resolves without throwing when a remove chunk fails', async () => {
      const files = [{ name: 'a.wav' }];
      const { service } = makeService([], {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            list: [{ data: files }],
            remove: [{ error: new Error('Remove failed') }],
          },
        },
      });

      await expect(service.removeAllFilesOf(ownerId)).resolves.toBeUndefined();
    });
  });
});
