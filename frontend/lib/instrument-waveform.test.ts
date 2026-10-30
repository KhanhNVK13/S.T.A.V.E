import { describe, it, expect } from 'vitest';
import { getOscillatorType } from './instrument-waveform';

describe('FE-LIB-19 instrument-waveform.getOscillatorType(instrument)', () => {
  it('UTCID01 returns triangle when instrument is null', () => {
    expect(getOscillatorType(null)).toBe('triangle');
  });

  it('UTCID02 returns triangle for Acoustic Grand Piano', () => {
    expect(getOscillatorType('Acoustic Grand Piano')).toBe('triangle');
  });

  it('UTCID03 returns sawtooth for Church Organ', () => {
    expect(getOscillatorType('Church Organ')).toBe('sawtooth');
  });

  it('UTCID04 returns sawtooth for Tango Accordion', () => {
    expect(getOscillatorType('Tango Accordion')).toBe('sawtooth');
  });

  it('UTCID05 returns triangle for Acoustic Guitar (nylon)', () => {
    expect(getOscillatorType('Acoustic Guitar (nylon)')).toBe('triangle');
  });

  it('UTCID06 returns triangle for Orchestral Harp', () => {
    expect(getOscillatorType('Orchestral Harp')).toBe('triangle');
  });

  it('UTCID07 returns sawtooth for Electric Bass (finger)', () => {
    expect(getOscillatorType('Electric Bass (finger)')).toBe('sawtooth');
  });

  it('UTCID08 returns square for Trumpet', () => {
    expect(getOscillatorType('Trumpet')).toBe('square');
  });

  it('UTCID09 returns square for Brass Section', () => {
    expect(getOscillatorType('Brass Section')).toBe('square');
  });

  it('UTCID10 returns triangle for Violin', () => {
    expect(getOscillatorType('Violin')).toBe('triangle');
  });

  it('UTCID11 returns sine for Pad 8 (sweep)', () => {
    expect(getOscillatorType('Pad 8 (sweep)')).toBe('sine');
  });

  it('UTCID12 returns sine for FX 4 (atmosphere)', () => {
    expect(getOscillatorType('FX 4 (atmosphere)')).toBe('sine');
  });

  it('UTCID13 returns triangle for Lead 1 (square) by default', () => {
    expect(getOscillatorType('Lead 1 (square)')).toBe('triangle');
  });

  it('UTCID14 returns sawtooth for Bassoon (contains "bass")', () => {
    expect(getOscillatorType('Bassoon')).toBe('sawtooth');
  });

  it('UTCID15 returns triangle for Flute by default', () => {
    expect(getOscillatorType('Flute')).toBe('triangle');
  });
});
