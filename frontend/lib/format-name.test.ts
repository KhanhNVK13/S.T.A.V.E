import { describe, expect, it } from 'vitest';
import { getInitials } from './format-name';

// =============================================================================
// FE-LIB-17 — format-name.getInitials(displayName, username)
// =============================================================================

describe('FE-LIB-17 getInitials(displayName, username)', () => {
  it('UTCID01 (N) displayName "an" and username "bob" returns "A"', () => {
    expect(getInitials('an', 'bob')).toBe('A');
  });

  it('UTCID02 (N) displayName null and username "bob" returns "B"', () => {
    expect(getInitials(null, 'bob')).toBe('B');
  });

  it('UTCID03 (B) displayName "" and username "bob" returns "B"', () => {
    expect(getInitials('', 'bob')).toBe('B');
  });

  it('UTCID04 (A) displayName undefined and username null returns "?"', () => {
    expect(getInitials(undefined, null)).toBe('?');
  });

  it('UTCID05 (B) displayName "" and username "" returns "?"', () => {
    expect(getInitials('', '')).toBe('?');
  });

  it('UTCID06 (N) displayName "ánh" and username null returns "Á"', () => {
    expect(getInitials('ánh', null)).toBe('Á');
  });
});
