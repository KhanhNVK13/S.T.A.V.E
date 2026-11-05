import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RegisterSessionDto } from './register-session.dto';

// ============================================================================
// SHEET: BE-AUTH-13 (RegisterSessionDto.validate)
// ============================================================================
describe('BE-AUTH-13 RegisterSessionDto.validate(dto)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const transform = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: RegisterSessionDto });

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

  it('UTCID01 accepts a valid deviceLabel string "Chrome on Windows"', async () => {
    await expect(
      transform({ deviceLabel: 'Chrome on Windows' }),
    ).resolves.toEqual({
      deviceLabel: 'Chrome on Windows',
    });
  });

  it('UTCID02 accepts missing/undefined deviceLabel', async () => {
    await expect(transform({})).resolves.toEqual({});
  });

  it('UTCID03 accepts null deviceLabel', async () => {
    await expect(transform({ deviceLabel: null })).resolves.toEqual({
      deviceLabel: null,
    });
  });

  it('UTCID04 accepts 200 characters deviceLabel (boundary)', async () => {
    const label200 = 'A'.repeat(200);
    await expect(transform({ deviceLabel: label200 })).resolves.toEqual({
      deviceLabel: label200,
    });
  });

  it('UTCID05 rejects 201 characters deviceLabel (over 200 boundary)', async () => {
    const label201 = 'A'.repeat(201);
    await expectValidationRejection(
      transform({ deviceLabel: label201 }),
      'deviceLabel must be shorter than or equal to 200 characters',
    );
  });

  it('UTCID06 rejects non-string deviceLabel 42', async () => {
    await expectValidationRejection(
      transform({ deviceLabel: 42 }),
      'deviceLabel must be a string',
    );
  });
});

