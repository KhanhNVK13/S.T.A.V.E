import { usernameSeedFromEmail } from './username.util';

// ============================================================================
// SHEET: BE-COM-06 (usernameSeedFromEmail utility)
// ============================================================================
describe('BE-COM-06 usernameSeedFromEmail(email)', () => {
  it('UTCID01 sanitises a normal email local part', () => {
    expect(usernameSeedFromEmail('Khanh.Nguyen@gmail.com')).toBe(
      'khanh_nguyen',
    );
  });

  it('UTCID02 collapses consecutive underscores produced by cleaning', () => {
    expect(usernameSeedFromEmail('__a--b__@x.io')).toBe('a_b');
  });

  it('UTCID03 falls back to "user" for an empty local part', () => {
    expect(usernameSeedFromEmail('@x.io')).toBe('user');
  });

  it('UTCID04 falls back to "user" for a symbols-only local part', () => {
    expect(usernameSeedFromEmail('!!!@x.io')).toBe('user');
  });

  it('UTCID05 replaces non-ASCII characters with underscores (Unicode)', () => {
    expect(usernameSeedFromEmail('Nguyễn@x.io')).toBe('nguy_n');
  });

  it('UTCID06 leaves a 20-character local part unchanged', () => {
    expect(usernameSeedFromEmail('a234567890bcdefghij1@x.io')).toBe(
      'a234567890bcdefghij1',
    );
  });

  it('UTCID07 cuts a 25-character local part to the first 20 characters', () => {
    expect(usernameSeedFromEmail('a234567890bcdefghij1KLMNO@x.io')).toBe(
      'a234567890bcdefghij1',
    );
  });

  it('UTCID08 keeps a string without an @ sign as-is', () => {
    expect(usernameSeedFromEmail('plainstring')).toBe('plainstring');
  });

  it('UTCID09 keeps a local part shorter than 3 characters', () => {
    expect(usernameSeedFromEmail('ab@x.io')).toBe('ab');
  });
});
