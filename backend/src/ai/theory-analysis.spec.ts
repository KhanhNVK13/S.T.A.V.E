import type { DraftNote, DraftSnapshot } from '@stave/shared-types';
import {
  analyzeTheory,
  detectBarChords,
  detectTonality,
  matchChord,
  MAX_NOTES_FOR_THEORY,
} from './theory-analysis';

const PPQ = 480;
const BAR = PPQ * 4;

function n(
  id: string,
  pitch: number,
  start: number,
  duration = PPQ,
  trackId = 't1',
): DraftNote {
  return { id, trackId, pitch, start, duration, velocity: 90 };
}

function scale(pitches: number[], trackId = 't1'): DraftNote[] {
  return pitches.map((p, i) => n(`s${i}`, p, i * PPQ, PPQ, trackId));
}

function snap(
  notes: DraftNote[],
  tracks: DraftSnapshot['tracks'] = [],
): DraftSnapshot {
  return {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: PPQ },
    tracks,
    notes,
  };
}

function track(id: string, instrument: string | null = null) {
  return {
    id,
    name: id,
    order: 0,
    color: '#000',
    muted: false,
    solo: false,
    volume: 1,
    pan: 0,
    instrument,
  };
}

describe('detectTonality', () => {
  it('finds C major from a C major scale with tonic emphasis', () => {
    const notes = [
      ...scale([60, 62, 64, 65, 67, 69, 71, 72]),
      n('x1', 60, 4000, 960),
      n('x2', 67, 5000, 960),
      n('x3', 64, 6000, 480),
    ];
    const result = detectTonality(notes);
    expect(result?.tonic).toBe('C');
    expect(result?.mode).toBe('major');
    expect(result?.confidence).toBeGreaterThan(0.65);
  });

  it('finds A minor from a natural minor line centred on A', () => {
    const notes = [
      n('a', 69, 0, 1920),
      n('b', 71, 2000, 480),
      n('c', 72, 2500, 960),
      n('d', 74, 3500, 480),
      n('e', 76, 4000, 960),
      n('f', 65, 5000, 480),
      n('g', 67, 5500, 480),
      n('h', 69, 6000, 1920),
      n('i', 64, 8000, 960),
    ];
    const result = detectTonality(notes);
    expect(result?.tonic).toBe('A');
    expect(result?.mode).toBe('minor');
  });

  it('returns null for an empty note list', () => {
    expect(detectTonality([])).toBeNull();
  });

  it('returns null for a single note', () => {
    expect(detectTonality([n('a', 60, 0)])).toBeNull();
  });

  it('returns null when fewer than three pitch classes are used', () => {
    const notes = [60, 60, 67, 67, 60].map((p, i) => n(`a${i}`, p, i * PPQ));
    expect(detectTonality(notes)).toBeNull();
  });

  it('returns null for an ambiguous chromatic cluster instead of guessing', () => {
    const notes = Array.from({ length: 12 }, (_, i) =>
      n(`c${i}`, 60 + i, i * PPQ),
    );
    expect(detectTonality(notes)).toBeNull();
  });
});

describe('matchChord', () => {
  it('names the basic triads and sevenths', () => {
    expect(matchChord(new Set([0, 4, 7]), 0)).toBe('C');
    expect(matchChord(new Set([9, 0, 4]), 9)).toBe('Am');
    expect(matchChord(new Set([11, 2, 5]), 11)).toBe('Bdim');
    expect(matchChord(new Set([0, 4, 8]), 0)).toBe('Caug');
    expect(matchChord(new Set([0, 4, 7, 11]), 0)).toBe('Cmaj7');
    expect(matchChord(new Set([7, 11, 2, 5]), 7)).toBe('G7');
    expect(matchChord(new Set([2, 5, 9, 0]), 2)).toBe('Dm7');
  });

  it('returns null for unknown shapes and for fewer than three notes', () => {
    expect(matchChord(new Set([0, 1, 2]), 0)).toBeNull();
    expect(matchChord(new Set([0, 7]), 0)).toBeNull();
  });

  it('uses the bass note to resolve symmetric augmented chords', () => {
    expect(matchChord(new Set([0, 4, 8]), 4)).toBe('Eaug');
  });
});

