import { IoAdapter } from '@nestjs/platform-socket.io';
import {
  CorsIoAdapter,
  allowedOrigins,
  resolveCorsOrigin,
  resolvePort,
  resolveTrustProxy,
} from './http-security';

describe('http-security', () => {
  it('allows every origin outside production', () => {
    expect(resolveCorsOrigin({ NODE_ENV: 'development' })).toBe(true);
    expect(resolveCorsOrigin({})).toBe(true);
  });

  it('allows only configured origins in production', () => {
    const origin = resolveCorsOrigin({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://stave.app/',
      CORS_ORIGINS: 'https://preview.stave.app, not a url',
    });
    expect(typeof origin).toBe('function');
    const check = (value: string | undefined) => {
      let result: boolean | undefined;
      (origin as Exclude<typeof origin, boolean>)(value, (_error, allow) => {
        result = allow;
      });
      return result;
    };
    expect(check('https://stave.app')).toBe(true);
    expect(check('https://preview.stave.app')).toBe(true);
    expect(check('https://evil.example')).toBe(false);
    expect(check(undefined)).toBe(true);
  });

  it('deduplicates origins', () => {
    expect(
      allowedOrigins({
        FRONTEND_URL: 'https://a.app/x',
        CORS_ORIGINS: 'https://a.app',
      }),
    ).toEqual(['https://a.app']);
  });

  it('trusts one proxy hop in production only by default', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'production' })).toBe(1);
    expect(resolveTrustProxy({ NODE_ENV: 'development' })).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: '2' })).toBe(2);
    expect(resolveTrustProxy({ TRUST_PROXY: '0' })).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: 'loopback' })).toBe('loopback');
  });
  it('maps TRUST_PROXY=true to one hop and accepts IPs, CIDRs and keywords', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: 'true' })).toBe(1);
    expect(resolveTrustProxy({ TRUST_PROXY: '10.0.0.0/8, loopback' })).toBe(
      '10.0.0.0/8, loopback',
    );
    expect(resolveTrustProxy({ TRUST_PROXY: '::1' })).toBe('::1');
  });

  it('rejects an unusable TRUST_PROXY with a clear message', () => {
    for (const value of ['yes', '10.0.0.0/99', '1.2.3', 'loopback,nope']) {
      expect(() => resolveTrustProxy({ TRUST_PROXY: value })).toThrow(
        /TRUST_PROXY must be/,
      );
    }
  });

  it('falls back to 3001 when PORT is empty or invalid', () => {
    expect(resolvePort({})).toBe(3001);
    expect(resolvePort({ PORT: '' })).toBe(3001);
    expect(resolvePort({ PORT: 'abc' })).toBe(3001);
    expect(resolvePort({ PORT: '70000' })).toBe(3001);
    expect(resolvePort({ PORT: '8080' })).toBe(8080);
  });

  describe('CorsIoAdapter', () => {
    afterEach(() => jest.restoreAllMocks());

    const create = (env: Record<string, string>) => {
      const spy = jest
        .spyOn(IoAdapter.prototype, 'createIOServer')
        .mockReturnValue({});
      const adapter = new CorsIoAdapter({} as never, resolveCorsOrigin(env));
      adapter.createIOServer(3001, { cors: { origin: true } } as never);
      return (spy.mock.calls[0][1] as { cors: { origin: unknown } }).cors;
    };

    it('overrides the per-gateway cors so development stays open', () => {
      expect(create({ NODE_ENV: 'development' }).origin).toBe(true);
    });

    it('overrides the per-gateway cors with the allow-list in production', () => {
      const origin = create({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://stave.app',
      }).origin as (
        origin: string | undefined,
        callback: (error: Error | null, allow?: boolean) => void,
      ) => void;
      const check = (value: string) => {
        let result: boolean | undefined;
        origin(value, (_error, allow) => {
          result = allow;
        });
        return result;
      };
      expect(check('https://stave.app')).toBe(true);
      expect(check('https://evil.example')).toBe(false);
    });
  });
});
