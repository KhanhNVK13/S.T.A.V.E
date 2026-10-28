import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { AccountRemovalService } from '../account-removal/account-removal.service';
import type { AudioSketchesService } from '../audio-sketches/audio-sketches.service';
import type { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
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
    return new AuthService(
      client,
      makeConfig(missingKey),
      {} as AccountRemovalService,
    );
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
    return new AuthService(
      client,
      makeConfig(missingKey),
      {} as AccountRemovalService,
    );
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
// SHEET: BE-AUTH-03 (AuthService.syncProfile)
// ============================================================================
describe('BE-AUTH-03 AuthService.syncProfile(user)', () => {
  const makeUser = (overrides = {}) =>
    ({
      id: 'usr_123',
      email: 'user@stave.io',
      identities: [{ provider: 'google', id: 'google_456' }],
      user_metadata: { name: 'Test User' },
      ...overrides,
    }) as any;

  const existingRow = {
    id: 'usr_123',
    email: 'user@stave.io',
    username: 'testuser',
    display_name: 'Test User',
    google_id: 'google_456',
  };

  it('UTCID01 returns the existing row unchanged', async () => {
    const { client, builder } = createSupabaseMock([{ data: existingRow }]);
    const service = new AuthService(
      client,
      {} as ConfigService,
      {} as AccountRemovalService,
    );

    const result = await service.syncProfile(makeUser());

    expect(result).toBe(existingRow);
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it('UTCID02 inserts a new row with google_id taken from the Google identity', async () => {
    const createdRow = { ...existingRow };
    const { client, builder } = createSupabaseMock([
      { data: null }, // 1. User check -> không có
      { data: null }, // 2. Username check -> không trùng
      { data: createdRow, error: null }, // 3. Insert -> thành công
    ]);
    const service = new AuthService(
      client,
      {} as ConfigService,
      {} as AccountRemovalService,
    );

    const result = await service.syncProfile(makeUser());

    expect(result).toEqual(createdRow);
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ google_id: 'google_456' }),
    );
  });

  it('UTCID03 inserts a new row with google_id = null when only an email identity exists', async () => {
    const createdRow = { ...existingRow, google_id: null };
    const { client, builder } = createSupabaseMock([
      { data: null },
      { data: null },
      { data: createdRow, error: null },
    ]);
    const service = new AuthService(
      client,
      {} as ConfigService,
      {} as AccountRemovalService,
    );

    const userWithoutGoogle = makeUser({
      identities: [{ provider: 'email', id: 'email_123' }],
    });

    const result = await service.syncProfile(userWithoutGoogle);

    expect(result).toEqual(createdRow);
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ google_id: null }),
    );
  });

  it('UTCID04 seeds the username from "user" when email and identities are undefined', async () => {
    const createdRow = { ...existingRow, username: 'user123' };
    const { client, builder } = createSupabaseMock([
      { data: null },
      { data: null },
      { data: createdRow, error: null },
    ]);
    const service = new AuthService(
      client,
      {} as ConfigService,
      {} as AccountRemovalService,
    );

    const anonymousUser = makeUser({
      email: undefined,
      identities: undefined,
    });

    const result = await service.syncProfile(anonymousUser);

    expect(result).toEqual(createdRow);
    expect(builder.insert).toHaveBeenCalled();
  });

  // --- UTCID05 ---
  it('UTCID05 throws "Could not provision profile" when the insert returns an error', async () => {
    const { client } = createSupabaseMock([
      { data: null }, // 1. SELECT profile
      { data: null }, // 2. SELECT username (seed "an" chưa ai dùng)
      { data: null, error: new Error('Insert failed') }, // 3. INSERT -> lỗi DB
      { data: null }, // 4. SELECT lại sau race -> vẫn không có
    ]);

    const service = new AuthService(
      client,
      {} as ConfigService,
      {} as AccountRemovalService,
    );

    const promise = service.syncProfile(makeUser());

    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(promise).rejects.toThrow('Could not provision profile');
  });

  // --- UTCID06 ---
  it('UTCID06 throws "Could not provision profile" when the insert returns null data', async () => {
    const { client } = createSupabaseMock([
      { data: null }, // 1. SELECT profile
      { data: null }, // 2. SELECT username (seed "an" chưa ai dùng)
      { data: null, error: null }, // 3. INSERT -> data null
      { data: null }, // 4. SELECT lại sau race -> vẫn không có
    ]);

    const service = new AuthService(
      client,
      {} as ConfigService,
      {} as AccountRemovalService,
    );

    const promise = service.syncProfile(makeUser());

    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(promise).rejects.toThrow('Could not provision profile');
  });
  it('UTCID07 (proposed) returns the row created by a concurrent request when the insert hits a duplicate key', async () => {
    const concurrentRow = { ...existingRow };
    const { client } = createSupabaseMock([
      { data: null },
      { data: null },
      { data: null, error: { code: '23505' } }, // Duplicate key error
      { data: concurrentRow }, // Refetch fallback
    ]);
    const service = new AuthService(
      client,
      {} as ConfigService,
      {} as AccountRemovalService,
    );

    const result = await service.syncProfile(makeUser());

    expect(result).toEqual(concurrentRow);
  });
});

