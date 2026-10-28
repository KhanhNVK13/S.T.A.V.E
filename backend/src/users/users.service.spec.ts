import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import { UsersService } from './users.service';
import type { UserRow } from './user-row.type';

const userId = '11111111-1111-4111-8111-111111111111';
const themeId = '22222222-2222-4222-8222-222222222222';

const userRow: UserRow = {
  id: userId,
  email: 'khanh@stave.io',
  password_hash: null,
  google_id: null,
  display_name: 'Khanh Nguyen',
  username: 'khanh_01',
  bio: 'Producer',
  avatar_url: 'https://cdn.stave.io/a.png',
  created_at: '2026-10-21T00:00:00.000Z',
  updated_at: '2026-10-21T00:00:00.000Z',
  status: 'active',
  active_theme_id: null,
  role: 'user',
};

function makeService(tables: SupabaseMockOptions['tables'] = {}) {
  const mock = createSupabaseMock([], { tables });
  const service = new UsersService(mock.client, {
    getOrThrow: () => 'https://project.supabase.co',
  } as unknown as ConfigService);
  return { service, ...mock };
}

describe('BE-USR-01 UsersService.getProfile(userId)', () => {
  it('UTCID01 returns the profile row', async () => {
    const { service, builders } = makeService({ users: [{ data: userRow }] });

    await expect(service.getProfile(userId)).resolves.toBe(userRow);
    expect(builders.users.eq).toHaveBeenCalledWith('id', userId);
  });

  it('UTCID02 throws NotFoundException when no row exists', async () => {
    const { service } = makeService({ users: [{ data: null, error: null }] });

    await expect(service.getProfile(userId)).rejects.toThrow(
      new NotFoundException('Profile not found'),
    );
  });

  it('UTCID03 throws NotFoundException when the select fails', async () => {
    const { service } = makeService({
      users: [{ data: null, error: { message: 'db down' } }],
    });

    await expect(service.getProfile(userId)).rejects.toThrow(
      new NotFoundException('Profile not found'),
    );
  });

  it('UTCID04 throws NotFoundException for a malformed id', async () => {
    const { service, builders } = makeService({
      users: [{ data: null, error: { code: '22P02', message: 'bad uuid' } }],
    });

    await expect(service.getProfile('not-a-uuid')).rejects.toThrow(
      new NotFoundException('Profile not found'),
    );
    expect(builders.users.eq).toHaveBeenCalledWith('id', 'not-a-uuid');
  });
});

describe('BE-USR-02 UsersService.updateProfile(userId, dto)', () => {
  const fullDto = {
    displayName: 'New Name',
    username: 'new_name',
    bio: 'New bio',
    avatarUrl: 'https://cdn.stave.io/b.png',
  };

  it('UTCID01 patches all four fields and returns the updated row', async () => {
    const updated = { ...userRow, display_name: 'New Name' };
    const { service, builders } = makeService({ users: [{ data: updated }] });

    await expect(service.updateProfile(userId, fullDto)).resolves.toBe(updated);
    expect(builders.users.update).toHaveBeenCalledWith({
      display_name: 'New Name',
      username: 'new_name',
      bio: 'New bio',
      avatar_url: 'https://cdn.stave.io/b.png',
    });
    expect(builders.users.eq).toHaveBeenCalledWith('id', userId);
  });

  it('UTCID02 patches only display_name when only displayName is set', async () => {
    const updated = { ...userRow, display_name: 'Only Name' };
    const { service, builders } = makeService({ users: [{ data: updated }] });

    await expect(
      service.updateProfile(userId, { displayName: 'Only Name' }),
    ).resolves.toBe(updated);
    expect(builders.users.update).toHaveBeenCalledWith({
      display_name: 'Only Name',
    });
  });

  it('UTCID03 patches an empty bio so it is cleared', async () => {
    const updated = { ...userRow, bio: '' };
    const { service, builders } = makeService({ users: [{ data: updated }] });

    await expect(service.updateProfile(userId, { bio: '' })).resolves.toBe(
      updated,
    );
    expect(builders.users.update).toHaveBeenCalledWith({ bio: '' });
  });

  it('UTCID04 sends an empty patch for an empty dto', async () => {
    const { service, builders } = makeService({ users: [{ data: userRow }] });

    await expect(service.updateProfile(userId, {})).resolves.toBe(userRow);
    expect(builders.users.update).toHaveBeenCalledWith({});
  });

  it('UTCID05 maps unique violation 23505 to "Username already taken"', async () => {
    const { service } = makeService({
      users: [{ data: null, error: { code: '23505', message: 'dup' } }],
    });

    await expect(service.updateProfile(userId, fullDto)).rejects.toThrow(
      new BadRequestException('Username already taken'),
    );
  });

  it('UTCID06 maps any other error code to "Could not update profile"', async () => {
    const { service } = makeService({
      users: [{ data: null, error: { code: '42501', message: 'denied' } }],
    });

    await expect(service.updateProfile(userId, fullDto)).rejects.toThrow(
      new BadRequestException('Could not update profile'),
    );
  });

  it('UTCID07 maps PGRST116 (no row) to "Could not update profile"', async () => {
    const { service } = makeService({
      users: [{ data: null, error: { code: 'PGRST116', message: 'no rows' } }],
    });

    await expect(
      service.updateProfile(userId, { displayName: 'Ghost' }),
    ).rejects.toThrow(new BadRequestException('Could not update profile'));
  });
});

