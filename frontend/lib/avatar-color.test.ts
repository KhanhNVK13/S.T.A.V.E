import { describe, expect, it } from 'vitest';
import { colorFromId } from './avatar-color';

// =============================================================================
// FE-LIB-08 — avatar-color.colorFromId(id)
// =============================================================================

describe('FE-LIB-08 colorFromId(id)', () => {
  it('UTCID01 (B) empty string returns bg-accent-muted, text-accent', () => {
    expect(colorFromId('')).toEqual({
      bg: 'bg-accent-muted',
      text: 'text-accent',
    });
  });

  it('UTCID02 (N) "e" returns bg-success-muted, text-success', () => {
    expect(colorFromId('e')).toEqual({
      bg: 'bg-success-muted',
      text: 'text-success',
    });
  });

  it('UTCID03 (N) "a" returns bg-warning-muted, text-warning', () => {
    expect(colorFromId('a')).toEqual({
      bg: 'bg-warning-muted',
      text: 'text-warning',
    });
  });

  it('UTCID04 (N) "b" returns bg-danger-muted, text-danger', () => {
    expect(colorFromId('b')).toEqual({
      bg: 'bg-danger-muted',
      text: 'text-danger',
    });
  });

  it('UTCID05 (N) "c" returns bg-metal-muted, text-metal', () => {
    expect(colorFromId('c')).toEqual({
      bg: 'bg-metal-muted',
      text: 'text-metal',
    });
  });

  it('UTCID06 (N) same UUID called twice returns identical palette entry', () => {
    const id = '12345678-1234-4234-8234-123456789abc';
    const first = colorFromId(id);
    const second = colorFromId(id);
    expect(first).toEqual(second);
  });
});
