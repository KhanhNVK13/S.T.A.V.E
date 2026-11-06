import { isSafeReturnTo } from './return-to';

describe('BE-BIL-18 isSafeReturnTo', () => {
  it('UTCID01 accepts same-site relative paths', () => {
    for (const value of ['/plans', '/profile?tab=x', '/projects/1/edit#top']) {
      expect(isSafeReturnTo(value)).toBe(true);
    }
  });

  it('UTCID02 rejects paths that leave the site', () => {
    for (const value of [
      '//evil.com',
      '/\\evil.com',
      'https://x',
      'javascript:alert(1)',
      '/redirect?to=https://evil.com',
      'plans',
      '',
    ]) {
      expect(isSafeReturnTo(value)).toBe(false);
    }
  });

  it('UTCID03 rejects control characters, non-strings and very long values', () => {
    expect(isSafeReturnTo('/plans\n')).toBe(false);
    expect(isSafeReturnTo('/pl\u0000ans')).toBe(false);
    expect(isSafeReturnTo(undefined)).toBe(false);
    expect(isSafeReturnTo(42)).toBe(false);
    expect(isSafeReturnTo(`/${'a'.repeat(600)}`)).toBe(false);
  });
});