describe('BE-USR-03 UsersService.getActiveTheme(userId)', () => {
  it('UTCID01 maps a preset theme row', async () => {
    const { service, builders } = makeService({
      users: [{ data: { active_theme_id: themeId } }],
      themes: [
        {
          data: {
            id: themeId,
            user_id: userId,
            type: 'preset',
            preset_key: 'moss',
            generated_palette: null,
          },
        },
      ],
    });

    await expect(service.getActiveTheme(userId)).resolves.toEqual({
      type: 'preset',
      presetKey: 'moss',
      generatedPalette: null,
    });
    expect(builders.themes.eq).toHaveBeenCalledWith('id', themeId);
  });

  it('UTCID02 maps a custom theme row with its palette', async () => {
    const palette = { accent: '#112233', surface: '#ffffff' };
    const { service } = makeService({
      users: [{ data: { active_theme_id: themeId } }],
      themes: [
        {
          data: {
            id: themeId,
            user_id: userId,
            type: 'custom',
            preset_key: null,
            generated_palette: palette,
          },
        },
      ],
    });

    await expect(service.getActiveTheme(userId)).resolves.toEqual({
      type: 'custom',
      presetKey: null,
      generatedPalette: palette,
    });
  });

  it('UTCID03 returns null without reading themes when no theme is linked', async () => {
    const { service, builders } = makeService({
      users: [{ data: { active_theme_id: null } }],
      themes: [],
    });

    await expect(service.getActiveTheme(userId)).resolves.toBeNull();
    expect(builders.themes.maybeSingle).not.toHaveBeenCalled();
  });

  it('UTCID04 returns null when the linked theme row is gone', async () => {
    const { service } = makeService({
      users: [{ data: { active_theme_id: themeId } }],
      themes: [{ data: null }],
    });

    await expect(service.getActiveTheme(userId)).resolves.toBeNull();
  });

  it('UTCID05 throws NotFoundException when the user is missing', async () => {
    const { service, builders } = makeService({
      users: [{ data: null }],
      themes: [],
    });

    await expect(service.getActiveTheme(userId)).rejects.toThrow(
      new NotFoundException('Profile not found'),
    );
    expect(builders.themes.maybeSingle).not.toHaveBeenCalled();
  });

  it('UTCID06 throws NotFoundException when the user select fails', async () => {
    const { service } = makeService({
      users: [{ data: null, error: { message: 'db down' } }],
      themes: [],
    });

    await expect(service.getActiveTheme(userId)).rejects.toThrow(
      new NotFoundException('Profile not found'),
    );
  });
});

describe('BE-USR-04 UsersService.setPresetTheme(userId, presetKey)', () => {
  it('UTCID01 updates the existing preset row and links it', async () => {
    const { service, builders } = makeService({
      themes: [{ data: { id: themeId } }, { data: null, error: null }],
      users: [{ data: null, error: null }],
    });

    await expect(service.setPresetTheme(userId, 'moss')).resolves.toEqual({
      type: 'preset',
      presetKey: 'moss',
      generatedPalette: null,
    });
    expect(builders.themes.update).toHaveBeenCalledWith({ preset_key: 'moss' });
    expect(builders.themes.eq).toHaveBeenCalledWith('id', themeId);
    expect(builders.themes.insert).not.toHaveBeenCalled();
    expect(builders.users.update).toHaveBeenCalledWith({
      active_theme_id: themeId,
    });
    expect(builders.users.eq).toHaveBeenCalledWith('id', userId);
  });

  it('UTCID02 inserts a new preset row and links it', async () => {
    const { service, builders } = makeService({
      themes: [{ data: null }, { data: { id: themeId } }],
      users: [{ data: null, error: null }],
    });

    await expect(service.setPresetTheme(userId, 'unleashed')).resolves.toEqual({
      type: 'preset',
      presetKey: 'unleashed',
      generatedPalette: null,
    });
    expect(builders.themes.insert).toHaveBeenCalledWith({
      user_id: userId,
      type: 'preset',
      preset_key: 'unleashed',
    });
    expect(builders.themes.update).not.toHaveBeenCalled();
    expect(builders.users.update).toHaveBeenCalledWith({
      active_theme_id: themeId,
    });
  });

  it('UTCID03 throws "Could not save theme" when the update fails', async () => {
    const { service, builders } = makeService({
      themes: [{ data: { id: themeId } }, { error: { message: 'denied' } }],
      users: [],
    });

    await expect(service.setPresetTheme(userId, 'moss')).rejects.toThrow(
      new BadRequestException('Could not save theme'),
    );
    expect(builders.users.update).not.toHaveBeenCalled();
  });

  it('UTCID04 throws "Could not save theme" when the insert fails', async () => {
    const { service, builders } = makeService({
      themes: [{ data: null }, { data: null, error: { message: 'denied' } }],
      users: [],
    });

    await expect(service.setPresetTheme(userId, 'claret')).rejects.toThrow(
      new BadRequestException('Could not save theme'),
    );
    expect(builders.users.update).not.toHaveBeenCalled();
  });

  it('UTCID05 throws "Could not apply theme" when linking fails after an update', async () => {
    const { service } = makeService({
      themes: [{ data: { id: themeId } }, { data: null, error: null }],
      users: [{ error: { message: 'denied' } }],
    });

    await expect(service.setPresetTheme(userId, 'moss')).rejects.toThrow(
      new BadRequestException('Could not apply theme'),
    );
  });

  it('UTCID06 throws "Could not apply theme" when linking fails after an insert', async () => {
    const { service } = makeService({
      themes: [{ data: null }, { data: { id: themeId } }],
      users: [{ error: { message: 'denied' } }],
    });

    await expect(service.setPresetTheme(userId, 'unleashed')).rejects.toThrow(
      new BadRequestException('Could not apply theme'),
    );
  });

  it('UTCID07 inserts a new row when the lookup errors on multiple rows', async () => {
    const { service, builders } = makeService({
      themes: [
        { data: null, error: { code: 'PGRST116', message: 'multiple rows' } },
        { data: { id: themeId } },
      ],
      users: [{ data: null, error: null }],
    });

    await expect(service.setPresetTheme(userId, 'claret')).resolves.toEqual({
      type: 'preset',
      presetKey: 'claret',
      generatedPalette: null,
    });
    expect(builders.themes.insert).toHaveBeenCalledWith({
      user_id: userId,
      type: 'preset',
      preset_key: 'claret',
    });
  });
});

