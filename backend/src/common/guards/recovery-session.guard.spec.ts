import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RecoverySessionGuard } from './recovery-session.guard';

describe('RecoverySessionGuard.canActivate', () => {
  const guard = new RecoverySessionGuard();
  const nowSeconds = () => Math.floor(Date.now() / 1000);

  const tokenWith = (claims: Record<string, unknown>) =>
    `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

  const run = (accessToken: string | undefined) =>
    guard.canActivate({
      switchToHttp: () => ({ getRequest: () => ({ accessToken }) }),
    } as unknown as ExecutionContext);

  it('allows a fresh recovery token', () => {
    const token = tokenWith({
      amr: [{ method: 'recovery', timestamp: nowSeconds() - 30 }],
    });
    expect(run(token)).toBe(true);
  });

  it('allows a fresh otp token', () => {
    const token = tokenWith({
      amr: [
        { method: 'password', timestamp: nowSeconds() - 7200 },
        { method: 'otp', timestamp: nowSeconds() - 60 },
      ],
    });
    expect(run(token)).toBe(true);
  });

  it('rejects a recovery token older than 10 minutes', () => {
    const token = tokenWith({
      amr: [{ method: 'recovery', timestamp: nowSeconds() - 11 * 60 }],
    });
    expect(() => run(token)).toThrow(ForbiddenException);
  });

  it('rejects a normal password login token', () => {
    const token = tokenWith({
      amr: [{ method: 'password', timestamp: nowSeconds() - 5 }],
    });
    expect(() => run(token)).toThrow(ForbiddenException);
  });

  it.each([
    ['missing amr', tokenWith({})],
    ['amr not an array', tokenWith({ amr: 'recovery' })],
    ['timestamp not a number', tokenWith({ amr: [{ method: 'otp' }] })],
    [
      'timestamp in the far future',
      tokenWith({
        amr: [{ method: 'otp', timestamp: nowSeconds() + 3600 }],
      }),
    ],
    ['malformed token', 'not-a-jwt'],
    ['invalid payload', 'h.@@@.s'],
    ['no token', undefined],
  ])('rejects %s', (_label, token) => {
    expect(() => run(token)).toThrow(ForbiddenException);
  });

  it('does not leak internal details in the message', () => {
    try {
      run('not-a-jwt');
      fail('should throw');
    } catch (e) {
      expect((e as ForbiddenException).message).toMatch(/khôi phục mật khẩu/);
    }
  });
});
