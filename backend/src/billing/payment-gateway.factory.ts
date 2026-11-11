import type { Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeGateway } from './fake.gateway';
import type { PaymentGateway } from './payment-gateway';
import { PayosGateway } from './payos.gateway';

export type PaymentProvider = 'fake' | 'payos';
export type BillingEnv = Record<string, string | undefined>;

export const DEFAULT_FRONTEND_URL = 'http://localhost:3000';
const PAYOS_KEYS = [
  'PAYOS_CLIENT_ID',
  'PAYOS_API_KEY',
  'PAYOS_CHECKSUM_KEY',
] as const;

export function resolvePaymentProvider(env: BillingEnv): PaymentProvider {
  const value = env.PAYMENT_PROVIDER?.trim().toLowerCase() ?? '';
  if (value === '' || value === 'fake') return 'fake';
  if (value === 'payos') return 'payos';
  throw new Error(
    `PAYMENT_PROVIDER must be "fake" or "payos", got "${env.PAYMENT_PROVIDER}"`,
  );
}

export function isFakePaymentEnabled(env: BillingEnv): boolean {
  return (
    env.PAYMENT_PROVIDER?.trim().toLowerCase() === 'fake' &&
    env.NODE_ENV !== 'production'
  );
}

export function frontendUrl(env: BillingEnv): string {
  return (env.FRONTEND_URL?.trim() || DEFAULT_FRONTEND_URL).replace(/\/+$/, '');
}

export function createPaymentGateway(
  env: BillingEnv,
  supabase: SupabaseClient,
  logger: Pick<Logger, 'warn'>,
): PaymentGateway {
  const provider = resolvePaymentProvider(env);
  if (provider === 'fake' && env.NODE_ENV === 'production') {
    throw new Error(
      'PAYMENT_PROVIDER must be "payos" when NODE_ENV=production; the fake gateway never takes real money',
    );
  }
  if (provider === 'payos') {
    const [clientId, apiKey, checksumKey] = PAYOS_KEYS.map(
      (key) => env[key]?.trim() ?? '',
    );
    const missing = PAYOS_KEYS.filter((key) => !env[key]?.trim());
    if (missing.length > 0) {
      throw new Error(
        `PAYMENT_PROVIDER=payos requires ${missing.join(', ')} in backend/.env`,
      );
    }
    return new PayosGateway({ clientId, apiKey, checksumKey });
  }
  logger.warn(
    'Using the fake payment gateway — no real money is charged. Set PAYMENT_PROVIDER=payos with PayOS keys to take real payments.',
  );
  return new FakeGateway(supabase, frontendUrl(env));
}
