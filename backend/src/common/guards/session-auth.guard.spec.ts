import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionAuthGuard } from './session-auth.guard';
import {
  createSupabaseMock,
  type QueryResult,
} from '../../test-utils/supabase-mock';

// ============================================================================
// SHEET: BE-COM-03 (SessionAuthGuard.canActivate)
// ============================================================================
describe('BE-COM-03 SessionAuthGuard.canActivate(context)', () => {
  const ok: QueryResult = { data: null, error: null };
  const UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

  const session = (overrides: Record<string, unknown> = {}) =>
    ({
      id: UUID,
      user_id: 'usr_1',
      revoked_at: null,
      ...overrides,
    }) as unknown;

  const makeGuard = (
    sessionResults: QueryResult[],
    opts: {
      /** null = header key absent; a string or string[] is the header value. */
      header?: string | string[] | null;
      userId?: string;
    } = {},
  ) => {
    const mock = createSupabaseMock([], {
      tables: { sessions: sessionResults },
    });
    const guard = new SessionAuthGuard(mock.client);
    const header = opts.header === undefined ? UUID : opts.header;
    const req = {
      headers: header === null ? {} : { 'x-session-id': header },
      user: { id: opts.userId ?? 'usr_1' },
      sessionId: undefined,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
    return { guard, mock, context, req };
  };

  it('UTCID01 allows an owned, non-revoked session and sets req.sessionId', async () => {
    const { guard, mock, context, req } = makeGuard([
      { data: session(), error: null }, // lookup
      ok, // last_active_at update
    ]);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(req.sessionId).toBe(UUID);
    expect(mock.builders.sessions.select).toHaveBeenCalledWith(
      'id, user_id, revoked_at',
    );
    expect(mock.builders.sessions.eq).toHaveBeenCalledWith('id', UUID);
  });

  it('UTCID02 still allows the request when the last_active_at update errors (ignored)', async () => {
    const { guard, context, req } = makeGuard([
      { data: session(), error: null }, // lookup
      { data: null, error: { message: 'update failed' } }, // update error
    ]);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(req.sessionId).toBe(UUID);
  });

  it('UTCID03 rejects a missing X-Session-Id header', async () => {
    const { guard, mock, context } = makeGuard([], { header: null });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing X-Session-Id header'),
    );

    expect(mock.builders.sessions.select).not.toHaveBeenCalled();
  });

  it('UTCID04 rejects an empty X-Session-Id header', async () => {
    const { guard, mock, context } = makeGuard([], { header: '' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing X-Session-Id header'),
    );

    expect(mock.builders.sessions.select).not.toHaveBeenCalled();
  });

  it('UTCID05 rejects a header sent twice (array value)', async () => {
    const { guard, mock, context } = makeGuard([], { header: [UUID, UUID] });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing X-Session-Id header'),
    );

    expect(mock.builders.sessions.select).not.toHaveBeenCalled();
  });

  it('UTCID06 rejects a session owned by another user', async () => {
    const { guard, context } = makeGuard([
      { data: session({ user_id: 'usr_other' }), error: null }, // lookup
      ok, // last_active_at update (only reached if the ownership check is missing)
    ]);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Session revoked or not found'),
    );
  });

  it('UTCID07 rejects a revoked session', async () => {
    const { guard, context } = makeGuard([
      { data: session({ revoked_at: '2026-01-01T00:00:00Z' }), error: null },
    ]);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Session revoked or not found'),
    );
  });

  it('UTCID08 rejects an unknown session id', async () => {
    const { guard, context } = makeGuard([{ data: null, error: null }]);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Session revoked or not found'),
    );
  });

  it('UTCID09 rejects the request when the sessions lookup errors', async () => {
    const { guard, context } = makeGuard([
      { data: null, error: { message: 'db error' } },
    ]);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Session revoked or not found'),
    );
  });
});