// ============================================================================
// SHEET: BE-AUTH-04 (AuthService.generateUniqueUsername)
// ============================================================================
describe('BE-AUTH-04 AuthService.generateUniqueUsername(email)', () => {
  const originalRandom = Math.random;
  const originalNow = Date.now;

  afterEach(() => {
    jest.restoreAllMocks();
    Math.random = originalRandom;
    Date.now = originalNow;
  });

  const makeService = (results: QueryResult[]) => {
    const { client, builder } = createSupabaseMock(results);
    return {
      service: new AuthService(
        client,
        {} as ConfigService,
        {} as AccountRemovalService,
      ),
      builder,
    };
  };

  const callGenerateUniqueUsername = (
    service: AuthService,
    email: string,
  ): Promise<string> =>
    (
      service as unknown as {
        generateUniqueUsername(email: string): Promise<string>;
      }
    ).generateUniqueUsername(email);

  it('UTCID01 returns the seed when the username is free', async () => {
    const { service, builder } = makeService([{ data: null }]);

    const result = await callGenerateUniqueUsername(
      service,
      'Nguyen.Van@gmail.com',
    );

    expect(result).toBe('nguyen_van');
    expect(builder.eq).toHaveBeenCalledWith('username', 'nguyen_van');
    expect(builder.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('UTCID02 returns the seed with a 4-digit suffix when the seed is taken', async () => {
    const { service, builder } = makeService([
      { data: { id: 'usr_taken' } },
      { data: null },
    ]);
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const result = await callGenerateUniqueUsername(
      service,
      'Nguyen.Van@gmail.com',
    );

    expect(result).toBe('nguyen_van_5500');
    expect(result).toMatch(/^nguyen_van_\d{4}$/);
    expect(builder.eq).toHaveBeenCalledWith('username', 'nguyen_van_5500');
    expect(builder.maybeSingle).toHaveBeenCalledTimes(2);
  });

  it('UTCID03 returns the seed with Date.now() when all 5 candidates are taken', async () => {
    const { service, builder } = makeService([
      { data: { id: 'usr_1' } },
      { data: { id: 'usr_2' } },
      { data: { id: 'usr_3' } },
      { data: { id: 'usr_4' } },
      { data: { id: 'usr_5' } },
    ]);
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    jest.spyOn(Date, 'now').mockReturnValue(1760000000000);

    const result = await callGenerateUniqueUsername(
      service,
      'Nguyen.Van@gmail.com',
    );

    expect(result).toBe('nguyen_van_1760000000000');
    expect(builder.maybeSingle).toHaveBeenCalledTimes(5);
  });

  it('UTCID04 returns "user" when the email has an empty local part', async () => {
    const { service, builder } = makeService([{ data: null }]);

    const result = await callGenerateUniqueUsername(service, '@x.com');

    expect(result).toBe('user');
    expect(builder.eq).toHaveBeenCalledWith('username', 'user');
  });

  it('UTCID05 returns a 20-character seed for a 30-character local part', async () => {
    const { service, builder } = makeService([{ data: null }]);

    const result = await callGenerateUniqueUsername(
      service,
      'abcdefghijklmnopqrstuvwxyz0123@x.com',
    );

    expect(result).toBe('abcdefghijklmnopqrst');
    expect(result).toHaveLength(20);
    expect(builder.eq).toHaveBeenCalledWith('username', 'abcdefghijklmnopqrst');
  });
});

// ============================================================================
// SHEET: BE-AUTH-05 (AuthService.registerSession)
// ============================================================================
describe('BE-AUTH-05 AuthService.registerSession(userId, accessToken, req, deviceLabel)', () => {
  const makeReq = (
    overrides: {
      userAgent?: string | string[];
      ip?: string;
    } = {},
  ) =>
    ({
      headers:
        overrides.userAgent === undefined
          ? {}
          : { 'user-agent': overrides.userAgent },
      ip: overrides.ip,
    }) as unknown as ExpressRequest;

  const makeService = (
    results: QueryResult[],
    signOut: QueryResult = { data: null, error: null },
  ) => {
    const mock = createSupabaseMock(results, {
      authAdmin: { signOut },
    });
    return {
      service: new AuthService(
        mock.client,
        {} as ConfigService,
        {} as AccountRemovalService,
      ),
      builder: mock.builder,
      signOut: mock.auth.admin.signOut,
    };
  };

  it('UTCID01 returns the session id and stores the given device label', async () => {
    const { service, builder, signOut } = makeService([
      { data: { status: 'active' } },
      { data: { id: 'ses_123' } },
    ]);

    const result = await service.registerSession(
      'usr_123',
      'access-token',
      makeReq({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        ip: '203.0.113.5',
      }),
      'Chrome on Windows',
    );

    expect(result).toEqual({ sessionId: 'ses_123' });
    expect(builder.insert).toHaveBeenCalledWith({
      user_id: 'usr_123',
      device_label: 'Chrome on Windows',
      ip_address: '203.0.113.5',
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('UTCID02 truncates the device label to 200 characters', async () => {
    const longLabel = 'a'.repeat(201);
    const { service, builder } = makeService([
      { data: { status: 'active' } },
      { data: { id: 'ses_123' } },
    ]);

    const result = await service.registerSession(
      'usr_123',
      'access-token',
      makeReq({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        ip: '203.0.113.5',
      }),
      longLabel,
    );

    expect(result).toEqual({ sessionId: 'ses_123' });
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ device_label: 'a'.repeat(200) }),
    );
    expect(builder.insert.mock.calls[0][0].device_label).toHaveLength(200);
  });

  it('UTCID03 falls back to the user-agent when no device label is given', async () => {
    const { service, builder } = makeService([
      { data: { status: 'active' } },
      { data: { id: 'ses_123' } },
    ]);

    const result = await service.registerSession(
      'usr_123',
      'access-token',
      makeReq({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        ip: '203.0.113.5',
      }),
      undefined,
    );

    expect(result).toEqual({ sessionId: 'ses_123' });
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        device_label: 'Mozilla/5.0 (Windows NT 10.0)',
      }),
    );
  });

  it('UTCID04 falls back to "Unknown device" and stores a null ip when the user-agent is missing', async () => {
    const { service, builder } = makeService([
      { data: { status: 'active' } },
      { data: { id: 'ses_123' } },
    ]);

    const result = await service.registerSession(
      'usr_123',
      'access-token',
      makeReq(),
      undefined,
    );

    expect(result).toEqual({ sessionId: 'ses_123' });
    expect(builder.insert).toHaveBeenCalledWith({
      user_id: 'usr_123',
      device_label: 'Unknown device',
      ip_address: null,
    });
  });

  it('UTCID05 stores an empty device label without falling back to the user-agent', async () => {
    const { service, builder } = makeService([
      { data: { status: 'active' } },
      { data: { id: 'ses_123' } },
    ]);

    const result = await service.registerSession(
      'usr_123',
      'access-token',
      makeReq({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        ip: '203.0.113.5',
      }),
      '',
    );

    expect(result).toEqual({ sessionId: 'ses_123' });
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ device_label: '' }),
    );
  });

  it('UTCID06 signs the user out and throws ForbiddenException for a suspended account', async () => {
    const { service, builder, signOut } = makeService([
      { data: { status: 'suspended' } },
    ]);

    const promise = service.registerSession(
      'usr_123',
      'access-token',
      makeReq({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        ip: '203.0.113.5',
      }),
      'Chrome on Windows',
    );

    await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(promise).rejects.toThrow('Account is not active');
    expect(signOut).toHaveBeenCalledWith('access-token', 'global');
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it('UTCID07 signs the user out and throws ForbiddenException when the profile is not found', async () => {
    const { service, builder, signOut } = makeService([{ data: null }]);

    const promise = service.registerSession(
      'usr_123',
      'access-token',
      makeReq({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        ip: '203.0.113.5',
      }),
      'Chrome on Windows',
    );

    await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(promise).rejects.toThrow('Account is not active');
    expect(signOut).toHaveBeenCalledWith('access-token', 'global');
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it('UTCID08 throws UnauthorizedException when the session insert fails', async () => {
    const { service } = makeService([
      { data: { status: 'active' } },
      { data: null, error: { message: 'insert failed' } },
    ]);

    const promise = service.registerSession(
      'usr_123',
      'access-token',
      makeReq({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        ip: '203.0.113.5',
      }),
      'Chrome on Windows',
    );

    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(promise).rejects.toThrow('Could not create session');
  });
});

// ============================================================================
// SHEET: BE-AUTH-06 (AuthService.listSessions)
// ============================================================================
describe('BE-AUTH-06 AuthService.listSessions(userId, currentSessionId)', () => {
  const makeService = (result: QueryResult) => {
    const { client, builder } = createSupabaseMock([result]);
    return {
      service: new AuthService(
        client,
        {} as ConfigService,
        {} as AccountRemovalService,
      ),
      builder,
    };
  };

  it('UTCID01 returns sessions sorted by last_active with one isCurrent true', async () => {
    const { service, builder } = makeService({
      data: [
        {
          id: 's2',
          user_id: 'usr_1',
          last_active_at: '2026-01-03T00:00:00Z',
          revoked_at: null,
        },
        {
          id: 's3',
          user_id: 'usr_1',
          last_active_at: '2026-01-02T00:00:00Z',
          revoked_at: null,
        },
        {
          id: 's1',
          user_id: 'usr_1',
          last_active_at: '2026-01-01T00:00:00Z',
          revoked_at: null,
        },
      ],
    });

    const result = await service.listSessions('usr_1', 's2');

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('s2');
    expect(result[0].isCurrent).toBe(true);
    expect(result[1].id).toBe('s3');
    expect(result[1].isCurrent).toBe(false);
    expect(result[2].id).toBe('s1');
    expect(result[2].isCurrent).toBe(false);
    expect(builder.order).toHaveBeenCalledWith('last_active_at', {
      ascending: false,
    });
    expect(builder.is).toHaveBeenCalledWith('revoked_at', null);
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'usr_1');
  });

  it('UTCID02 returns all isCurrent false when none match currentSessionId', async () => {
    const { service } = makeService({
      data: [
        {
          id: 's1',
          user_id: 'usr_1',
          last_active_at: '2026-01-03T00:00:00Z',
          revoked_at: null,
        },
        {
          id: 's2',
          user_id: 'usr_1',
          last_active_at: '2026-01-02T00:00:00Z',
          revoked_at: null,
        },
      ],
    });

    const result = await service.listSessions('usr_1', 'unknown');

    expect(result).toHaveLength(2);
    expect(result.every((s) => s.isCurrent === false)).toBe(true);
    expect(result[0].id).toBe('s1');
    expect(result[1].id).toBe('s2');
  });

  it('UTCID03 returns empty array when no active sessions', async () => {
    const { service } = makeService({ data: [] });

    const result = await service.listSessions('usr_1', 's2');

    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it('UTCID04 throws InternalServerErrorException when the select returns an error', async () => {
    const { service } = makeService({
      data: null,
      error: { message: 'db error' },
    });

    const promise = service.listSessions('usr_1', 's2');

    await expect(promise).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(promise).rejects.toThrow('list cannot be retrieved');
  });
});

// ============================================================================
// SHEET: BE-AUTH-07 (AuthService.revokeSession)
// ============================================================================
describe('BE-AUTH-07 AuthService.revokeSession(userId, sessionId)', () => {
  const makeService = (result: QueryResult) => {
    const { client, builder } = createSupabaseMock([result]);
    return {
      service: new AuthService(
        client,
        {} as ConfigService,
        {} as AccountRemovalService,
      ),
      builder,
    };
  };

  it('UTCID01 revokes a session owned by the user and resolves void', async () => {
    const { service, builder } = makeService({ data: { id: 'ses_other' } });

    await expect(
      service.revokeSession('usr_1', 'ses_other'),
    ).resolves.toBeUndefined();

    expect(builder.update).toHaveBeenCalledWith({
      revoked_at: expect.any(String),
    });
    expect(builder.eq).toHaveBeenCalledWith('id', 'ses_other');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'usr_1');
  });

  it('UTCID02 revokes the current session on logout and resolves void', async () => {
    const { service, builder } = makeService({ data: { id: 'ses_current' } });

    await expect(
      service.revokeSession('usr_1', 'ses_current'),
    ).resolves.toBeUndefined();

    expect(builder.update).toHaveBeenCalledWith({
      revoked_at: expect.any(String),
    });
    expect(builder.eq).toHaveBeenCalledWith('id', 'ses_current');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'usr_1');
  });

  it('UTCID03 reports the session is no longer active and leaves revoked_at unchanged', async () => {
    const { service } = makeService({ data: null });

    const promise = service.revokeSession('usr_1', 'ses_other');

    await expect(promise).rejects.toBeInstanceOf(HttpException);
    await expect(promise).rejects.toThrow(/no longer active/i);
  });

  it('UTCID04 throws UnauthorizedException when the session belongs to another user', async () => {
    const { service } = makeService({ data: null });

    const promise = service.revokeSession('usr_1', 'ses_other');

    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(promise).rejects.toThrow('Session not found');
  });

  it('UTCID05 throws UnauthorizedException when the session id does not exist', async () => {
    const { service } = makeService({ data: null });

    const promise = service.revokeSession('usr_1', 'ses_other');

    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(promise).rejects.toThrow('Session not found');
  });

  it('UTCID06 throws UnauthorizedException when the update returns an error', async () => {
    const { service } = makeService({
      data: null,
      error: { message: 'update failed' },
    });

    const promise = service.revokeSession('usr_1', 'ses_other');

    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(promise).rejects.toThrow('Session not found');
  });
});

// ============================================================================
// SHEET: BE-AUTH-08 (AuthService.revokeOtherSessions)
// ============================================================================
describe('BE-AUTH-08 AuthService.revokeOtherSessions(userId, accessToken, currentSessionId)', () => {
  const makeService = (
    updateResult: QueryResult,
    signOut: QueryResult = { data: null, error: null },
  ) => {
    const mock = createSupabaseMock([updateResult], {
      authAdmin: { signOut },
    });
    return {
      service: new AuthService(
        mock.client,
        {} as ConfigService,
        {} as AccountRemovalService,
      ),
      builder: mock.builder,
      signOut: mock.auth.admin.signOut,
    };
  };

  it('UTCID01 revokes the other active sessions and keeps the current one', async () => {
    const { service, builder, signOut } = makeService({
      data: [{ id: 'ses_a' }, { id: 'ses_b' }],
    });

    await expect(
      service.revokeOtherSessions('usr_1', 'token_1', 'ses_current'),
    ).resolves.toBeUndefined();

    expect(builder.update).toHaveBeenCalledWith({
      revoked_at: expect.any(String),
    });
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'usr_1');
    expect(builder.is).toHaveBeenCalledWith('revoked_at', null);
    expect(builder.neq).toHaveBeenCalledWith('id', 'ses_current');
    expect(signOut).toHaveBeenCalledWith('token_1', 'others');
  });

  it('UTCID02 updates no rows and still calls signOut when only the current session is active', async () => {
    const { service, builder, signOut } = makeService({ data: [] });

    await expect(
      service.revokeOtherSessions('usr_1', 'token_1', 'ses_current'),
    ).resolves.toBeUndefined();

    expect(builder.neq).toHaveBeenCalledWith('id', 'ses_current');
    expect(signOut).toHaveBeenCalledWith('token_1', 'others');
  });

  it('UTCID03 resolves void and ignores the error when the update fails', async () => {
    const { service, signOut } = makeService({
      data: null,
      error: { message: 'update failed' },
    });

    await expect(
      service.revokeOtherSessions('usr_1', 'token_1', 'ses_current'),
    ).resolves.toBeUndefined();

    expect(signOut).toHaveBeenCalledWith('token_1', 'others');
  });

  it('UTCID04 resolves void and ignores the error when signOut returns an error', async () => {
    const { service, signOut } = makeService(
      { data: [{ id: 'ses_a' }] },
      { data: null, error: { message: 'sign out failed' } },
    );

    await expect(
      service.revokeOtherSessions('usr_1', 'token_1', 'ses_current'),
    ).resolves.toBeUndefined();

    expect(signOut).toHaveBeenCalledWith('token_1', 'others');
  });
});

