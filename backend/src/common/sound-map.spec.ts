import {
  sanitizeSoundMap,
  isValidSoundMap,
  isDrumKitInstrument,
} from '@stave/shared-types';

const U1 = '11111111-2222-3333-4444-555555555555';
const U2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const UPPER_U = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';

const uuidFor = (n: number): string =>
  `${n.toString(16).padStart(8, '0')}-0000-4000-8000-${n
    .toString(16)
    .padStart(12, '0')}`;

const generateEntries = (count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [String(i), uuidFor(i)]),
  );

// ============================================================================
// SHEET: SH-TYP-01 (sanitizeSoundMap)
// ============================================================================
describe('SH-TYP-01 sanitizeSoundMap', () => {
  it('UTCID01 returns undefined for undefined', () => {
    expect(sanitizeSoundMap(undefined)).toBeUndefined();
  });

  it('UTCID02 returns undefined for null', () => {
    expect(sanitizeSoundMap(null)).toBeUndefined();
  });

  it('UTCID03 returns undefined for array', () => {
    expect(sanitizeSoundMap([])).toBeUndefined();
  });

  it('UTCID04 returns undefined for string "abc"', () => {
    expect(sanitizeSoundMap('abc')).toBeUndefined();
  });

  it('UTCID05 accepts pitch "60" with valid UUID', () => {
    expect(sanitizeSoundMap({ '60': U1 })).toEqual({ '60': U1 });
  });

  it('UTCID06 accepts min pitch boundary "0"', () => {
    expect(sanitizeSoundMap({ '0': U1 })).toEqual({ '0': U1 });
  });

  it('UTCID07 accepts max pitch boundary "127"', () => {
    expect(sanitizeSoundMap({ '127': U2 })).toEqual({ '127': U2 });
  });

  it('UTCID08 ignores pitch "128" and returns undefined if nothing valid', () => {
    expect(sanitizeSoundMap({ '128': U1 })).toBeUndefined();
  });

  it('UTCID09 ignores pitch "-1" and returns undefined if nothing valid', () => {
    expect(sanitizeSoundMap({ '-1': U1 })).toBeUndefined();
  });

  it('UTCID10 ignores non-numeric pitch "C4"', () => {
    expect(sanitizeSoundMap({ C4: U1 })).toBeUndefined();
  });

  it('UTCID11 ignores 4-digit pitch "1000"', () => {
    expect(sanitizeSoundMap({ '1000': U1 })).toBeUndefined();
  });

  it('UTCID12 normalizes leading-zero pitch "060" to "60"', () => {
    expect(sanitizeSoundMap({ '060': U1 })).toEqual({ '60': U1 });
  });

  it('UTCID13 preserves uppercase UUID', () => {
    expect(sanitizeSoundMap({ '60': UPPER_U })).toEqual({ '60': UPPER_U });
  });

  it('UTCID14 ignores non-UUID string value "abc"', () => {
    expect(sanitizeSoundMap({ '60': 'abc' })).toBeUndefined();
  });

  it('UTCID15 ignores non-string value 42', () => {
    expect(sanitizeSoundMap({ '60': 42 })).toBeUndefined();
  });

  it('UTCID16 keeps all 128 valid entries at the limit', () => {
    const input = generateEntries(128);
    expect(sanitizeSoundMap(input)).toEqual(input);
  });

  it('UTCID17 caps at 128 entries when 129 entries are given', () => {
    const input = generateEntries(129);
    const result = sanitizeSoundMap(input);
    expect(Object.keys(result!)).toHaveLength(128);
  });

  it('UTCID18 filters out invalid entries keeping only valid ones', () => {
    const input = {
      '60': U1,
      '62': U2,
      '128': U1,
      '64': 'invalid-uuid',
    };
    expect(sanitizeSoundMap(input)).toEqual({
      '60': U1,
      '62': U2,
    });
  });
});

// ============================================================================
// SHEET: SH-TYP-02 (isValidSoundMap)
// ============================================================================
describe('SH-TYP-02 isValidSoundMap', () => {
  it('UTCID01 returns true for undefined', () => {
    expect(isValidSoundMap(undefined)).toBe(true);
  });

  it('UTCID02 returns true for null', () => {
    expect(isValidSoundMap(null)).toBe(true);
  });

  it('UTCID03 returns false for array', () => {
    expect(isValidSoundMap([])).toBe(false);
  });

  it('UTCID04 returns false for string "x"', () => {
    expect(isValidSoundMap('x')).toBe(false);
  });

  it('UTCID05 returns true for empty object {}', () => {
    expect(isValidSoundMap({})).toBe(true);
  });

  it('UTCID06 returns true for 1 valid entry', () => {
    expect(isValidSoundMap({ '60': U1 })).toBe(true);
  });

  it('UTCID07 returns true for 128 valid unique entries', () => {
    expect(isValidSoundMap(generateEntries(128))).toBe(true);
  });

  it('UTCID08 returns false for 129 entries', () => {
    expect(isValidSoundMap(generateEntries(129))).toBe(false);
  });

  it('UTCID09 returns false for key "128" out of range', () => {
    expect(isValidSoundMap({ '128': U1 })).toBe(false);
  });

  it('UTCID10 returns false for non-UUID value', () => {
    expect(isValidSoundMap({ '60': 'not-a-uuid' })).toBe(false);
  });

  it('UTCID11 returns false when keys "7" and "007" map to same pitch', () => {
    expect(isValidSoundMap({ '7': U1, '007': U2 })).toBe(false);
  });

  it('UTCID12 returns false when same UUID is used on 2 pitches', () => {
    expect(isValidSoundMap({ '60': U1, '62': U1 })).toBe(false);
  });
});

// ============================================================================
// SHEET: SH-TYP-03 (isDrumKitInstrument)
// ============================================================================
describe('SH-TYP-03 isDrumKitInstrument', () => {
  it('UTCID01 returns true for "Standard Drum Kit"', () => {
    expect(isDrumKitInstrument('Standard Drum Kit')).toBe(true);
  });

  it('UTCID02 returns true for "Orchestra Drum Kit"', () => {
    expect(isDrumKitInstrument('Orchestra Drum Kit')).toBe(true);
  });

  it('UTCID03 returns false for "Violin"', () => {
    expect(isDrumKitInstrument('Violin')).toBe(false);
  });

  it('UTCID04 returns false for null', () => {
    expect(isDrumKitInstrument(null)).toBe(false);
  });

  it('UTCID05 returns false for lowercase "standard drum kit"', () => {
    expect(isDrumKitInstrument('standard drum kit')).toBe(false);
  });

  it('UTCID06 returns false for empty string ""', () => {
    expect(isDrumKitInstrument('')).toBe(false);
  });
});
