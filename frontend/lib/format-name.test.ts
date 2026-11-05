import { describe, expect, it } from 'vitest';
import { getInitials } from './format-name';

// ============================================================================
// SHEET: FE-LIB-17 (getInitials)
// ============================================================================
describe('FE-LIB-17 getInitials', () => {
  it('UTCID01 returns uppercase first character of displayName when both present', () => {
    expect(getInitials('an', 'bob')).toBe('A');
  });

  it('UTCID02 falls back to username initial when displayName is null', () => {
    expect(getInitials(null, 'bob')).toBe('B');
  });

  it('UTCID03 falls back to username initial when displayName is empty string', () => {
    expect(getInitials('', 'bob')).toBe('B');
  });

  it('UTCID04 returns "?" when displayName is undefined and username is null', () => {
    expect(getInitials(undefined, null)).toBe('?');
  });

  it('UTCID05 returns "?" when both displayName and username are empty strings', () => {
    expect(getInitials('', '')).toBe('?');
  });

  it('UTCID06 handles accented unicode character "ánh" properly to "Á"', () => {
    expect(getInitials('ánh', null)).toBe('Á');
  });
});