// ============================================================================
// SHEET: BE-AUTH-09 (AuthService.changePassword)
// ============================================================================
describe('BE-AUTH-09 AuthService.changePassword(userId, email, currentPassword, newPassword, accessToken, currentSessionId)', () => {
  const makeService = (signOut: QueryResult = { data: null, error: null }) => {
    const mock = createSupabaseMock([{ data: null, error: null }], {
      authAdmin: { signOut },
    });
    return {
      service: new AuthService(
        mock.client,
        {} as ConfigService,
        {} as AccountRemovalService,
      ),
      builder: mock.builder,
      signOut: mock.auth.admin.signOut,
    };
  };

  const change = (
    service: AuthService,
    newPassword: string,
    currentPassword = 'OldPass#1',
  ) =>
    service.changePassword(
      'usr_1',
      'user@stave.io',
      currentPassword,
      newPassword,
      'token_1',
      'ses_current',
    );

  const stubCollaborators = (
    service: AuthService,
    opts: {
      verified?: boolean;
      selfUpdate?: () => Promise<void>;
    } = {},
  ) => {
    const { verified = true, selfUpdate } = opts;
    const verifySpy = jest
      .spyOn(
        service as unknown as { verifyPassword: () => Promise<boolean> },
        'verifyPassword',
      )
      .mockResolvedValue(verified);
    const selfUpdateSpy = jest
      .spyOn(
        service as unknown as { selfUpdatePassword: () => Promise<void> },
        'selfUpdatePassword',
      )
      .mockImplementation(selfUpdate ?? (() => Promise.resolve(undefined)));
    const revokeSpy = jest
      .spyOn(
        service as unknown as {
          revokeOtherSessions: () => Promise<void>;
        },
        'revokeOtherSessions',
      )
      .mockResolvedValue(undefined);
    return { verifySpy, selfUpdateSpy, revokeSpy };
  };

  it('UTCID01 updates the password, revokes other sessions', async () => {
    const { service } = makeService();
    const { verifySpy, selfUpdateSpy, revokeSpy } = stubCollaborators(service);

    await expect(change(service, 'NewPass#2026')).resolves.toBeUndefined();

    expect(verifySpy).toHaveBeenCalledWith('user@stave.io', 'OldPass#1');
    expect(selfUpdateSpy).toHaveBeenCalledWith('token_1', 'NewPass#2026');
    expect(revokeSpy).toHaveBeenCalledWith('usr_1', 'token_1', 'ses_current');
  });

  it('UTCID02 updates the password, revokes other sessions for an 8-char password', async () => {
    const { service } = makeService();
    const { verifySpy, selfUpdateSpy, revokeSpy } = stubCollaborators(service);

    await expect(change(service, 'abcdefgh')).resolves.toBeUndefined();

    expect(verifySpy).toHaveBeenCalledWith('user@stave.io', 'OldPass#1');
    expect(selfUpdateSpy).toHaveBeenCalledWith('token_1', 'abcdefgh');
    expect(revokeSpy).toHaveBeenCalledWith('usr_1', 'token_1', 'ses_current');
  });

  it('UTCID03 throws UnauthorizedException when the current password is incorrect', async () => {
    const { service } = makeService();
    const { selfUpdateSpy, revokeSpy } = stubCollaborators(service, {
      verified: false,
    });

    const promise = change(service, 'NewPass#2026', 'wrong');

    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(promise).rejects.toThrow('Current password is incorrect');
    expect(selfUpdateSpy).not.toHaveBeenCalled();
    expect(revokeSpy).not.toHaveBeenCalled();
  });

  it('UTCID04 propagates UnauthorizedException when the password update fails', async () => {
    const { service } = makeService();
    const { selfUpdateSpy, revokeSpy } = stubCollaborators(service, {
      selfUpdate: () =>
        Promise.reject(new UnauthorizedException('Could not update password')),
    });

    const promise = change(service, 'NewPass#2026');

    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(promise).rejects.toThrow('Could not update password');
    expect(selfUpdateSpy).toHaveBeenCalledWith('token_1', 'NewPass#2026');
    expect(revokeSpy).not.toHaveBeenCalled();
  });

  it('UTCID05 throws BadRequestException when the new password equals the current one', async () => {
    const { service } = makeService();
    const { selfUpdateSpy, revokeSpy } = stubCollaborators(service);

    const promise = change(service, 'OldPass#1');

    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toThrow(/differ/i);
    expect(selfUpdateSpy).not.toHaveBeenCalled();
    expect(revokeSpy).not.toHaveBeenCalled();
  });
});

