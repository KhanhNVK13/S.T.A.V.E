import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import type { AccountRemovalService } from '../account-removal/account-removal.service';
import { AuthService } from './auth.service';

function makeService(anonKey?: string) {
  const config = {
    get: jest.fn((key: string) =>
      key === 'SUPABASE_ANON_KEY' ? anonKey : undefined,
    ),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
      if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-key';
      throw new Error(`missing ${key}`);
    }),
  } as unknown as ConfigService;
  return new AuthService(
    createSupabaseMock().client,
    config,
    {} as AccountRemovalService,
  );
}

type Internals = {
  verifyPassword(email: string, password: string): Promise<boolean>;
  selfUpdatePassword(token: string, password: string): Promise<void>;
};

function sentApiKey(fetchMock: jest.SpyInstance): string {
  const init = fetchMock.mock.calls[0][1] as {
    headers: Record<string, string>;
  };
  return init.headers.apikey;
}

describe('BE-AUTH-APIKEY apikey header of user-scoped Auth calls', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const okResponse = { ok: true, status: 200 } as unknown as Response;

  it('UTCID01 password check sends the anon key when it is configured', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse);
    const service = makeService('anon-key') as unknown as Internals;
    await service.verifyPassword('a@b.c', 'pw');
    expect(sentApiKey(fetchMock)).toBe('anon-key');
  });

  it('UTCID02 self-service password change sends the anon key when it is configured', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse);
    const service = makeService('anon-key') as unknown as Internals;
    await service.selfUpdatePassword('user-token', 'new-pw');
    expect(sentApiKey(fetchMock)).toBe('anon-key');
    const init = fetchMock.mock.calls[0][1] as {
      headers: Record<string, string>;
    };
    expect(init.headers.Authorization).toBe('Bearer user-token');
  });

  it('UTCID03 without the anon key both calls keep the old service-role key and warn only once', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse);
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = makeService() as unknown as Internals;
    await service.verifyPassword('a@b.c', 'pw');
    await service.verifyPassword('a@b.c', 'pw');
    await service.selfUpdatePassword('user-token', 'new-pw');
    expect(fetchMock.mock.calls).toHaveLength(3);
    for (const call of fetchMock.mock.calls) {
      expect(
        (call[1] as { headers: Record<string, string> }).headers.apikey,
      ).toBe('service-role-key');
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('SUPABASE_ANON_KEY');
    expect(String(warn.mock.calls[0][0])).not.toContain('service-role-key');
  });
});
