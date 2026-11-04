import { Logger } from '@nestjs/common';
import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import { AudioSketchesService } from './audio-sketches.service';

const projectId = '33333333-3333-4333-8333-333333333333';
const sketchId = '55555555-5555-4555-8555-555555555555';
const ownerId = '44444444-4444-4444-8444-444444444444';
const otherId = '66666666-6666-4666-8666-666666666666';

const sketchRow = {
  id: sketchId,
  project_id: projectId,
  created_by: ownerId,
  name: 'idea',
  file_url: `${projectId}/${sketchId}.wav`,
  duration_sec: 10,
  size_bytes: 1000,
  trim_start_sec: 0,
  trim_end_sec: null,
  created_at: '2026-10-26T00:00:00Z',
};

function makeService(options: SupabaseMockOptions) {
  const mock = createSupabaseMock([], options);
  return { service: new AudioSketchesService(mock.client), ...mock };
}

describe('AudioSketchesService.remove', () => {
  it('deletes the row first and then the stored file', async () => {
    const { service, builders, storage } = makeService({
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
        audio_sketches: [{ data: sketchRow }, { data: null, error: null }],
      },
      storage: { 'audio-sketches': { remove: { data: [], error: null } } },
    });
    await service.remove(projectId, sketchId, ownerId);
    expect(builders.audio_sketches.delete).toHaveBeenCalled();
    expect(storage.from).toHaveBeenCalledWith('audio-sketches');
  });

  it('restores the entry and reports failure when the file cannot be removed', async () => {
    const { service, builders } = makeService({
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
        audio_sketches: [
          { data: sketchRow },
          { data: null, error: null },
          { data: null, error: null },
        ],
      },
      storage: {
        'audio-sketches': {
          remove: { data: null, error: { message: 'storage down' } },
        },
      },
    });
    await expect(
      service.remove(projectId, sketchId, ownerId),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(builders.audio_sketches.insert).toHaveBeenCalledWith(sketchRow);
  });

  it('answers not found for a sketch that is not in the project', async () => {
    const { service, builders } = makeService({
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
        audio_sketches: [{ data: null }],
      },
    });
    await expect(
      service.remove(projectId, sketchId, ownerId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(builders.audio_sketches.delete).not.toHaveBeenCalled();
  });

  it('refuses a user who cannot edit the project', async () => {
    const { service, builders } = makeService({
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
        project_collaborators: [{ data: null }],
        audio_sketches: [],
      },
    });
    await expect(
      service.remove(projectId, sketchId, otherId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(builders.audio_sketches.delete).not.toHaveBeenCalled();
  });
});

describe('AudioSketchesService.purgeProjectFiles', () => {
  it('removes every file stored under the project folder', async () => {
    const { service, storage } = makeService({
      storage: {
        'audio-sketches': {
          list: { data: [{ name: 'a.wav' }, { name: 'b.wav' }], error: null },
          remove: { data: [], error: null },
        },
      },
    });
    await service.purgeProjectFiles([projectId]);
    expect(storage.from).toHaveBeenCalledWith('audio-sketches');
  });

  it('does not throw when storage fails', async () => {
    const { service } = makeService({
      storage: {
        'audio-sketches': { list: { data: null, error: { message: 'x' } } },
      },
    });
    await expect(
      service.purgeProjectFiles([projectId]),
    ).resolves.toBeUndefined();
  });

  describe('retries and reporting', () => {
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

    async function run(options: SupabaseMockOptions) {
      const made = makeService(options);
      const done = made.service.purgeProjectFiles([projectId]);
      await jest.runAllTimersAsync();
      await done;
      return made;
    }

    it('retries a failed remove and stops once it succeeds', async () => {
      const { storage } = await run({
        storage: {
          'audio-sketches': {
            list: { data: [{ name: 'a.wav' }], error: null },
            remove: [
              { data: null, error: { message: 'boom' } },
              { data: [], error: null },
            ],
          },
        },
      });
      expect(storage.from).toHaveBeenCalledTimes(3);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs the full paths after 3 failed attempts', async () => {
      const failure = { data: null, error: { message: 'storage down' } };
      const { storage } = await run({
        storage: {
          'audio-sketches': {
            list: { data: [{ name: 'a.wav' }, { name: 'b.wav' }], error: null },
            remove: [failure, failure, failure],
          },
        },
      });
      expect(storage.from).toHaveBeenCalledTimes(4);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const message = String(errorSpy.mock.calls[0][0]);
      expect(message).toContain(`${projectId}/a.wav`);
      expect(message).toContain(`${projectId}/b.wav`);
      expect(message).toContain('storage down');
    });

    it('treats a thrown remove like a failed one', async () => {
      const { storage } = await run({
        storage: {
          'audio-sketches': {
            list: { data: [{ name: 'a.wav' }], error: null },
          },
        },
      });
      expect(storage.from).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0][0])).toContain(`${projectId}/a.wav`);
    });

    it('logs an error when the folder cannot be listed', async () => {
      await run({
        storage: {
          'audio-sketches': { list: { data: null, error: { message: 'x' } } },
        },
      });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0][0])).toContain(projectId);
    });

    it('lists every page before removing', async () => {
      const page = Array.from({ length: 1000 }, (_, i) => ({
        name: `${i}.wav`,
      }));
      const { storage } = await run({
        storage: {
          'audio-sketches': {
            list: [
              { data: page, error: null },
              { data: [{ name: 'last.wav' }], error: null },
            ],
            remove: Array.from({ length: 11 }, () => ({
              data: [],
              error: null,
            })),
          },
        },
      });
      expect(storage.from).toHaveBeenCalledTimes(2 + 11);
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
