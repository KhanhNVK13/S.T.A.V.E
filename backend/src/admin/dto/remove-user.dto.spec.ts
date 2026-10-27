import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RemoveUserDto } from './remove-user.dto';

// ============================================================================
// SHEET: BE-ADM-08 (RemoveUserDto.validate(body))
// ============================================================================
describe('BE-ADM-08 RemoveUserDto.validate(body)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const transform = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: RemoveUserDto });

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

  it('UTCID01 accepts a reason and confirm username', async () => {
    await expect(
      transform({
        reason: 'Copyright abuse',
        confirmUsername: 'khanh_01',
      }),
    ).resolves.toEqual({
      reason: 'Copyright abuse',
      confirmUsername: 'khanh_01',
    });
  });

  it('UTCID02 accepts a 1-character reason (boundary)', async () => {
    await expect(
      transform({ reason: 'x', confirmUsername: 'khanh_01' }),
    ).resolves.toEqual({ reason: 'x', confirmUsername: 'khanh_01' });
  });

  it('UTCID03 allows an empty confirmUsername at the DTO level', async () => {
    await expect(
      transform({ reason: 'Copyright abuse', confirmUsername: '' }),
    ).resolves.toEqual({
      reason: 'Copyright abuse',
      confirmUsername: '',
    });
  });

  it('UTCID04 rejects an empty reason', async () => {
    const promise = transform({
      reason: '',
      confirmUsername: 'khanh_01',
    });

    await expectValidationRejection(
      promise,
      'reason must be longer than or equal to 1 characters',
    );
  });

  it('UTCID05 rejects a missing reason', async () => {
    const promise = transform({ confirmUsername: 'khanh_01' });

    await expectValidationRejection(promise, 'reason must be a string');
  });

  it('UTCID06 rejects a missing confirmUsername', async () => {
    const promise = transform({ reason: 'Copyright abuse' });

    await expectValidationRejection(
      promise,
      'confirmUsername must be a string',
    );
  });
});
