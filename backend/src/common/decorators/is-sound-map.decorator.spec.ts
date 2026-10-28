import { validate } from 'class-validator';
import { IsSoundMap } from './is-sound-map.decorator';

// ============================================================================
// SHEET: BE-COM-04 (IsSoundMap decorator)
// ============================================================================
describe('BE-COM-04 IsSoundMap decorator', () => {
  const STANDARD_MESSAGE =
    'soundMap must map pitches 0-127 to custom sound ids';

  class SoundMapDto {
    @IsSoundMap()
    soundMap?: unknown;
  }

  class SoundMapDtoCustomMessage {
    @IsSoundMap({ message: 'bad map' })
    soundMap?: unknown;
  }

  const U1 = '11111111-2222-3333-4444-555555555555';
  const U2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  const uuidFor = (n: number): string =>
    `${n
      .toString(16)
      .padStart(8, '0')}-0000-4000-8000-${n
      .toString(16)
      .padStart(12, '0')}`;

  const entries = (count: number) =>
    Object.fromEntries(
      Array.from({ length: count }, (_, i) => [String(i), uuidFor(i)]),
    );

  const checkErrors = async (
    value: unknown,
    customMessage = false,
  ): Promise<string | undefined> => {
    const instance = Object.assign(
      customMessage ? new SoundMapDtoCustomMessage() : new SoundMapDto(),
      { soundMap: value },
    );
    const errors = await validate(instance);
    return errors[0]?.constraints?.isSoundMap;
  };

  it('UTCID01 treats undefined as valid', async () => {
    expect(await checkErrors(undefined)).toBeUndefined();
  });

  it('UTCID02 treats null as valid', async () => {
    expect(await checkErrors(null)).toBeUndefined();
  });

  it('UTCID03 accepts a pitch-to-sound-id map', async () => {
    expect(await checkErrors({ '60': U1 })).toBeUndefined();
  });

  it('UTCID04 accepts the pitch boundaries 0 and 127', async () => {
    expect(await checkErrors({ '0': U1, '127': U2 })).toBeUndefined();
  });

  it('UTCID05 accepts 128 valid entries (limit)', async () => {
    expect(await checkErrors(entries(128))).toBeUndefined();
  });

  it('UTCID06 accepts an empty object', async () => {
    expect(await checkErrors({})).toBeUndefined();
  });

  it('UTCID07 rejects 129 entries (one over the limit)', async () => {
    expect(await checkErrors(entries(129))).toBe(STANDARD_MESSAGE);
  });

  it('UTCID08 rejects a pitch above 127', async () => {
    expect(await checkErrors({ '128': U1 })).toBe(STANDARD_MESSAGE);
  });

  it('UTCID09 rejects a negative pitch', async () => {
    expect(await checkErrors({ '-1': U1 })).toBe(STANDARD_MESSAGE);
  });

  it('UTCID10 rejects a non-UUID sound id', async () => {
    expect(await checkErrors({ '60': 'not-uuid' })).toBe(STANDARD_MESSAGE);
  });

  it('UTCID11 rejects an array value', async () => {
    expect(await checkErrors([])).toBe(STANDARD_MESSAGE);
  });

  it('UTCID12 rejects a non-object value', async () => {
    expect(await checkErrors('abc')).toBe(STANDARD_MESSAGE);
  });

  it('UTCID13 rejects a duplicated pitch ("060" is pitch 60)', async () => {
    expect(await checkErrors({ '60': U1, '060': U2 })).toBe(STANDARD_MESSAGE);
  });

  it('UTCID14 reports the custom message override', async () => {
    expect(await checkErrors({ '60': 'not-uuid' }, true)).toBe('bad map');
  });

  it('UTCID15 rejects one sound mapped to two pitches (SRS BR-62)', async () => {
    expect(await checkErrors({ '60': U1, '61': U1 })).toBe(STANDARD_MESSAGE);
  });
});
