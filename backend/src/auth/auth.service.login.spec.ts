import type { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import type { AccountRemovalService } from '../account-removal/account-removal.service';
import { AuthService } from './auth.service';

function makeService(
  attempt: { failed_count: number; locked_until: string | null } | null,
  rpcRow?: { o_failed_count: number; o_locked_until: string | null },
) {
  const mock = createSupabaseMock([], {
    tables: {
      login_attempts: [
        { data: attempt, error: null },
        { data: null, error: null },
      ],
    },
    rpc: rpcRow ? { record_failed_login: { data: [rpcRow], error: null } } : {},
  });
  const config = {
    get: jest.fn(() => 'anon-key'),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
      throw new Error(`missing ${key}`);
    }),
  } as unknown as ConfigService;
  const service = new AuthService(
    mock.client,
    config,
    {} as AccountRemovalService,
  );
  return { service, mock };
}

function reply(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

async function failure(call: Promise<unknown>): Promise<HttpException> {
  try {
    await call;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected the login to fail');
}

describe('BE-AUTH-LOGIN password login with lockout (BR-07)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('UTCID01 returns the session and clears the counter on success', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(reply(200, { access_token: 'a', refresh_token: 'r' }));
    const { service, mock } = makeService({
      failed_count: 3,
      locked_until: null,
    });
    await expect(service.login('A@B.C', 'pw')).resolves.toMatchObject({
      access_token: 'a',
    });
    expect(mock.builders.login_attempts.delete).toHaveBeenCalled();
  });

  it('UTCID02 reports the attempts left after a wrong password', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(reply(400, { error_code: 'invalid_credentials' }));
    const { service } = makeService(null, {
      o_failed_count: 2,
      o_locked_until: null,
    });
    const error = await failure(service.login('a@b.c', 'bad'));
    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({
      code: 'invalid_credentials',
      remainingAttempts: 3,
    });
  });

  it('UTCID03 locks the email when the fifth wrong password is recorded', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(reply(400, { error_code: 'invalid_credentials' }));
    const until = new Date(Date.now() + 15 * 60_000).toISOString();
    const { service } = makeService(null, {
      o_failed_count: 5,
      o_locked_until: until,
    });
    const error = await failure(service.login('a@b.c', 'bad'));
    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toMatchObject({ code: 'login_locked' });
  });

  it('UTCID04 refuses a locked email without asking Supabase Auth', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const until = new Date(Date.now() + 10 * 60_000).toISOString();
    const { service } = makeService({ failed_count: 5, locked_until: until });
    const error = await failure(service.login('a@b.c', 'right'));
    expect(error.getStatus()).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('UTCID05 lets the email try again once the lock has expired', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(reply(200, { access_token: 'a', refresh_token: 'r' }));
    const past = new Date(Date.now() - 60_000).toISOString();
    const { service } = makeService({ failed_count: 5, locked_until: past });
    await expect(service.login('a@b.c', 'pw')).resolves.toMatchObject({
      access_token: 'a',
    });
  });

  it('UTCID06 does not count an unconfirmed email as a failed attempt', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      reply(400, {
        error_code: 'email_not_confirmed',
        msg: 'Email not confirmed',
      }),
    );
    const { service, mock } = makeService(null);
    const error = await failure(service.login('a@b.c', 'pw'));
    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ code: 'email_not_confirmed' });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('UTCID07 reports an unavailable service when Supabase Auth cannot be reached', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const { service } = makeService(null);
    const error = await failure(service.login('a@b.c', 'pw'));
    expect(error.getStatus()).toBe(503);
  });
});