// ============================================================================
// SHEET: BE-AUTH-10 (AuthService.deleteAccount)
// ============================================================================
describe('BE-AUTH-10 AuthService.deleteAccount(userId, email, password)', () => {
  const makeService = (
    opts: {
      sessions?: QueryResult[];
      users?: QueryResult[];
      projects?: QueryResult[];
      deleteUser?: QueryResult;
    } = {},
  ) => {
    const mock = createSupabaseMock([], {
      tables: {
        sessions: opts.sessions ?? [{ data: null, error: null }],
        users: opts.users ?? [{ data: null, error: null }],
        projects: opts.projects ?? [{ data: null, error: null }],
      },
      storage: {
        'custom-sounds': { remove: [{ data: null, error: null }] },
      },
      authAdmin: {
        getUserById: { data: { user: { banned_until: null } }, error: null },
        updateUserById: [
          { data: null, error: null },
          { data: null, error: null },
        ],
        deleteUser: opts.deleteUser ?? { data: null, error: null },
      },
    });
    const removal = new AccountRemovalService(
      mock.client,
      {
        purgeProjectFiles: jest.fn(() => Promise.resolve()),
      } as unknown as AudioSketchesService,
      {
        removeAllFilesOf: jest.fn(() => Promise.resolve()),
        collectGarbage: jest.fn(() => Promise.resolve()),
      } as unknown as CustomSoundsService,
    );
    return {
      service: new AuthService(mock.client, {} as ConfigService, removal),
      mock,
    };
  };

  const stubVerify = (service: AuthService, ok: boolean) =>
    jest
      .spyOn(
        service as unknown as {
          verifyPassword(email: string, password: string): Promise<boolean>;
        },
        'verifyPassword',
      )
      .mockResolvedValue(ok);

  const del = (service: AuthService, password: string) =>
    service.deleteAccount('usr_1', 'user@stave.io', password);

  it('UTCID01 revokes sessions and deletes the user, projects and sound files when the password is correct', async () => {
    const { service, mock } = makeService();
    const verifySpy = stubVerify(service, true);

    await expect(del(service, 'Correct#123')).resolves.toBeUndefined();

    expect(verifySpy).toHaveBeenCalledWith('user@stave.io', 'Correct#123');
    expect(mock.builders.sessions.update).toHaveBeenCalledWith({
      revoked_at: expect.any(String),
    });
    expect(mock.builders.sessions.eq).toHaveBeenCalledWith('user_id', 'usr_1');
    expect(mock.builders.users.delete).toHaveBeenCalled();
    expect(mock.builders.users.eq).toHaveBeenCalledWith('id', 'usr_1');
    expect(mock.auth.admin.deleteUser).toHaveBeenCalledWith('usr_1');
    expect(mock.builders.projects.eq).toHaveBeenCalledWith('owner_id', 'usr_1');
  });

  it('UTCID02 throws UnauthorizedException when the password is wrong', async () => {
    const { service, mock } = makeService();
    const verifySpy = stubVerify(service, false);

    const promise = del(service, 'wrong');

    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(promise).rejects.toThrow('Password is incorrect');
    expect(verifySpy).toHaveBeenCalledWith('user@stave.io', 'wrong');
    expect(mock.builders.sessions.update).not.toHaveBeenCalled();
    expect(mock.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('UTCID03 throws UnauthorizedException when the password is empty', async () => {
    const { service, mock } = makeService();
    const verifySpy = stubVerify(service, false);

    const promise = del(service, '');

    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(promise).rejects.toThrow('Password is incorrect');
    expect(verifySpy).toHaveBeenCalledWith('user@stave.io', '');
    expect(mock.builders.sessions.update).not.toHaveBeenCalled();
    expect(mock.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('UTCID04 reports the deletion failure when the users delete returns an error', async () => {
    const { service, mock } = makeService({
      users: [{ data: null, error: { message: 'delete failed' } }],
    });
    stubVerify(service, true);

    const promise = del(service, 'Correct#123');

    await expect(promise).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(promise).rejects.toThrow('Could not delete account');
    expect(mock.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(mock.auth.admin.updateUserById).toHaveBeenLastCalledWith('usr_1', {
      ban_duration: 'none',
    });
  });

  it('UTCID05 completes once the profile is gone even if the banned auth account cannot be deleted', async () => {
    const { service, mock } = makeService({
      deleteUser: { data: null, error: { message: 'auth delete failed' } },
    });
    stubVerify(service, true);

    await expect(del(service, 'Correct#123')).resolves.toBeUndefined();
    expect(mock.builders.users.delete).toHaveBeenCalled();
    expect(mock.auth.admin.updateUserById).toHaveBeenCalledWith('usr_1', {
      ban_duration: expect.any(String),
    });
  });
});
