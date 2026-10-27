import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ListUsersQueryDto } from './list-users-query.dto';

// ============================================================================
// SHEET: BE-ADM-05 (ListUsersQueryDto.validate(query))
// ============================================================================
describe('BE-ADM-05 ListUsersQueryDto.validate(query)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const transform = (query: Record<string, string>) =>
    pipe.transform(query, { type: 'query', metatype: ListUsersQueryDto });

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

  it('UTCID01 accepts a fully-populated valid query', async () => {
    await expect(
      transform({
        search: 'khanh',
        status: 'active',
        page: '1',
        limit: '20',
      }),
    ).resolves.toEqual({
      search: 'khanh',
      status: 'active',
      page: 1,
      limit: 20,
    });
  });

  it('UTCID02 applies defaults page=1 and limit=20 when everything is missing', async () => {
    await expect(transform({})).resolves.toEqual({
      page: 1,
      limit: 20,
    });
  });

  it('UTCID03 accepts status "removed" and the limit boundary of 100', async () => {
    await expect(
      transform({ status: 'removed', page: '1', limit: '100' }),
    ).resolves.toEqual({
      status: 'removed',
      page: 1,
      limit: 100,
    });
  });

  it('UTCID04 rejects limit greater than 100', async () => {
    const promise = transform({ page: '1', limit: '101' });

    await expectValidationRejection(
      promise,
      'limit must not be greater than 100',
    );
  });

  it('UTCID05 rejects limit of 0 (boundary)', async () => {
    const promise = transform({ page: '1', limit: '0' });

    await expectValidationRejection(promise, 'limit must not be less than 1');
  });

  it('UTCID06 rejects page of 0 (boundary)', async () => {
    const promise = transform({ page: '0', limit: '20' });

    await expectValidationRejection(promise, 'page must not be less than 1');
  });

  it('UTCID07 rejects a non-integer page', async () => {
    const promise = transform({ page: '1.5', limit: '20' });

    await expectValidationRejection(promise, 'page must be an integer number');
  });

  it('UTCID08 rejects a non-numeric page', async () => {
    const promise = transform({ page: 'abc', limit: '20' });

    await expectValidationRejection(promise, 'page must be an integer number');
  });

  it('UTCID09 rejects a status value outside the allowed enum', async () => {
    const promise = transform({ status: 'banned' });

    await expectValidationRejection(
      promise,
      'status must be one of the following values: active, suspended, removed',
    );
  });
});
