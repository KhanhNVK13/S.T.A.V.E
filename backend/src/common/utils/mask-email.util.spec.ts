import { maskEmail } from './mask-email.util';

// ============================================================================
// SHEET: BE-COM-05 (maskEmail utility)
// ============================================================================
describe('BE-COM-05 maskEmail(email)', () => {
  it('UTCID01 masks the local part of a normal email', () => {
    expect(maskEmail('khanh@gmail.com')).toBe('k****@gmail.com');
  });

  it('UTCID02 masks a 2-character local part', () => {
    expect(maskEmail('ab@x.io')).toBe('a***@x.io');
  });

  it('UTCID03 masks a 1-character local part', () => {
    // "a" + max(1 - 1, 3) asterisks -> the shown first char survives.
    expect(maskEmail('a@x.io')).toBe('a***@x.io');
  });

  it('UTCID04 masks an empty local part', () => {
    expect(maskEmail('@x.io')).toBe('***@x.io');
  });

  it('UTCID05 leaves a string without a domain unchanged', () => {
    expect(maskEmail('no-at-sign')).toBe('no-at-sign');
  });

  it('UTCID06 leaves an empty string unchanged', () => {
    expect(maskEmail('')).toBe('');
  });

  it('UTCID07 keeps the domain up to the first @ and drops the rest', () => {
    expect(maskEmail('a@b@c.io')).toBe('a***@b');
  });
});
