import { Logger } from '@nestjs/common';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import {
  CustomSoundsService,
  CUSTOM_SOUNDS_BUCKET,
} from './custom-sounds.service';

const ownerId = '11111111-1111-4111-8111-111111111111';
const soundId = '44444444-4444-4444-8444-444444444444';
const path = `${ownerId}/${soundId}.wav`;

function makeWav(seconds: number): Buffer {
  const sampleRate = 8000;
  const dataBytes = Math.round(seconds * sampleRate) * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

function blobOf(buffer: Buffer) {
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

function makeService(options: SupabaseMockOptions) {
  const mock = createSupabaseMock([], options);
  return { service: new CustomSoundsService(mock.client), ...mock };
}

function removeCalls(storage: { from: jest.Mock }): string[][] {
  return storage.from.mock.results.flatMap((r) =>
    (r.value as Record<string, jest.Mock>).remove.mock.calls.map(
      (c) => c[0] as string[],
    ),
  );
}

describe('CustomSoundsService orphan handling', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    errorSpy.mockRestore();
  });

  async function settle<T>(
    promise: Promise<T>,
  ): Promise<PromiseSettledResult<T>> {
    const done = Promise.allSettled([promise]);
    await jest.runAllTimersAsync();
    return (await done)[0];
  }

  describe('confirmUpload when the row cannot be inserted', () => {
    function confirmOptions(
      tableResults: { data?: unknown; error?: unknown }[],
      remove: unknown[] = [{ data: null }],
    ): SupabaseMockOptions {
      return {
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            download: [{ data: blobOf(makeWav(2)) }],
            remove: remove as never,
          },
        },
        rpc: { custom_sound_usage_bytes: [{ data: 0 }] },
        tables: {
          platform_settings: [{ data: { value: 52428800 } }],
          custom_sounds: tableResults,
        },
      };
    }
    const payload = { soundId, name: 'Kick', source: 'uploaded' as const };

    it('removes the uploaded file when no row exists for it', async () => {
      const { service, storage } = makeService(
        confirmOptions([
          { error: { code: '50000', message: 'fatal' } },
          { data: null },
        ]),
      );
      const result = await settle(service.confirmUpload(ownerId, payload));
      expect(result.status).toBe('rejected');
      expect(removeCalls(storage)).toEqual([[path]]);
    });

    it('keeps the file when a row for it already exists', async () => {
      const { service, storage } = makeService(
        confirmOptions([
          { error: { code: '50000', message: 'fatal' } },
          { data: { id: soundId } },
        ]),
      );
      await settle(service.confirmUpload(ownerId, payload));
      expect(removeCalls(storage)).toEqual([]);
    });

    it('keeps the file and logs its path when the existence check fails', async () => {
      const { service, storage } = makeService(
        confirmOptions([
          { error: { code: '50000', message: 'fatal' } },
          { error: { message: 'db down' } },
        ]),
      );
      await settle(service.confirmUpload(ownerId, payload));
      expect(removeCalls(storage)).toEqual([]);
      expect(errorSpy.mock.calls.some((c) => String(c[0]).includes(path))).toBe(
        true,
      );
    });

    it('never touches the file on a duplicate id', async () => {
      const { service, storage } = makeService(
        confirmOptions([{ error: { code: '23505', message: 'duplicate' } }]),
      );
      await settle(service.confirmUpload(ownerId, payload));
      expect(removeCalls(storage)).toEqual([]);
    });
  });

  describe('removing files', () => {
    const hardDelete = {
      data: [{ removed: true, file_url: path, affected_projects: 0 }],
    };

    it('retries a failed removal after a hard delete', async () => {
      const { service, storage } = makeService({
        rpc: {
          delete_custom_sound: hardDelete,
          collect_custom_sound_garbage: { data: [] },
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            remove: [{ error: { message: 'boom' } }, { data: null }],
          },
        },
      });
      const result = await settle(service.delete(ownerId, soundId, 'hard'));
      expect(result.status).toBe('fulfilled');
      expect(removeCalls(storage)).toEqual([[path], [path]]);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs the full path once every attempt has failed', async () => {
      const failure = { error: { message: 'storage down' } };
      const { service, storage } = makeService({
        rpc: {
          delete_custom_sound: hardDelete,
          collect_custom_sound_garbage: { data: [] },
        },
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: { remove: [failure, failure, failure] },
        },
      });
      await settle(service.delete(ownerId, soundId, 'hard'));
      expect(removeCalls(storage)).toHaveLength(3);
      expect(String(errorSpy.mock.calls[0][0])).toContain(path);
    });
  });

  describe('removeAllFilesOf', () => {
    it('pages through the whole folder instead of the first 1000 files', async () => {
      const names = (from: number, to: number) =>
        Array.from({ length: to - from }, (_, i) => ({
          name: `s${from + i}.wav`,
        }));
      const { service, storage } = makeService({
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            list: [
              { data: names(0, 1000) },
              { data: names(1000, 2000) },
              { data: names(2000, 2005) },
            ],
            remove: Array.from({ length: 21 }, () => ({ data: null })),
          },
        },
      });
      await settle(service.removeAllFilesOf(ownerId));
      const removed = removeCalls(storage).flat();
      expect(removed).toHaveLength(2005);
      expect(removed).toContain(`${ownerId}/s2004.wav`);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('removes nothing and logs when a page cannot be listed', async () => {
      const { service, storage } = makeService({
        storage: {
          [CUSTOM_SOUNDS_BUCKET]: {
            list: [{ error: { message: 'list failed' } }],
          },
        },
      });
      await settle(service.removeAllFilesOf(ownerId));
      expect(removeCalls(storage)).toEqual([]);
      expect(String(errorSpy.mock.calls[0][0])).toContain(ownerId);
    });
  });
});
