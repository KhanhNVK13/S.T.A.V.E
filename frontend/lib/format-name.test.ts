import { beforeEach, describe, expect, it } from 'vitest';
import { formatAuthorName } from './format-name';
import { setLang } from './i18n';

beforeEach(() => setLang('vi'));

describe('formatAuthorName(author)', () => {
  it('prefers the display name over the username', () => {
    expect(
      formatAuthorName({ id: 'u1', display_name: 'An', username: 'bob' }),
    ).toBe('An');
  });

  it('falls back to the username when the display name is null', () => {
    expect(
      formatAuthorName({ id: 'u1', display_name: null, username: 'bob' }),
    ).toBe('bob');
  });

  it('falls back to the generic user label when both names are missing', () => {
    expect(
      formatAuthorName({ id: 'u1', display_name: null, username: null }),
    ).toBe('Người dùng');
  });

  it('labels a missing author as a deleted account', () => {
    expect(formatAuthorName(null)).toBe('Tài khoản đã xoá');
    expect(formatAuthorName(undefined)).toBe('Tài khoản đã xoá');
  });

  it('labels an author without an id as a deleted account', () => {
    expect(formatAuthorName({ id: null, username: 'bob' })).toBe(
      'Tài khoản đã xoá',
    );
  });

  it('returns the English labels when the UI language is English', () => {
    setLang('en');
    expect(formatAuthorName(null)).toBe('Deleted account');
    expect(formatAuthorName({ id: 'u1' })).toBe('User');
  });
});
