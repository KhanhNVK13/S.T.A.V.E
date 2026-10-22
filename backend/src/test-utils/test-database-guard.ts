export const PRODUCTION_PROJECT_REF = 'gwbiwweeznbuqfgawywv';

type Env = Record<string, string | undefined>;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function assertTestDatabase(env: Env): void {
  const ref = env.TEST_DB_PROJECT_REF;
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!ref) {
    throw new Error('Refusing to run: TEST_DB_PROJECT_REF is not set.');
  }
  if (ref === PRODUCTION_PROJECT_REF) {
    throw new Error(
      'Refusing to run: TEST_DB_PROJECT_REF is the production project.',
    );
  }
  if (!url) {
    throw new Error('Refusing to run: SUPABASE_URL is not set.');
  }
  if (url.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(
      'Refusing to run: SUPABASE_URL points at the production project.',
    );
  }
  if (!url.includes(ref)) {
    throw new Error(
      'Refusing to run: SUPABASE_URL does not belong to TEST_DB_PROJECT_REF.',
    );
  }
  if (!serviceKey) {
    throw new Error('Refusing to run: SUPABASE_SERVICE_ROLE_KEY is not set.');
  }

  const payload = decodeJwtPayload(serviceKey);
  if (payload) {
    if (payload.ref !== ref) {
      throw new Error(
        'Refusing to run: SUPABASE_SERVICE_ROLE_KEY was issued for a different project.',
      );
    }
    if (payload.role !== 'service_role') {
      throw new Error(
        'Refusing to run: SUPABASE_SERVICE_ROLE_KEY is not a service_role key.',
      );
    }
  }
}
