import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import {
  createSupabaseMock,
  type QueryResult,
} from '../../test-utils/supabase-mock';

// ============================================================================
// SHEET: BE-COM-01 (AdminGuard.canActivate)
// ============================================================================
describe('BE-COM-01 AdminGuard.canActivate(context)', () => {
  const makeGuard = (
    usersResults: QueryResult[],
    request: { user?: { id: string } },
  ) => {
    const mock = createSupabaseMock([], {
      tables: { users: usersResults },
    });
    const guard = new AdminGuard(mock.client);
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    return { guard, mock, context };
  };

  it('UTCID01 allows the request through for an admin row', async () => {
    const { guard, mock, context } = makeGuard(
      [{ data: { role: 'admin' }, error: null }],
      { user: { id: 'usr_1' } },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(mock.builders.users.select).toHaveBeenCalledWith('role');
    expect(mock.builders.users.eq).toHaveBeenCalledWith('id', 'usr_1');
  });

  it('UTCID02 rejects a regular user with ForbiddenException', async () => {
    const { guard, context } = makeGuard(
      [{ data: { role: 'user' }, error: null }],
      { user: { id: 'usr_1' } },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Admin privileges required'),
    );
  });

  it('UTCID03 rejects a missing user row with ForbiddenException', async () => {
    const { guard, context } = makeGuard([{ data: null, error: null }], {
      user: { id: 'usr_404' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Admin privileges required'),
    );
  });

  it('UTCID04 rejects a lookup error with ForbiddenException', async () => {
    const { guard, context } = makeGuard(
      [{ data: null, error: { message: 'db error' } }],
      { user: { id: 'usr_1' } },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Admin privileges required'),
    );
  });

  it('UTCID05 throws TypeError when req.user is missing (guard order wrong)', async () => {
    const { guard, context } = makeGuard(
      [{ data: { role: 'admin' } }, { data: { role: 'admin' } }],
      {},
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      new TypeError("Cannot read properties of undefined (reading 'id')"),
    );
  });
});
