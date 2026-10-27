import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ReactivateUserDto } from './reactivate-user.dto';

// ============================================================================
// SHEET: BE-ADM-07 (ReactivateUserDto.validate(body))
// ============================================================================
describe('BE-ADM-07 ReactivateUserDto.validate(body)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const transform = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: ReactivateUserDto });

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

  it('UTCID01 accepts a policy reason', async () => {
    await expect(transform({ reason: 'Appeal accepted' })).resolves.toEqual({
      reason: 'Appeal accepted',
    });
  });

  it('UTCID02 accepts a 1-character reason (boundary)', async () => {
    await expect(transform({ reason: 'x' })).resolves.toEqual({
      reason: 'x',
    });
  });

  it('UTCID03 rejects an empty reason', async () => {
    const promise = transform({ reason: '' });

    await expectValidationRejection(
      promise,
      'reason must be longer than or equal to 1 characters',
    );
  });

  it('UTCID04 rejects a non-string reason', async () => {
    const promise = transform({ reason: 123 });

    await expectValidationRejection(promise, 'reason must be a string');
  });

  it('UTCID05 rejects a missing reason', async () => {
    const promise = transform({});

    await expectValidationRejection(promise, 'reason must be a string');
  });

  it('UTCID06 rejects a whitespace-only reason (not a reason, SRS UC-97 2.E1)', async () => {
    const promise = transform({ reason: '   ' });

    await expectValidationRejection(promise, 'reason should not be empty');
  });
});
