import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { User } from '@supabase/supabase-js';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import type { UserRow } from '../users/user-row.type';
import type { AccountRemovalService } from '../account-removal/account-removal.service';
import { AuthService } from './auth.service';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'a3b1c9f0-4d2e-4f6a-9c1b-0a1b2c3d4e5f',
    email: 'an@stave.io',
    identities: [],
    ...overrides,
  } as User;
}

function makeService(results: Parameters<typeof createSupabaseMock>[0]) {
  const mock = createSupabaseMock(results);
  const service = new AuthService(
    mock.client,
    {} as ConfigService,
    {} as AccountRemovalService,
  );
  return { service, ...mock };
}

describe('AuthService.syncProfile(user) batch 1', () => {
  const existingRow = { id: 'a3b1c9f0', username: 'an' } as unknown as UserRow;
  const createdRow = { id: 'a3b1c9f0', username: 'an' } as unknown as UserRow;

  it('returns the existing row unchanged', async () => {
    const { service, builder } = makeService([{ data: existingRow }]);

    const result = await service.syncProfile(makeUser());

    expect(result).toBe(existingRow);
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it('inserts a new row with google_id taken from the Google identity', async () => {
    const { service, builder } = makeService([
      { data: null },
      { data: null },
      { data: createdRow },
    ]);
    const user = makeUser({
      identities: [{ provider: 'google', id: 'g-123' }] as User['identities'],
    });

    const result = await service.syncProfile(user);

    expect(result).toBe(createdRow);
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: user.id,
        email: 'an@stave.io',
        username: 'an',
        display_name: 'an',
        google_id: 'g-123',
      }),
    );
  });

  it('inserts a new row with google_id = null when only an email identity exists', async () => {
    const { service, builder } = makeService([
      { data: null },
      { data: null },
      { data: createdRow },
    ]);
    const user = makeUser({
      identities: [{ provider: 'email', id: 'e-1' }] as User['identities'],
    });

    const result = await service.syncProfile(user);

    expect(result).toBe(createdRow);
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ google_id: null }),
    );
  });

  it('seeds the username from "user" when email and identities are undefined', async () => {
    const { service, builder } = makeService([
      { data: null },
      { data: null },
      { data: createdRow },
    ]);
    const user = makeUser({ email: undefined, identities: undefined });

    const result = await service.syncProfile(user);

    expect(result).toBe(createdRow);
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'user', google_id: null }),
    );
  });

  it('throws "Could not provision profile" when the insert returns an error', async () => {
    const { service } = makeService([
      { data: null },
      { data: null },
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: null },
    ]);
    const user = makeUser({
      identities: [{ provider: 'google', id: 'g-123' }] as User['identities'],
    });

    await expect(service.syncProfile(user)).rejects.toThrow(
      new UnauthorizedException('Could not provision profile'),
    );
  });

  it('throws "Could not provision profile" when the insert returns null data', async () => {
    const { service } = makeService([
      { data: null },
      { data: null },
      { data: null, error: null },
      { data: null },
    ]);
    const user = makeUser({
      identities: [{ provider: 'email', id: 'e-1' }] as User['identities'],
    });

    await expect(service.syncProfile(user)).rejects.toThrow(
      new UnauthorizedException('Could not provision profile'),
    );
  });

  it('returns the row created by a concurrent request when the insert hits a duplicate key', async () => {
    const { service } = makeService([
      { data: null },
      { data: null },
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: existingRow },
    ]);

    const result = await service.syncProfile(makeUser());

    expect(result).toBe(existingRow);
  });
});
