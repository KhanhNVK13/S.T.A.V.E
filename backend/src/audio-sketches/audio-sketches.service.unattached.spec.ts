import { Logger } from '@nestjs/common';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import { AudioSketchesService } from './audio-sketches.service';

const projectId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const oldId = '77777777-7777-4777-8777-777777777777';
const keptId = '88888888-8888-4888-8888-888888888888';
const freshId = '99999999-9999-4999-8999-999999999999';
const dto = { durationSec: 60, sizeBytes: 1000 };

const now = Date.parse('2026-11-04T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();

function makeService(options: SupabaseMockOptions) {
  const mock = createSupabaseMock([], {
    ...options,
    tables: { projects: [{ data: { owner_id: ownerId } }], ...options.tables },
  });
  return { service: new AudioSketchesService(mock.client), ...mock };
}

function bucketWith(
  files: { name: string; created_at: string | null }[],
  extra: Record<string, unknown> = {},
) {
  return {
    'audio-sketches': {
      list: { data: files, error: null },
      createSignedUploadUrl: { data: { token: 't' }, error: null },
      ...extra,
    },
  } as SupabaseMockOptions['storage'];
}

describe('AudioSketchesService.createUploadUrl cleanup of unattached uploads', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now });
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    errorSpy.mockRestore();
  });

  async function run(service: AudioSketchesService) {
    const done = service.createUploadUrl(projectId, ownerId, dto);
    await jest.runAllTimersAsync();
    return done;
  }

  it('removes old files that no sketch row points to and keeps the rest', async () => {
    const { service, builders, storage } = makeService({
      storage: bucketWith(
        [
          { name: `${oldId}.wav`, created_at: hoursAgo(3) },
          { name: `${keptId}.wav`, created_at: hoursAgo(5) },
          { name: `${freshId}.wav`, created_at: hoursAgo(0.2) },
          { name: 'notes.txt', created_at: hoursAgo(9) },
          { name: `${oldId}.wav`.replace('7', '6'), created_at: null },
        ],
        { remove: { data: [], error: null } },
      ),
      tables: {
        audio_sketches: [
          { data: [{ file_url: `${projectId}/${keptId}.wav` }], error: null },
        ],
      },
    });

    const result = await run(service);

    expect(result.token).toBe('t');
    expect(builders.audio_sketches.in).toHaveBeenCalledWith('file_url', [
      `${projectId}/${oldId}.wav`,
      `${projectId}/${keptId}.wav`,
    ]);
    const bucket = storage.from.mock.results.map(
      (r) => r.value as Record<string, jest.Mock>,
    );
    const removeCall = bucket.find((b) => b.remove.mock.calls.length > 0);
    expect(removeCall?.remove).toHaveBeenCalledWith([
      `${projectId}/${oldId}.wav`,
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not touch Storage or the table when nothing is old', async () => {
    const { service, builders } = makeService({
      storage: bucketWith([
        { name: `${freshId}.wav`, created_at: hoursAgo(0.5) },
      ]),
    });
    await run(service);
    expect(builders.audio_sketches).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('still issues the URL and logs when the listing fails', async () => {
    const { service } = makeService({
      storage: {
        'audio-sketches': {
          list: { data: null, error: { message: 'down' } },
          createSignedUploadUrl: { data: { token: 't' }, error: null },
        },
      },
    });
    const result = await run(service);
    expect(result.token).toBe('t');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('does not delete anything when the reference lookup fails', async () => {
    const { service, storage } = makeService({
      storage: bucketWith([{ name: `${oldId}.wav`, created_at: hoursAgo(3) }]),
      tables: {
        audio_sketches: [{ data: null, error: { message: 'db down' } }],
      },
    });
    const result = await run(service);
    expect(result.token).toBe('t');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const removed = storage.from.mock.results.some(
      (r) =>
        (r.value as Record<string, jest.Mock>).remove.mock.calls.length > 0,
    );
    expect(removed).toBe(false);
  });

  it('logs full paths when removing the orphans keeps failing', async () => {
    const failure = { data: null, error: { message: 'storage down' } };
    const { service } = makeService({
      storage: bucketWith([{ name: `${oldId}.wav`, created_at: hoursAgo(3) }], {
        remove: [failure, failure, failure],
      }),
      tables: { audio_sketches: [{ data: [], error: null }] },
    });
    const result = await run(service);
    expect(result.token).toBe('t');
    expect(String(errorSpy.mock.calls[0][0])).toContain(
      `${projectId}/${oldId}.wav`,
    );
  });
});
