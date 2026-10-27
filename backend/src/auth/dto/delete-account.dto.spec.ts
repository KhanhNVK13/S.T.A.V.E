import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DeleteAccountDto } from './delete-account.dto';

// ============================================================================
// SHEET: BE-AUTH-12 (DeleteAccountDto.validate)
// ============================================================================
describe('BE-AUTH-12 DeleteAccountDto.validate(dto)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const transform = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: DeleteAccountDto });

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

  it('UTCID01 accepts a string password', async () => {
    await expect(transform({ password: 'Correct#123' })).resolves.toEqual({
      password: 'Correct#123',
    });
  });

  it('UTCID02 accepts an empty password (boundary)', async () => {
    await expect(transform({ password: '' })).resolves.toEqual({
      password: '',
    });
  });

  it('UTCID03 rejects a non-string password', async () => {
    const promise = transform({ password: 123 });

    await expectValidationRejection(promise, 'password must be a string');
  });

  it('UTCID04 rejects a missing password', async () => {
    const promise = transform({});

    await expectValidationRejection(promise, 'password must be a string');
  });
});
