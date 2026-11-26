import type { DraftSnapshot } from '@stave/shared-types';
import {
  FINGERPRINT_DIMENSIONS,
  extractMusicalFingerprint,
  formatPgVector,
} from './musical-fingerprint';

function makeNote(
  trackId: string,
  pitch: number,
  start: number,
  duration = 480,
  velocity = 90,
) {
  return {
    id: `n-${trackId}-${pitch}-${start}`,
    trackId,
    pitch,
    start,
    duration,
    velocity,
  };
}

function makeSnapshot(over: Partial<DraftSnapshot> = {}): DraftSnapshot {
  return {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [
      {
        id: 't1',
        name: 'Piano',
        order: 0,
        color: '#6366f1',
        muted: false,
        solo: false,
        volume: 1,
        pan: 0,
        instrument: 'Acoustic Grand Piano',
      },
    ],
    notes: [
      makeNote('t1', 60, 0),
      makeNote('t1', 64, 480),
      makeNote('t1', 67, 960),
      makeNote('t1', 72, 1440),
    ],
    ...over,
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

describe('extractMusicalFingerprint', () => {
  it('returns null when snapshot has 0 notes', () => {
    expect(extractMusicalFingerprint(makeSnapshot({ notes: [] }))).toBeNull();
  });

  it('produces a 24-dim L2-normalized vector and metadata', () => {
    const fp = extractMusicalFingerprint(makeSnapshot());
    expect(fp).not.toBeNull();
    expect(fp!.embedding).toHaveLength(FINGERPRINT_DIMENSIONS);
    const norm = Math.sqrt(fp!.embedding.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
    expect(fp!.tempo).toBe(120);
    expect(fp!.tonalityTonic).toBe('C');
    expect(fp!.tonalityMode).toBe('major');
    expect(fp!.noteDensity).toBe(4);
  });

  it('produces near-identical fingerprints across transpositions of the same progression', () => {
    const cMajorNotes = [
      // C major chord -> F major -> G major -> C major
      makeNote('t1', 60, 0, 960),
      makeNote('t1', 64, 0, 960),
      makeNote('t1', 67, 0, 960),
      makeNote('t1', 65, 960, 960),
      makeNote('t1', 69, 960, 960),
      makeNote('t1', 72, 960, 960),
      makeNote('t1', 67, 1920, 960),
      makeNote('t1', 71, 1920, 960),
      makeNote('t1', 74, 1920, 960),
      makeNote('t1', 60, 2880, 960),
    ];
    const dMajorNotes = cMajorNotes.map((n) => ({
      ...n,
      pitch: n.pitch + 2,
    }));

    const fpC = extractMusicalFingerprint(makeSnapshot({ notes: cMajorNotes }));
    const fpD = extractMusicalFingerprint(makeSnapshot({ notes: dMajorNotes }));

    expect(fpC!.tonalityTonic).toBe('C');
    expect(fpD!.tonalityTonic).toBe('D');
    expect(cosineSimilarity(fpC!.embedding, fpD!.embedding)).toBeGreaterThan(
      0.995,
    );
  });

  it('distinguishes instrument families, tempo, and minor vs major mode', () => {
    const minorStrings = makeSnapshot({
      meta: { tempo: 72, timeSignature: [4, 4], ppq: 480 },
      tracks: [
        {
          id: 't1',
          name: 'Strings',
          order: 0,
          color: '#6366f1',
          muted: false,
          solo: false,
          volume: 1,
          pan: 0,
          instrument: 'Violin',
        },
        {
          id: 't2',
          name: 'Drums',
          order: 1,
          color: '#10b981',
          muted: false,
          solo: false,
          volume: 1,
          pan: 0,
          instrument: 'Standard Drum Kit',
        },
      ],
      notes: [
        makeNote('t1', 57, 0, 960, 60),
        makeNote('t1', 60, 0, 960, 60),
        makeNote('t1', 64, 0, 960, 60),
        makeNote('t1', 69, 960, 960, 60),
        makeNote('t2', 36, 0, 240, 110),
      ],
    });

    const fp = extractMusicalFingerprint(minorStrings);
    expect(fp).not.toBeNull();
    expect(fp!.tempo).toBe(72);
    expect(fp!.tonalityTonic).toBe('A');
    expect(fp!.tonalityMode).toBe('minor');
    // Mode dim [13] is 0 for minor, Strings/Winds/Brass [21] > 0, Drums [23] > 0.
    expect(fp!.embedding[13]).toBe(0);
    expect(fp!.embedding[21]).toBeGreaterThan(0);
    expect(fp!.embedding[23]).toBeGreaterThan(0);
  });

  it('handles percussion-only snapshots cleanly without NaN values', () => {
    const drumOnly = makeSnapshot({
      tracks: [
        {
          id: 'd1',
          name: 'Drums',
          order: 0,
          color: '#f59e0b',
          muted: false,
          solo: false,
          volume: 1,
          pan: 0,
          instrument: 'Standard Drum Kit',
        },
      ],
      notes: [
        makeNote('d1', 36, 0, 240, 100),
        makeNote('d1', 38, 480, 240, 90),
      ],
    });

    const fp = extractMusicalFingerprint(drumOnly);
    expect(fp).not.toBeNull();
    expect(fp!.tonalityTonic).toBeNull();
    expect(fp!.tonalityMode).toBeNull();
    expect(fp!.embedding.every((v) => Number.isFinite(v))).toBe(true);
    expect(fp!.embedding[23]).toBeGreaterThan(0);
  });

  it('formats embedding as a pgvector literal string', () => {
    const vec = Array.from({ length: 24 }, (_, i) => (i === 0 ? 1 : 0));
    const formatted = formatPgVector(vec);
    expect(formatted.startsWith('[0.') || formatted.startsWith('[1.')).toBe(
      true,
    );
    expect(formatted).toMatch(/^\[[0-9.-]+(,[0-9.-]+){23}\]$/);
  });
});
