import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ChangePasswordDto } from './change-password.dto';

// ============================================================================
// SHEET: BE-AUTH-11 (ChangePasswordDto.validate)
// ============================================================================
describe('BE-AUTH-11 ChangePasswordDto.validate(dto)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const transform = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: ChangePasswordDto });

  const expectValidationRejection = async (
    promise: Promise<unknown>,
    expectedMessage: string,
  ) => {
    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    const response = (caught as BadRequestException).getResponse() as {
      message: string | string[];
    };
    const messages = Array.isArray(response.message)
      ? response.message
      : [response.message];
    expect(messages.some((m) => m.includes(expectedMessage))).toBe(true);
  };

  it('UTCID01 accepts both valid string fields', async () => {
    await expect(
      transform({ currentPassword: 'OldPass#1', newPassword: 'NewPass#2026' }),
    ).resolves.toEqual({
      currentPassword: 'OldPass#1',
      newPassword: 'NewPass#2026',
    });
  });

  it('UTCID02 accepts an 8-character newPassword (boundary)', async () => {
    await expect(
      transform({ currentPassword: 'OldPass#1', newPassword: 'abcdefgh' }),
    ).resolves.toEqual({
      currentPassword: 'OldPass#1',
      newPassword: 'abcdefgh',
    });
  });

  it('UTCID03 rejects a 7-character newPassword', async () => {
    const promise = transform({
      currentPassword: 'OldPass#1',
      newPassword: 'abcdefg',
    });

    await expectValidationRejection(
      promise,
      'newPassword must be longer than or equal to 8 characters',
    );
  });

  it('UTCID04 accepts an empty currentPassword (boundary)', async () => {
    await expect(
      transform({ currentPassword: '', newPassword: 'NewPass#2026' }),
    ).resolves.toEqual({
      currentPassword: '',
      newPassword: 'NewPass#2026',
    });
  });

  it('UTCID05 rejects a non-string currentPassword', async () => {
    const promise = transform({
      currentPassword: 123,
      newPassword: 'NewPass#2026',
    });

    await expectValidationRejection(
      promise,
      'currentPassword must be a string',
    );
  });

  it('UTCID06 rejects a missing currentPassword', async () => {
    const promise = transform({ newPassword: 'NewPass#2026' });

    await expectValidationRejection(
      promise,
      'currentPassword must be a string',
    );
  });

  it('UTCID07 rejects a non-string newPassword', async () => {
    const promise = transform({
      currentPassword: 'OldPass#1',
      newPassword: 123456789,
    });

    await expectValidationRejection(promise, 'newPassword must be a string');
  });

  it('UTCID08 rejects a missing newPassword', async () => {
    const promise = transform({ currentPassword: 'OldPass#1' });

    await expectValidationRejection(promise, 'newPassword must be a string');
  });
});