describe('BE-USR-05 UsersService avatar upload', () => {
  const fileName = '33333333-3333-4333-8333-333333333333.webp';
  const path = `${userId}/${fileName}`;

  function makeAvatarService(
    storage: Record<string, unknown>,
    tables: SupabaseMockOptions['tables'] = {},
  ) {
    const mock = createSupabaseMock([], {
      tables,
      storage: { avatars: storage as never },
    });
    const service = new UsersService(mock.client, {
      getOrThrow: () => 'https://project.supabase.co',
    } as unknown as ConfigService);
    return { service, ...mock };
  }

  it('UTCID01 creates a signed upload URL under the user folder', async () => {
    const { service } = makeAvatarService(
      { createSignedUploadUrl: { data: { token: 'tok' } } },
      { users: [{ data: { avatar_url: null } }] },
    );

    const result = await service.createAvatarUploadUrl(userId, 'image/webp');

    expect(result.token).toBe('tok');
    expect(result.path).toMatch(new RegExp(`^${userId}/[0-9a-f-]{36}[.]webp$`));
  });

  it('UTCID02 rejects a confirm for a path outside the user folder', async () => {
    const { service } = makeAvatarService({});

    await expect(
      service.confirmAvatar(userId, `other-user/${fileName}`),
    ).rejects.toThrow(new BadRequestException('Invalid avatar path'));
  });

  it('UTCID03 rejects a confirm when the file was never uploaded', async () => {
    const { service } = makeAvatarService({ list: { data: [] } });

    await expect(service.confirmAvatar(userId, path)).rejects.toThrow(
      new BadRequestException('Avatar file was not uploaded'),
    );
  });

  it('UTCID04 removes and rejects a file above 2 MB', async () => {
    const { service, storage } = makeAvatarService({
      list: { data: [{ name: fileName, metadata: { size: 3 * 1024 * 1024 } }] },
      remove: { data: [] },
    });

    await expect(service.confirmAvatar(userId, path)).rejects.toThrow(
      new BadRequestException('Avatar file is too large'),
    );
    expect(storage.from).toHaveBeenCalledWith('avatars');
  });

  it('UTCID05 saves the public URL and removes older avatars', async () => {
    const { service, builders } = makeAvatarService(
      {
        list: [
          { data: [{ name: fileName, metadata: { size: 40_000 } }] },
          { data: [{ name: fileName }, { name: 'old.png' }] },
        ],
        remove: { data: [] },
      },
      { users: [{ data: { ...userRow, avatar_url: 'x' } }] },
    );

    await service.confirmAvatar(userId, path);

    expect(builders.users.update).toHaveBeenCalledWith({
      avatar_url: `https://project.supabase.co/storage/v1/object/public/avatars/${path}`,
    });
  });

  it('UTCID06 clears the avatar column when removing', async () => {
    const { service, builders } = makeAvatarService(
      { list: { data: [{ name: 'old.png' }] }, remove: { data: [] } },
      { users: [{ data: { ...userRow, avatar_url: null } }] },
    );

    await service.removeAvatar(userId);

    expect(builders.users.update).toHaveBeenCalledWith({ avatar_url: null });
  });
});
