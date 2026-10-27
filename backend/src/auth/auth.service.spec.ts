import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';

// ============================================================================
// SHEET: BE-AUTH-01 (AuthService.verifyPassword)
// ============================================================================
describe('BE-AUTH-01 AuthService.verifyPassword(email, password)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  const makeConfig = (missingKey?: string) =>
    ({
      getOrThrow: jest.fn((key: string) => {
        if (key === missingKey) {
          throw new TypeError(`Configuration key "${key}" does not exist`);
        }
        if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-key';
        throw new TypeError(`Configuration key "${key}" does not exist`);
      }),
    }) as unknown as ConfigService;

  const makeService = (missingKey?: string) => {
    const { client } = createSupabaseMock();
    return new AuthService(client, makeConfig(missingKey));
  };

  const callVerifyPassword = (
    service: AuthService,
    email: string,
    password: string,
  ): Promise<boolean> =>
    (
      service as unknown as {
        verifyPassword(email: string, password: string): Promise<boolean>;
      }
    ).verifyPassword(email, password);

  it('UTCID01 returns true when the token endpoint responds 200 OK', async () => {
    const service = makeService();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: 'valid-token' }),
    } as unknown as Response);

    const result = await callVerifyPassword(
      service,
      'user@stave.io',
      'Correct#123',
    );

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/token?grant_type=password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'user@stave.io',
          password: 'Correct#123',
        }),
      }),
    );
  });

  it('UTCID02 returns false when the token endpoint responds 400 invalid_grant', async () => {
    const service = makeService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'invalid_grant' }),
    } as unknown as Response);

    const result = await callVerifyPassword(service, 'user@stave.io', 'wrong');

    expect(result).toBe(false);
  });

  it('UTCID03 returns false when the token endpoint responds 500', async () => {
    const service = makeService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'internal_server_error' }),
    } as unknown as Response);

    const result = await callVerifyPassword(
      service,
      'user@stave.io',
      'Correct#123',
    );

    expect(result).toBe(false);
  });

  it('UTCID04 returns false when the token endpoint responds 400 for an empty email', async () => {
    const service = makeService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'invalid_grant' }),
    } as unknown as Response);

    const result = await callVerifyPassword(service, '', 'Correct#123');

    expect(result).toBe(false);
  });

  it('UTCID05 throws TypeError when SUPABASE_URL is missing in config', async () => {
    const service = makeService('SUPABASE_URL');
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(
      callVerifyPassword(service, 'user@stave.io', 'Correct#123'),
    ).rejects.toThrow(
      new TypeError('Configuration key "SUPABASE_URL" does not exist'),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('UTCID06 throws TypeError when the fetch call rejects', async () => {
    const service = makeService();
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      callVerifyPassword(service, 'user@stave.io', 'Correct#123'),
    ).rejects.toThrow(new TypeError('fetch failed'));
  });

  it('UTCID07 throws TypeError when SUPABASE_SERVICE_ROLE_KEY is missing in config', async () => {
    const service = makeService('SUPABASE_SERVICE_ROLE_KEY');
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(
      callVerifyPassword(service, 'user@stave.io', 'Correct#123'),
    ).rejects.toThrow(
      new TypeError(
        'Configuration key "SUPABASE_SERVICE_ROLE_KEY" does not exist',
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// SHEET: BE-AUTH-02 (AuthService.selfUpdatePassword)
// ============================================================================
describe('BE-AUTH-02 AuthService.selfUpdatePassword(accessToken, newPassword)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  const makeConfig = (missingKey?: string) =>
    ({
      getOrThrow: jest.fn((key: string) => {
        if (key === missingKey) {
          throw new TypeError(`Configuration key "${key}" does not exist`);
        }
        if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-key';
        throw new TypeError(`Configuration key "${key}" does not exist`);
      }),
    }) as unknown as ConfigService;

  const makeService = (missingKey?: string) => {
    const { client } = createSupabaseMock();
    return new AuthService(client, makeConfig(missingKey));
  };

  const callSelfUpdatePassword = (
    service: AuthService,
    accessToken: string,
    newPassword: string,
  ): Promise<void> =>
    (
      service as unknown as {
        selfUpdatePassword(
          accessToken: string,
          newPassword: string,
        ): Promise<void>;
      }
    ).selfUpdatePassword(accessToken, newPassword);

  const mockResponse = (status: number) =>
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve({}),
    } as unknown as Response);

  it('UTCID01 resolves void and updates the password when the endpoint responds 200 OK', async () => {
    const service = makeService();
    const fetchMock = mockResponse(200);

    const result = await callSelfUpdatePassword(
      service,
      'valid-jwt-token',
      'NewPass#2026',
    );

    expect(result).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/user',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-jwt-token',
        }),
        body: JSON.stringify({ password: 'NewPass#2026' }),
      }),
    );
  });

  it('UTCID02 resolves void and updates the password for an 8-character password', async () => {
    const service = makeService();
    const fetchMock = mockResponse(200);

    const result = await callSelfUpdatePassword(
      service,
      'valid-jwt-token',
      'abcdefgh',
    );

    expect(result).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/user',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ password: 'abcdefgh' }),
      }),
    );
  });

  it('UTCID03 throws UnauthorizedException when the endpoint responds 401 for an expired token', async () => {
    const service = makeService();
    mockResponse(401);

    await expect(
      callSelfUpdatePassword(service, 'expired-jwt-token', 'NewPass#2026'),
    ).rejects.toThrow(new UnauthorizedException('Could not update password'));
  });

  it('UTCID04 throws UnauthorizedException when the endpoint responds 422 for the same password', async () => {
    const service = makeService();
    mockResponse(422);

    await expect(
      callSelfUpdatePassword(service, 'valid-jwt-token', 'NewPass#2026'),
    ).rejects.toThrow(new UnauthorizedException('Could not update password'));
  });

  it('UTCID05 throws TypeError when SUPABASE_URL is missing in config', async () => {
    const service = makeService('SUPABASE_URL');
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(
      callSelfUpdatePassword(service, 'valid-jwt-token', 'NewPass#2026'),
    ).rejects.toThrow(
      new TypeError('Configuration key "SUPABASE_URL" does not exist'),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('UTCID06 throws TypeError when SUPABASE_SERVICE_ROLE_KEY is missing in config', async () => {
    const service = makeService('SUPABASE_SERVICE_ROLE_KEY');
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(
      callSelfUpdatePassword(service, 'valid-jwt-token', 'NewPass#2026'),
    ).rejects.toThrow(
      new TypeError(
        'Configuration key "SUPABASE_SERVICE_ROLE_KEY" does not exist',
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
