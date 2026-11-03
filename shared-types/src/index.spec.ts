import {
  sanitizeSoundMap,
  isValidSoundMap,
  isDrumKitInstrument,
} from './index';

/** UUID hợp lệ, sinh deterministic để assert chính xác. */
const uuid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const UUID_60 = uuid(60);
const UUID_60_UPPER = UUID_60.toUpperCase();

/** Map "pitch → sound id" với `count` entry hợp lệ (key 0..count-1). */
const validMap = (count: number): Record<string, string> => {
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) out[String(i)] = uuid(i);
  return out;
};

// =============================================================================
// SH-TYP-01 — shared-types.sanitizeSoundMap(value)
// =============================================================================

describe('SH-TYP-01 sanitizeSoundMap(value)', () => {
  it('UTCID01 (A) value is undefined returns undefined', () => {
    expect(sanitizeSoundMap(undefined)).toBeUndefined();
  });

  it('UTCID02 (A) value is null returns undefined', () => {
    expect(sanitizeSoundMap(null)).toBeUndefined();
  });

  it('UTCID03 (A) value is an array returns undefined', () => {
    expect(sanitizeSoundMap([])).toBeUndefined();
  });

  it('UTCID04 (A) value is a string returns undefined', () => {
    expect(sanitizeSoundMap('abc')).toBeUndefined();
  });

  it('UTCID05 (N) key "60" with a valid UUID returns { "60": uuid }', () => {
    expect(sanitizeSoundMap({ '60': UUID_60 })).toEqual({ '60': UUID_60 });
  });

  it('UTCID06 (B) key "0" (min pitch) is kept', () => {
    expect(sanitizeSoundMap({ '0': UUID_60 })).toEqual({ '0': UUID_60 });
  });

  it('UTCID07 (B) key "127" (max pitch) is kept', () => {
    expect(sanitizeSoundMap({ '127': UUID_60 })).toEqual({ '127': UUID_60 });
  });

  it('UTCID08 (A) key "128" is dropped and returns undefined', () => {
    expect(sanitizeSoundMap({ '128': UUID_60 })).toBeUndefined();
  });

  it('UTCID09 (A) key "-1" is dropped and returns undefined', () => {
    expect(sanitizeSoundMap({ '-1': UUID_60 })).toBeUndefined();
  });

  it('UTCID10 (A) key "C4" (non-numeric) is dropped and returns undefined', () => {
    expect(sanitizeSoundMap({ C4: UUID_60 })).toBeUndefined();
  });

  it('UTCID11 (A) key "1000" (4 digits) is dropped and returns undefined', () => {
    expect(sanitizeSoundMap({ '1000': UUID_60 })).toBeUndefined();
  });

  it('UTCID12 (B) key "060" (leading zero) is normalised to "60"', () => {
    expect(sanitizeSoundMap({ '060': UUID_60 })).toEqual({ '60': UUID_60 });
  });

  it('UTCID13 (N) soundId uppercase UUID is accepted', () => {
    expect(sanitizeSoundMap({ '60': UUID_60_UPPER })).toEqual({
      '60': UUID_60_UPPER,
    });
  });

  it('UTCID14 (A) soundId "abc" (not a UUID) is dropped and returns undefined', () => {
    expect(sanitizeSoundMap({ '60': 'abc' })).toBeUndefined();
  });

  it('UTCID15 (A) soundId 42 (number) is dropped and returns undefined', () => {
    expect(sanitizeSoundMap({ '60': 42 as unknown as string })).toBeUndefined();
  });

  it('UTCID16 (B) 128 valid entries are all kept', () => {
    const result = sanitizeSoundMap(validMap(128));

    expect(result).toBeDefined();
    expect(Object.keys(result!)).toHaveLength(128);
  });

  it('UTCID17 (B) 129 valid entries are truncated to the first 128', () => {
    const result = sanitizeSoundMap(validMap(129));

    expect(Object.keys(result!)).toHaveLength(128);
    expect(result!['128']).toBeUndefined();
  });

  it('UTCID18 (B) 2 valid + 2 invalid entries keep only the 2 valid ones', () => {
    const result = sanitizeSoundMap({
      '42': uuid(42),
      C4: uuid(43),
      '64': uuid(64),
      '-1': uuid(65),
    });

    expect(result).toEqual({ '42': uuid(42), '64': uuid(64) });
  });
});

// =============================================================================
// SH-TYP-02 — shared-types.isValidSoundMap(value)
// =============================================================================

describe('SH-TYP-02 isValidSoundMap(value)', () => {
  it('UTCID01 (N) value is undefined returns true', () => {
    expect(isValidSoundMap(undefined)).toBe(true);
  });

  it('UTCID02 (N) value is null returns true', () => {
    expect(isValidSoundMap(null)).toBe(true);
  });

  it('UTCID03 (A) value is an array returns false', () => {
    expect(isValidSoundMap([])).toBe(false);
  });

  it('UTCID04 (A) value is a string returns false', () => {
    expect(isValidSoundMap('x')).toBe(false);
  });

  it('UTCID05 (N) value is an empty object returns true', () => {
    expect(isValidSoundMap({})).toBe(true);
  });

  it('UTCID06 (N) 1 valid entry returns true', () => {
    expect(isValidSoundMap({ '42': uuid(42) })).toBe(true);
  });

  it('UTCID07 (B) 128 valid entries returns true', () => {
    expect(isValidSoundMap(validMap(128))).toBe(true);
  });

  it('UTCID08 (A) 129 entries returns false', () => {
    expect(isValidSoundMap(validMap(129))).toBe(false);
  });

  it('UTCID09 (A) 1 entry with key "128" (out of range) returns false', () => {
    expect(isValidSoundMap({ '128': uuid(42) })).toBe(false);
  });

  it('UTCID10 (A) 1 entry whose value is not a UUID returns false', () => {
    expect(isValidSoundMap({ '42': 'abc' })).toBe(false);
  });

  it('UTCID11 (A) keys "7" and "007" (same pitch) return false', () => {
    expect(isValidSoundMap({ '7': uuid(7), '007': uuid(8) })).toBe(false);
  });

  it('UTCID12 (A) the same UUID on 2 pitches returns false', () => {
    expect(isValidSoundMap({ '7': UUID_60, '14': UUID_60 })).toBe(false);
  });
});

// =============================================================================
// SH-TYP-03 — shared-types.isDrumKitInstrument(name)
// =============================================================================

describe('SH-TYP-03 isDrumKitInstrument(name)', () => {
  it('UTCID01 (N) returns true for "Standard Drum Kit"', () => {
    expect(isDrumKitInstrument('Standard Drum Kit')).toBe(true);
  });

  it('UTCID02 (N) returns true for "Orchestra Drum Kit"', () => {
    expect(isDrumKitInstrument('Orchestra Drum Kit')).toBe(true);
  });

  it('UTCID03 (N) returns false for "Violin"', () => {
    expect(isDrumKitInstrument('Violin')).toBe(false);
  });

  it('UTCID04 (A) returns false for null', () => {
    expect(isDrumKitInstrument(null)).toBe(false);
  });

  it('UTCID05 (A) returns false for "standard drum kit" (lowercase)', () => {
    expect(isDrumKitInstrument('standard drum kit')).toBe(false);
  });

  it('UTCID06 (B) returns false for an empty string', () => {
    expect(isDrumKitInstrument('')).toBe(false);
  });
});
