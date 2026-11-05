import { describe, expect, it } from 'vitest';
import { colorFromId } from './avatar-color';

// ============================================================================
// SHEET: FE-LIB-08 (colorFromId)
// ============================================================================
describe('FE-LIB-08 colorFromId', () => {
  it('UTCID01 returns accent palette for empty string', () => {
    expect(colorFromId('')).toEqual({
      bg: 'bg-accent-muted',
      text: 'text-accent',
    });
  });

  it('UTCID02 returns success palette for id "e"', () => {
    expect(colorFromId('e')).toEqual({
      bg: 'bg-success-muted',
      text: 'text-success',
    });
  });

  it('UTCID03 returns warning palette for id "a"', () => {
    expect(colorFromId('a')).toEqual({
      bg: 'bg-warning-muted',
      text: 'text-warning',
    });
  });

  it('UTCID04 returns danger palette for id "b"', () => {
    expect(colorFromId('b')).toEqual({
      bg: 'bg-danger-muted',
      text: 'text-danger',
    });
  });

  it('UTCID05 returns metal palette for id "c"', () => {
    expect(colorFromId('c')).toEqual({
      bg: 'bg-metal-muted',
      text: 'text-metal',
    });
  });

  it('UTCID06 returns identical palette for the same UUID across multiple calls', () => {
    const uuid = '12345678-1234-4234-8234-123456789abc';
    const first = colorFromId(uuid);
    const second = colorFromId(uuid);
    expect(first).toEqual(second);
  });
});

