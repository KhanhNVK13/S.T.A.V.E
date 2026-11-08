import { beforeEach, describe, expect, it } from 'vitest';
import { formatAuthorName } from './format-name';
import { setLang } from './i18n';

beforeEach(() => setLang('vi'));

describe('FE-LIB-17 formatAuthorName(author)', () => {
  it('UTCID01 (N) prefers the display name over the username', () => {
    expect(
      formatAuthorName({ id: 'u1', display_name: 'An', username: 'bob' }),
    ).toBe('An');
  });

  it('UTCID02 (N) falls back to the username when the display name is null', () => {
    expect(
      formatAuthorName({ id: 'u1', display_name: null, username: 'bob' }),
    ).toBe('bob');
  });

  it('UTCID03 (B) falls back to the generic user label when both names are missing', () => {
    expect(
      formatAuthorName({ id: 'u1', display_name: null, username: null }),
    ).toBe('Người dùng');
  });

  it('UTCID04 (A) labels a missing author as a deleted account', () => {
    expect(formatAuthorName(null)).toBe('Tài khoản đã xoá');
    expect(formatAuthorName(undefined)).toBe('Tài khoản đã xoá');
  });

  it('UTCID05 (A) labels an author without an id as a deleted account', () => {
    expect(formatAuthorName({ id: null, username: 'bob' })).toBe(
      'Tài khoản đã xoá',
    );
  });

  it('UTCID06 (N) returns the English labels when the UI language is English', () => {
    setLang('en');
    expect(formatAuthorName(null)).toBe('Deleted account');
    expect(formatAuthorName({ id: 'u1' })).toBe('User');
  });
});
