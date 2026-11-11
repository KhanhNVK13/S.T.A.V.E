import { createSupabaseMock } from '../test-utils/supabase-mock';
import { FakeGateway } from './fake.gateway';
import {
  createPaymentGateway,
  frontendUrl,
  isFakePaymentEnabled,
  resolvePaymentProvider,
} from './payment-gateway.factory';
import { PayosGateway } from './payos.gateway';

const keys = {
  PAYOS_CLIENT_ID: 'client',
  PAYOS_API_KEY: 'api',
  PAYOS_CHECKSUM_KEY: 'checksum',
};

function build(env: Record<string, string | undefined>) {
  const logger = { warn: jest.fn() };
  const gateway = createPaymentGateway(
    env,
    createSupabaseMock().client,
    logger,
  );
  return { gateway, logger };
}

describe('BE-BIL-06 createPaymentGateway', () => {
  it('UTCID01 uses the fake gateway and warns when PAYMENT_PROVIDER is missing', () => {
    const { gateway, logger } = build({});
    expect(gateway).toBeInstanceOf(FakeGateway);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('UTCID02 uses the fake gateway when PAYMENT_PROVIDER=fake even if PayOS keys exist', () => {
    const { gateway, logger } = build({ PAYMENT_PROVIDER: 'fake', ...keys });
    expect(gateway).toBeInstanceOf(FakeGateway);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('UTCID03 uses PayOS when PAYMENT_PROVIDER=payos and every key is set', () => {
    const { gateway, logger } = build({ PAYMENT_PROVIDER: 'payos', ...keys });
    expect(gateway).toBeInstanceOf(PayosGateway);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('UTCID04 fails at startup when PAYMENT_PROVIDER=payos is missing a key', () => {
    expect(() =>
      build({ PAYMENT_PROVIDER: 'payos', ...keys, PAYOS_CHECKSUM_KEY: ' ' }),
    ).toThrow('PAYMENT_PROVIDER=payos requires PAYOS_CHECKSUM_KEY');
  });

  it('UTCID05 fails at startup on an unknown provider', () => {
    expect(() => build({ PAYMENT_PROVIDER: 'stripe' })).toThrow(
      'PAYMENT_PROVIDER must be "fake" or "payos"',
    );
  });
});

describe('BE-BIL-06 production guard', () => {
  it('UTCID06 refuses the fake gateway when NODE_ENV=production', () => {
    expect(() => build({ NODE_ENV: 'production' })).toThrow(/payos/);
    expect(() =>
      build({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'fake' }),
    ).toThrow(/payos/);
  });

  it('UTCID07 allows PayOS in production', () => {
    expect(() =>
      build({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'payos', ...keys }),
    ).not.toThrow();
  });
});

describe('BE-BIL-07 billing environment helpers', () => {
  it('UTCID01 resolves the provider case-insensitively', () => {
    expect(resolvePaymentProvider({ PAYMENT_PROVIDER: ' PayOS ' })).toBe(
      'payos',
    );
    expect(resolvePaymentProvider({ PAYMENT_PROVIDER: '' })).toBe('fake');
  });

  it('UTCID02 enables fake payment only for an explicit fake provider outside production', () => {
    expect(isFakePaymentEnabled({ PAYMENT_PROVIDER: 'fake' })).toBe(true);
    expect(
      isFakePaymentEnabled({
        PAYMENT_PROVIDER: 'fake',
        NODE_ENV: 'development',
      }),
    ).toBe(true);
    expect(
      isFakePaymentEnabled({
        PAYMENT_PROVIDER: 'fake',
        NODE_ENV: 'production',
      }),
    ).toBe(false);
    expect(isFakePaymentEnabled({})).toBe(false);
    expect(isFakePaymentEnabled({ PAYMENT_PROVIDER: 'payos' })).toBe(false);
  });

  it('UTCID03 uses FRONTEND_URL without a trailing slash, or the local default', () => {
    expect(frontendUrl({ FRONTEND_URL: 'https://stave.app/' })).toBe(
      'https://stave.app',
    );
    expect(frontendUrl({})).toBe('http://localhost:3000');
  });
});
