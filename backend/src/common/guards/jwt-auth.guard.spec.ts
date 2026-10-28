import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  createSupabaseMock,
  type QueryResult,
} from '../../test-utils/supabase-mock';

// ============================================================================
// SHEET: BE-COM-02 (JwtAuthGuard.canActivate)
// ============================================================================
describe('BE-COM-02 JwtAuthGuard.canActivate(context)', () => {
  const user = { id: 'usr_1', email: 'user@stave.io' } as never;

  const makeGuard = (authHeader: string | undefined, getUser: QueryResult) => {
    const mock = createSupabaseMock([], { getUser });
    const guard = new JwtAuthGuard(mock.client);
    const req = {
      headers: { authorization: authHeader },
      user: undefined,
      accessToken: undefined,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
    return { guard, mock, context, req };
  };

  it('UTCID01 sets req.user and req.accessToken for a valid bearer token', async () => {
    const { guard, context, req } = makeGuard('Bearer jwt-token', {
      data: { user },
      error: null,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(req.user).toEqual(user);
    expect(req.accessToken).toBe('jwt-token');
  });

  it('UTCID02 rejects a missing authorization header', async () => {
    const { guard, context } = makeGuard(undefined, {
      data: { user },
      error: null,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing bearer token'),
    );
  });

  it('UTCID03 rejects a non-bearer scheme', async () => {
    const { guard, context } = makeGuard('Basic abc', {
      data: { user },
      error: null,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing bearer token'),
    );
  });

  it('UTCID04 rejects a lowercase bearer scheme', async () => {
    const { guard, context } = makeGuard('bearer jwt-token', {
      data: { user },
      error: null,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing bearer token'),
    );
  });

  it('UTCID05 rejects an empty token when getUser errors', async () => {
    const { guard, context } = makeGuard('Bearer ', {
      data: { user },
      error: { message: 'expired' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid or expired token'),
    );
  });

  it('UTCID06 rejects a token when getUser returns an error', async () => {
    const { guard, context, mock } = makeGuard('Bearer jwt-token', {
      data: { user },
      error: { message: 'expired' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid or expired token'),
    );

    expect(mock.auth.getUser).toHaveBeenCalledWith('jwt-token');
  });

  it('UTCID07 rejects a token when getUser returns a null user', async () => {
    const { guard, context } = makeGuard('Bearer jwt-token', {
      data: { user: null },
      error: null,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid or expired token'),
    );
  });
});
