import {
  assertTestDatabase,
  PRODUCTION_PROJECT_REF,
} from './test-database-guard';

const testRef = 'abcdefghijklmnopqrst';

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode(payload)}.signature`;
}

function validEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    TEST_DB_PROJECT_REF: testRef,
    SUPABASE_URL: `https://${testRef}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: jwt({ ref: testRef, role: 'service_role' }),
    ...overrides,
  };
}

describe('assertTestDatabase', () => {
  it('accepts a test project configuration', () => {
    expect(() => assertTestDatabase(validEnv())).not.toThrow();
  });

  it('accepts an opaque secret key it cannot decode', () => {
    expect(() =>
      assertTestDatabase(
        validEnv({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' }),
      ),
    ).not.toThrow();
  });

  it('rejects a missing test project ref', () => {
    expect(() =>
      assertTestDatabase(validEnv({ TEST_DB_PROJECT_REF: undefined })),
    ).toThrow('TEST_DB_PROJECT_REF is not set');
  });

  it('rejects the production ref as the test ref', () => {
    expect(() =>
      assertTestDatabase(
        validEnv({ TEST_DB_PROJECT_REF: PRODUCTION_PROJECT_REF }),
      ),
    ).toThrow('is the production project');
  });

  it('rejects a URL pointing at production', () => {
    expect(() =>
      assertTestDatabase(
        validEnv({
          SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
        }),
      ),
    ).toThrow('points at the production project');
  });

  it('rejects a URL that does not match the test ref', () => {
    expect(() =>
      assertTestDatabase(
        validEnv({ SUPABASE_URL: 'https://other.supabase.co' }),
      ),
    ).toThrow('does not belong to TEST_DB_PROJECT_REF');
  });

  it('rejects a service key issued for the production project', () => {
    expect(() =>
      assertTestDatabase(
        validEnv({
          SUPABASE_SERVICE_ROLE_KEY: jwt({
            ref: PRODUCTION_PROJECT_REF,
            role: 'service_role',
          }),
        }),
      ),
    ).toThrow('issued for a different project');
  });

  it('rejects a key that is not service_role', () => {
    expect(() =>
      assertTestDatabase(
        validEnv({
          SUPABASE_SERVICE_ROLE_KEY: jwt({ ref: testRef, role: 'anon' }),
        }),
      ),
    ).toThrow('not a service_role key');
  });

  it('rejects a missing service key', () => {
    expect(() =>
      assertTestDatabase(validEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined })),
    ).toThrow('SUPABASE_SERVICE_ROLE_KEY is not set');
  });
});
