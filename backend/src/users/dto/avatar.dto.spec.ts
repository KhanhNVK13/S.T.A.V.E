import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmAvatarDto, CreateAvatarUploadDto } from './avatar.dto';

const uuid = '33333333-3333-4333-8333-333333333333';

const uploadErrors = (value: Record<string, unknown>) =>
  validate(plainToInstance(CreateAvatarUploadDto, value));
const confirmErrors = (value: Record<string, unknown>) =>
  validate(plainToInstance(ConfirmAvatarDto, value));

describe('BE-USR-09 CreateAvatarUploadDto.validate(dto)', () => {
  it.each([
    { id: 'UTCID01', type: 'image/jpeg' },
    { id: 'UTCID02', type: 'image/png' },
    { id: 'UTCID03', type: 'image/webp' },
  ])('$id accepts $type', async ({ type }) => {
    await expect(uploadErrors({ contentType: type })).resolves.toHaveLength(0);
  });

  it.each([
    { id: 'UTCID04', type: 'image/gif' },
    { id: 'UTCID05', type: 'image/svg+xml' },
    { id: 'UTCID06', type: 'application/pdf' },
  ])('$id rejects $type', async ({ type }) => {
    const errors = await uploadErrors({ contentType: type });
    expect(errors.map((e) => e.property)).toEqual(['contentType']);
  });

  it('UTCID07 rejects a missing content type', async () => {
    const errors = await uploadErrors({});
    expect(errors.map((e) => e.property)).toEqual(['contentType']);
  });
});

describe('BE-USR-11 ConfirmAvatarDto.validate(dto)', () => {
  it('UTCID01 accepts a stored file path inside a user folder', async () => {
    await expect(
      confirmErrors({ path: `${uuid}/${uuid}.webp` }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID02 rejects a stored file path with another extension or folder depth', async () => {
    const gif = await confirmErrors({ path: `${uuid}/${uuid}.gif` });
    const deep = await confirmErrors({ path: `${uuid}/x/${uuid}.png` });
    expect(gif[0].constraints).toEqual(
      expect.objectContaining({ matches: 'Invalid avatar path' }),
    );
    expect(deep).toHaveLength(1);
  });
});