describe('detectBarChords', () => {
  it('detects a chord per bar and numbers bars from 1', () => {
    const notes = [
      n('a', 60, 0, BAR),
      n('b', 64, 0, BAR),
      n('c', 67, 0, BAR),
      n('d', 65, BAR, BAR),
      n('e', 69, BAR, BAR),
      n('f', 72, BAR, BAR),
    ];
    expect(detectBarChords(notes, PPQ, [4, 4])).toEqual([
      { bar: 1, chord: 'C' },
      { bar: 2, chord: 'F' },
    ]);
  });

  it('recognises an inversion (E-G-C)', () => {
    const notes = [n('a', 64, 0, BAR), n('b', 67, 0, BAR), n('c', 72, 0, BAR)];
    expect(detectBarChords(notes, PPQ, [4, 4])[0].chord).toBe('C');
  });

  it('gives null for a bar whose notes match no template', () => {
    const notes = [n('a', 60, 0, BAR), n('b', 61, 0, BAR), n('c', 62, 0, BAR)];
    expect(detectBarChords(notes, PPQ, [4, 4])).toEqual([
      { bar: 1, chord: null },
    ]);
  });

  it('skips bars that contain no notes', () => {
    const notes = [n('a', 60, BAR * 2, BAR)];
    expect(detectBarChords(notes, PPQ, [4, 4])).toEqual([
      { bar: 3, chord: null },
    ]);
  });

  it('splits a long note across the bars it spans', () => {
    const notes = [
      n('a', 60, 0, BAR * 2),
      n('b', 64, 0, BAR * 2),
      n('c', 67, 0, BAR * 2),
    ];
    expect(detectBarChords(notes, PPQ, [4, 4])).toEqual([
      { bar: 1, chord: 'C' },
      { bar: 2, chord: 'C' },
    ]);
  });

  it('returns nothing for an invalid time signature or ppq', () => {
    const notes = [n('a', 60, 0, BAR)];
    expect(detectBarChords(notes, 0, [4, 4])).toEqual([]);
    expect(detectBarChords(notes, PPQ, [0, 4])).toEqual([]);
  });
});

describe('analyzeTheory', () => {
  it('ignores drum-kit tracks', () => {
    const drumNotes = [36, 38, 42, 46, 49].map((p, i) =>
      n(`d${i}`, p, i * PPQ, PPQ, 'drums'),
    );
    const result = analyzeTheory(
      snap(drumNotes, [track('drums', 'Standard Drum Kit')]),
    );
    expect(result.tonality).toBeNull();
    expect(result.chords).toEqual([]);
  });

  it('returns an empty analysis for a project with no tracks or notes', () => {
    expect(analyzeTheory(snap([]))).toEqual({
      tonality: null,
      chords: [],
      truncated: false,
    });
  });

  it('skips chords and flags truncation above the note limit', () => {
    const notes = Array.from({ length: MAX_NOTES_FOR_THEORY + 1 }, (_, i) =>
      n(`n${i}`, 60 + (i % 7), i * 10, 10),
    );
    const result = analyzeTheory(snap(notes, [track('t1')]));
    expect(result.truncated).toBe(true);
    expect(result.chords).toEqual([]);
  });

  it('flags truncation above the track limit', () => {
    const tracks = Array.from({ length: 17 }, (_, i) => track(`t${i}`));
    expect(analyzeTheory(snap([], tracks)).truncated).toBe(true);
  });
});

describe('robustness', () => {
  it('detects a chord despite a short passing tone', () => {
    const notes = [
      n('a', 60, 0, BAR),
      n('b', 64, 0, BAR),
      n('c', 67, 0, BAR),
      n('d', 62, 0, PPQ / 2),
    ];
    expect(detectBarChords(notes, PPQ, [4, 4])).toEqual([
      { bar: 1, chord: 'C' },
    ]);
  });

  it('bounds the work for an absurdly long note and flags truncation', () => {
    const notes = [60, 64, 67].map((p, i) => n(`l${i}`, p, 0, 2_000_000_000));
    const result = analyzeTheory(snap(notes, [track('t1')]));
    expect(result.chords.length).toBeLessThanOrEqual(512);
    expect(result.truncated).toBe(true);
  });

  it('does not throw on a snapshot missing meta, tracks or notes', () => {
    const partial = { schemaVersion: 1 } as unknown as DraftSnapshot;
    expect(analyzeTheory(partial)).toEqual({
      tonality: null,
      chords: [],
      truncated: false,
    });
  });
});
