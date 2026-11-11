import { isDrumKitInstrument, type DraftSnapshot } from '@stave/shared-types';

export const MAX_NOTES_FOR_THEORY = 5000;
export const MAX_TRACKS_FOR_THEORY = 16;
export const MIN_NOTES_FOR_TONALITY = 4;
export const MIN_PITCH_CLASSES_FOR_TONALITY = 3;
export const MIN_TONALITY_CONFIDENCE = 0.65;
export const MAX_BARS_FOR_CHORDS = 512;

export type TonalityMode = 'major' | 'minor';

export interface Tonality {
  tonic: string;
  mode: TonalityMode;
  confidence: number;
}

export interface BarChord {
  bar: number;
  chord: string | null;
}

export interface TheoryAnalysis {
  tonality: Tonality | null;
  chords: BarChord[];
  truncated: boolean;
}

const PITCH_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

const CHORD_TEMPLATES: Array<{ suffix: string; intervals: number[] }> = [
  { suffix: '', intervals: [0, 4, 7] },
  { suffix: 'm', intervals: [0, 3, 7] },
  { suffix: 'dim', intervals: [0, 3, 6] },
  { suffix: 'aug', intervals: [0, 4, 8] },
  { suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { suffix: '7', intervals: [0, 4, 7, 10] },
  { suffix: 'm7', intervals: [0, 3, 7, 10] },
];

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

interface PitchedNote {
  pitch: number;
  start: number;
  duration: number;
}

export function detectTonality(notes: PitchedNote[]): Tonality | null {
  if (notes.length < MIN_NOTES_FOR_TONALITY) return null;

  const histogram = new Array<number>(12).fill(0);
  for (const note of notes) {
    histogram[mod12(note.pitch)] += Math.max(note.duration, 1);
  }
  if (histogram.filter((w) => w > 0).length < MIN_PITCH_CLASSES_FOR_TONALITY) {
    return null;
  }

  let best: { tonic: number; mode: TonalityMode; r: number } | null = null;
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = histogram.map((_, i) => histogram[mod12(i + tonic)]);
    for (const [mode, profile] of [
      ['major', MAJOR_PROFILE],
      ['minor', MINOR_PROFILE],
    ] as const) {
      const r = pearson(rotated, profile);
      if (!best || r > best.r) best = { tonic, mode, r };
    }
  }

  if (!best || best.r < MIN_TONALITY_CONFIDENCE) return null;
  return {
    tonic: PITCH_NAMES[best.tonic],
    mode: best.mode,
    confidence: Math.round(Math.min(best.r, 1) * 100) / 100,
  };
}

export function matchChord(
  pitchClasses: Set<number>,
  bassPitchClass: number,
): string | null {
  if (pitchClasses.size < 3) return null;
  const matches: string[] = [];
  for (const root of pitchClasses) {
    for (const template of CHORD_TEMPLATES) {
      if (template.intervals.length !== pitchClasses.size) continue;
      const fits = template.intervals.every((i) =>
        pitchClasses.has(mod12(root + i)),
      );
      if (fits) {
        matches.push(`${root}:${PITCH_NAMES[root]}${template.suffix}`);
      }
    }
  }
  if (matches.length === 0) return null;
  const preferred =
    matches.find((m) => Number(m.split(':')[0]) === bassPitchClass) ??
    matches.sort(
      (a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0]),
    )[0];
  return preferred.split(':')[1];
}

export function detectBarChords(
  notes: PitchedNote[],
  ppq: number,
  timeSignature: [number, number],
  maxBars = MAX_BARS_FOR_CHORDS,
): BarChord[] {
  const [numerator, denominator] = timeSignature;
  if (
    !Number.isFinite(ppq) ||
    ppq <= 0 ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator <= 0 ||
    denominator <= 0
  ) {
    return [];
  }
  const barTicks = Math.round((ppq * 4 * numerator) / denominator);
  if (barTicks <= 0) return [];
  const minWeight = barTicks / 16;

  const perBar = new Map<number, { weights: number[]; lowestPitch: number }>();
  for (const note of notes) {
    const duration = Math.max(note.duration, 1);
    const end = note.start + duration;
    const firstBar = Math.floor(note.start / barTicks);
    const lastBar = Math.min(Math.floor((end - 1) / barTicks), maxBars - 1);
    for (let bar = firstBar; bar <= lastBar; bar++) {
      const overlap =
        Math.min(end, (bar + 1) * barTicks) -
        Math.max(note.start, bar * barTicks);
      if (overlap <= 0) continue;
      let entry = perBar.get(bar);
      if (!entry) {
        entry = { weights: new Array<number>(12).fill(0), lowestPitch: 128 };
        perBar.set(bar, entry);
      }
      entry.weights[mod12(note.pitch)] += overlap;
      if (note.pitch < entry.lowestPitch) entry.lowestPitch = note.pitch;
    }
  }

  return [...perBar.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bar, entry]) => {
      const bass = mod12(entry.lowestPitch);
      const chordAt = (threshold: number) => {
        const present = new Set<number>();
        entry.weights.forEach((w, pc) => {
          if (w >= threshold) present.add(pc);
        });
        return matchChord(present, bass);
      };
      return {
        bar: bar + 1,
        chord: chordAt(minWeight) ?? chordAt(barTicks / 4),
      };
    });
}

export function analyzeTheory(snapshot: DraftSnapshot): TheoryAnalysis {
  const tracks = snapshot.tracks ?? [];
  const allNotes = snapshot.notes ?? [];
  const percussionTracks = new Set(
    tracks
      .filter((track) => isDrumKitInstrument(track.instrument))
      .map((track) => track.id),
  );
  const notes = allNotes.filter((note) => !percussionTracks.has(note.trackId));

  const truncated =
    allNotes.length > MAX_NOTES_FOR_THEORY ||
    tracks.length > MAX_TRACKS_FOR_THEORY;

  const tonality = detectTonality(notes);
  if (truncated) return { tonality, chords: [], truncated: true };

  const ppq = snapshot.meta?.ppq ?? 480;
  const timeSignature = snapshot.meta?.timeSignature ?? [4, 4];
  const chords = detectBarChords(notes, ppq, timeSignature);
  const [numerator, denominator] = timeSignature;
  const barTicks = (ppq * 4 * numerator) / denominator;
  const cutOff =
    barTicks > 0 &&
    notes.some(
      (note) => note.start + note.duration > barTicks * MAX_BARS_FOR_CHORDS,
    );
  return { tonality, chords, truncated: cutOff };
}
