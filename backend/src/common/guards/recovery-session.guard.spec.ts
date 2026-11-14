import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RecoverySessionGuard } from './recovery-session.guard';

describe('BE-COM-08 RecoverySessionGuard.canActivate', () => {
  const guard = new RecoverySessionGuard();
  const nowSeconds = () => Math.floor(Date.now() / 1000);

  const tokenWith = (claims: Record<string, unknown>) =>
    `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

  const run = (accessToken: string | undefined) =>
    guard.canActivate({
      switchToHttp: () => ({ getRequest: () => ({ accessToken }) }),
    } as unknown as ExecutionContext);

  it('UTCID01 allows a fresh recovery token', () => {
    const token = tokenWith({
      amr: [{ method: 'recovery', timestamp: nowSeconds() - 30 }],
    });
    expect(run(token)).toBe(true);
  });

  it('UTCID02 allows a fresh otp token', () => {
    const token = tokenWith({
      amr: [
        { method: 'password', timestamp: nowSeconds() - 7200 },
        { method: 'otp', timestamp: nowSeconds() - 60 },
      ],
    });
    expect(run(token)).toBe(true);
  });

  it('UTCID03 rejects a recovery token older than 10 minutes', () => {
    const token = tokenWith({
      amr: [{ method: 'recovery', timestamp: nowSeconds() - 11 * 60 }],
    });
    expect(() => run(token)).toThrow(ForbiddenException);
  });

  it('UTCID04 rejects a normal password login token', () => {
    const token = tokenWith({
      amr: [{ method: 'password', timestamp: nowSeconds() - 5 }],
    });
    expect(() => run(token)).toThrow(ForbiddenException);
  });

  it.each([
    { id: 'UTCID05', label: 'missing amr', token: tokenWith({}) },
    {
      id: 'UTCID06',
      label: 'amr not an array',
      token: tokenWith({ amr: 'recovery' }),
    },
    {
      id: 'UTCID07',
      label: 'timestamp not a number',
      token: tokenWith({ amr: [{ method: 'otp' }] }),
    },
    {
      id: 'UTCID08',
      label: 'timestamp in the far future',
      token: tokenWith({
        amr: [{ method: 'otp', timestamp: nowSeconds() + 3600 }],
      }),
    },
    { id: 'UTCID09', label: 'malformed token', token: 'not-a-jwt' },
    { id: 'UTCID10', label: 'invalid payload', token: 'h.@@@.s' },
    { id: 'UTCID11', label: 'no token', token: undefined },
  ])('$id rejects $label', ({ token }) => {
    expect(() => run(token)).toThrow(ForbiddenException);
  });

  it('UTCID12 does not leak internal details in the message', () => {
    try {
      run('not-a-jwt');
      fail('should throw');
    } catch (e) {
      expect((e as ForbiddenException).message).toMatch(/khôi phục mật khẩu/);
    }
  });
});
