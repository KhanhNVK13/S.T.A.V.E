import 'reflect-metadata';
import { BadRequestException, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import { UsersService } from './users.service';

const userId = '11111111-1111-4111-8111-111111111111';
const newName = '33333333-3333-4333-8333-333333333333.webp';
const newPath = `${userId}/${newName}`;
const userRow = { id: userId, avatar_url: null };

function makeService(
  avatars: Record<string, unknown>,
  tables: SupabaseMockOptions['tables'] = {},
) {
  const mock = createSupabaseMock([], {
    tables,
    storage: { avatars: avatars as never },
  });
  const service = new UsersService(mock.client, {
    getOrThrow: () => 'https://project.supabase.co',
  } as unknown as ConfigService);
  return { service, ...mock };
}

function calls(storage: { from: jest.Mock }, method: string): unknown[][] {
  return storage.from.mock.results.flatMap(
    (r) => (r.value as Record<string, jest.Mock>)[method].mock.calls,
  );
}

describe('UsersService avatar orphan handling', () => {
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

  async function settle<T>(promise: Promise<T>) {
    const done = Promise.allSettled([promise]);
    await jest.runAllTimersAsync();
    return (await done)[0];
  }

  it('does not list, delete or read the profile when issuing an upload URL', async () => {
    const { service, storage, builders } = makeService({
      createSignedUploadUrl: { data: { token: 'tok' } },
    });

    const result = await settle(
      service.createAvatarUploadUrl(userId, 'image/webp'),
    );

    expect(result.status).toBe('fulfilled');
    expect(calls(storage, 'list')).toEqual([]);
    expect(calls(storage, 'remove')).toEqual([]);
    expect(builders.users).toBeUndefined();
  });

  it('removes older avatars once the new one is saved', async () => {
    const { service, storage, builders } = makeService(
      {
        list: [
          { data: [{ name: newName, metadata: { size: 1000 } }] },
          { data: [{ name: newName }, { name: 'old.png' }] },
        ],
        remove: { data: [] },
      },
      { users: [{ data: userRow }] },
    );
    await settle(service.confirmAvatar(userId, newPath));

    expect(builders.users.update).toHaveBeenCalledTimes(1);
    expect(calls(storage, 'remove')).toEqual([[[`${userId}/old.png`]]]);
  });

  it('keeps the old avatar when the new one cannot be saved', async () => {
    const { service, storage } = makeService(
      { list: [{ data: [{ name: newName, metadata: { size: 1000 } }] }] },
      { users: [{ error: { message: 'db down' } }] },
    );

    const result = await settle(service.confirmAvatar(userId, newPath));

    expect(result.status).toBe('rejected');
    expect(calls(storage, 'remove')).toEqual([]);
  });

  it('pages through every avatar file when cleaning up', async () => {
    const batch = (from: number, to: number) =>
      Array.from({ length: to - from }, (_, i) => ({
        name: `a${from + i}.png`,
      }));
    const { service, storage } = makeService(
      {
        list: [
          { data: [{ name: newName, metadata: { size: 1000 } }] },
          { data: batch(0, 1000) },
          { data: batch(1000, 1150) },
        ],
        remove: Array.from({ length: 12 }, () => ({ data: [] })),
      },
      { users: [{ data: userRow }] },
    );

    await settle(service.confirmAvatar(userId, newPath));

    const removed = calls(storage, 'remove').flatMap((c) => c[0] as string[]);
    expect(removed).toHaveLength(1150);
    expect(removed).toContain(`${userId}/a1149.png`);
  });

  it('removes nothing and logs when the avatar folder cannot be listed', async () => {
    const { service, storage } = makeService(
      {
        list: [
          { data: [{ name: newName, metadata: { size: 1000 } }] },
          { error: { message: 'list failed' } },
        ],
      },
      { users: [{ data: userRow }] },
    );

    const result = await settle(service.confirmAvatar(userId, newPath));

    expect(result.status).toBe('fulfilled');
    expect(calls(storage, 'remove')).toEqual([]);
    expect(String(errorSpy.mock.calls[0][0])).toContain(userId);
  });

  it('retries failed removals and logs the full paths', async () => {
    const failure = { error: { message: 'storage down' } };
    const { service, storage } = makeService(
      {
        list: [
          { data: [{ name: newName, metadata: { size: 1000 } }] },
          { data: [{ name: newName }, { name: 'old.png' }] },
        ],
        remove: [failure, failure, failure],
      },
      { users: [{ data: userRow }] },
    );

    await settle(service.confirmAvatar(userId, newPath));

    expect(calls(storage, 'remove')).toHaveLength(3);
    expect(String(errorSpy.mock.calls[0][0])).toContain(`${userId}/old.png`);
  });

  it('retries removing an oversized avatar before rejecting it', async () => {
    const { service, storage } = makeService({
      list: { data: [{ name: newName, metadata: { size: 3 * 1024 * 1024 } }] },
      remove: [{ error: { message: 'boom' } }, { data: [] }],
    });

    const result = await settle(service.confirmAvatar(userId, newPath));

    expect(result.status).toBe('rejected');
    expect((result as PromiseRejectedResult).reason).toEqual(
      new BadRequestException('Avatar file is too large'),
    );
    expect(calls(storage, 'remove')).toHaveLength(2);
  });
});
