import { GM_INSTRUMENT_NAMES } from '@stave/shared-types';
import { instrumentStoredForms } from './instrument-codes';

describe('instrumentStoredForms', () => {
  it('returns the GM name and the snake_case code', () => {
    expect(instrumentStoredForms('Acoustic Grand Piano')).toEqual([
      'Acoustic Grand Piano',
      'acoustic_grand_piano',
    ]);
  });

  it('drops parentheses in the code form', () => {
    expect(instrumentStoredForms('Electric Guitar (jazz)')).toContain(
      'electric_guitar_jazz',
    );
    expect(instrumentStoredForms('Electric Bass (finger)')).toContain(
      'electric_bass_finger',
    );
  });

  it('adds the short kit code for drum kits', () => {
    expect(instrumentStoredForms('Standard Drum Kit')).toEqual([
      'Standard Drum Kit',
      'standard_drum_kit',
      'standard_kit',
    ]);
    expect(instrumentStoredForms('Orchestra Drum Kit')).toContain(
      'orchestra_kit',
    );
  });

  it('adds a hyphen-joined code for hyphenated names', () => {
    const forms = instrumentStoredForms('Honky-tonk Piano');
    expect(forms).toContain('honky_tonk_piano');
    expect(forms).toContain('honkytonk_piano');
  });

  it('only yields characters that are safe in a PostgREST array filter', () => {
    for (const name of GM_INSTRUMENT_NAMES) {
      for (const form of instrumentStoredForms(name)) {
        expect(form).toMatch(/^[A-Za-z0-9 ()+-]+$|^[a-z0-9_]+$/);
        expect(form).not.toMatch(/["{},]/);
      }
    }
  });
});
