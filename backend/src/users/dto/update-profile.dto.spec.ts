import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

const usernameMessage =
  'username must be 3-20 chars: lowercase letters, digits, _';

async function profileErrors(value: Record<string, unknown>) {
  return validate(plainToInstance(UpdateProfileDto, value));
}

async function constraintsOf(value: Record<string, unknown>) {
  const errors = await profileErrors(value);
  return errors.map((error) => ({
    property: error.property,
    constraints: error.constraints,
  }));
}

describe('BE-USR-06 UpdateProfileDto.validate(dto)', () => {
  it('UTCID01 accepts a fully valid profile', async () => {
    await expect(
      profileErrors({
        displayName: 'Khanh Nguyen',
        username: 'khanh_01',
        bio: 'Producer',
        avatarUrl: 'https://cdn.stave.io/a.png',
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID02 accepts 80-char display name, 3-char username and 500-char bio', async () => {
    await expect(
      profileErrors({
        displayName: 'a'.repeat(80),
        username: 'abc',
        bio: 'b'.repeat(500),
        avatarUrl: 'https://cdn.stave.io/a.png',
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID03 accepts a missing display name with a 20-char username', async () => {
    await expect(
      profileErrors({ username: 'a'.repeat(20) }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID04 rejects an 81-char display name', async () => {
    await expect(
      constraintsOf({ displayName: 'a'.repeat(81) }),
    ).resolves.toEqual([
      {
        property: 'displayName',
        constraints: {
          maxLength:
            'displayName must be shorter than or equal to 80 characters',
        },
      },
    ]);
  });

  it('UTCID05 rejects a 2-char username', async () => {
    await expect(constraintsOf({ username: 'ab' })).resolves.toEqual([
      { property: 'username', constraints: { matches: usernameMessage } },
    ]);
  });

  it('UTCID06 rejects a 21-char username', async () => {
    await expect(constraintsOf({ username: 'a'.repeat(21) })).resolves.toEqual([
      { property: 'username', constraints: { matches: usernameMessage } },
    ]);
  });

  it.failing(
    'UTCID07 accepts a username with uppercase letters (SRS)',
    async () => {
      await expect(profileErrors({ username: 'Khanh' })).resolves.toHaveLength(
        0,
      );
    },
  );

  it('UTCID08 rejects a username with a hyphen', async () => {
    await expect(constraintsOf({ username: 'kh-01' })).resolves.toEqual([
      { property: 'username', constraints: { matches: usernameMessage } },
    ]);
  });

  it('UTCID09 rejects a 501-char bio', async () => {
    await expect(constraintsOf({ bio: 'b'.repeat(501) })).resolves.toEqual([
      {
        property: 'bio',
        constraints: {
          maxLength: 'bio must be shorter than or equal to 500 characters',
        },
      },
    ]);
  });

  it('UTCID10 rejects an avatar URL that is not a URL', async () => {
    await expect(constraintsOf({ avatarUrl: 'not a url' })).resolves.toEqual([
      {
        property: 'avatarUrl',
        constraints: { isUrl: 'avatarUrl must be a URL address' },
      },
    ]);
  });

  it('UTCID11 rejects an empty display name (SRS UC-15 3.E1)', async () => {
    await expect(constraintsOf({ displayName: '' })).resolves.toEqual([
      {
        property: 'displayName',
        constraints: expect.objectContaining({
          isNotEmpty: 'displayName should not be empty',
        }),
      },
    ]);
  });

  it('UTCID12 rejects an empty username', async () => {
    await expect(constraintsOf({ username: '' })).resolves.toEqual([
      { property: 'username', constraints: { matches: usernameMessage } },
    ]);
  });
});
