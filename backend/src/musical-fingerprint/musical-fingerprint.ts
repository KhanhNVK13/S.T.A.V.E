import {
  GM_INSTRUMENTS,
  isDrumKitInstrument,
  type DraftSnapshot,
} from '@stave/shared-types';
import { analyzeTheory, type TonalityMode } from '../ai/theory-analysis';
import { instrumentStoredForms } from '../explore/instrument-codes';

export const FINGERPRINT_DIMENSIONS = 24;

export interface MusicalFingerprint {
  embedding: number[];
  tempo: number;
  tonalityTonic: string | null;
  tonalityMode: TonalityMode | null;
  noteDensity: number;
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
] as const;

/**
 * 5 instrument family buckets at embedding indices 19..23:
 * 0 = piano/keys, 1 = guitar/plucked, 2 = strings/winds/brass,
 * 3 = bass/synth, 4 = drums/percussion.
 */
const CATEGORY_TO_FAMILY: Record<string, number> = {
  Piano: 0,
  Organ: 0,
  Guitar: 1,
  Ethnic: 1,
  Strings: 2,
  Ensemble: 2,
  Brass: 2,
  Reed: 2,
  Pipe: 2,
  Bass: 3,
  'Synth Lead': 3,
  'Synth Pad': 3,
  'Synth Effects': 3,
  'Sound Effects': 3,
  'Drum Kit': 4,
  Percussive: 4,
  'Chromatic Percussion': 4,
};

const INSTRUMENT_FAMILY_LOOKUP = (() => {
  const map = new Map<string, number>();
  for (const inst of GM_INSTRUMENTS) {
    const family = CATEGORY_TO_FAMILY[inst.category] ?? 3;
    map.set(inst.name.toLowerCase(), family);
    for (const stored of instrumentStoredForms(inst.name)) {
      map.set(stored.toLowerCase(), family);
    }
  }
  return map;
})();

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function mod12(value: number): number {
  return ((Math.round(value) % 12) + 12) % 12;
}

function resolveInstrumentFamily(
  instrument: string | null | undefined,
): number {
  if (!instrument) return 3; // Default STAVE track sound is a sine synth.
  const trimmed = instrument.trim().toLowerCase();
  if (isDrumKitInstrument(instrument)) return 4;
  return INSTRUMENT_FAMILY_LOOKUP.get(trimmed) ?? 3;
}

export function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (!Number.isFinite(norm) || norm === 0) {
    return vec.map(() => 0);
  }
  return vec.map((v) => v / norm);
}

export function formatPgVector(vec: number[]): string {
  const formatted = vec.map((n) =>
    Number.isFinite(n) ? n.toFixed(6) : '0.000000',
  );
  return `[${formatted.join(',')}]`;
}

export function extractMusicalFingerprint(
  snapshot: DraftSnapshot,
): MusicalFingerprint | null {
  const allNotes = snapshot.notes ?? [];
  if (allNotes.length === 0) {
    return null;
  }

  const theory = analyzeTheory(snapshot);
  if (theory.profile.totalNotes === 0) {
    return null;
  }

  const tracks = snapshot.tracks ?? [];
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const percussionTrackIds = new Set(
    tracks.filter((t) => isDrumKitInstrument(t.instrument)).map((t) => t.id),
  );
  const pitchedNotes = allNotes.filter(
    (note) => !percussionTrackIds.has(note.trackId),
  );

  // [0..11] Duration-weighted pitch-class chroma histogram, rotated to detected tonic.
  const rawChroma = new Array<number>(12).fill(0);
  let totalChromaWeight = 0;
  let pitchSum = 0;
  for (const note of pitchedNotes) {
    const pitch = clamp(note.pitch, 0, 127);
    const weight = Math.max(
      Number.isFinite(note.duration) ? note.duration : 1,
      1,
    );
    rawChroma[mod12(pitch)] += weight;
    totalChromaWeight += weight;
    pitchSum += pitch;
  }

  const tonicIdx = theory.tonality
    ? Math.max(
        0,
        PITCH_NAMES.indexOf(
          theory.tonality.tonic as (typeof PITCH_NAMES)[number],
        ),
      )
    : 0;

  const vec = new Array<number>(FINGERPRINT_DIMENSIONS).fill(0);
  if (totalChromaWeight > 0) {
    for (let i = 0; i < 12; i++) {
      vec[i] = rawChroma[mod12(i + tonicIdx)] / totalChromaWeight;
    }
  }

  // [12..18] Tempo, mode, density, pitch center/span, velocity mean/range.
  vec[12] = clamp((theory.profile.tempo - 40) / 180, 0, 1);
  vec[13] = theory.tonality ? (theory.tonality.mode === 'major' ? 1 : 0) : 0.5;
  vec[14] = clamp(theory.profile.averageNotesPerBar / 32, 0, 1);

  if (pitchedNotes.length > 0 && theory.profile.pitchRange) {
    const avgMidi = pitchSum / pitchedNotes.length;
    const span =
      theory.profile.pitchRange.highestMidi -
      theory.profile.pitchRange.lowestMidi;
    vec[15] = clamp((avgMidi - 21) / 87, 0, 1);
    vec[16] = clamp(span / 72, 0, 1);
  }

  if (theory.profile.velocity) {
    vec[17] = clamp(theory.profile.velocity.average / 127, 0, 1);
    vec[18] = clamp(
      (theory.profile.velocity.max - theory.profile.velocity.min) / 127,
      0,
      1,
    );
  }

  // [19..23] 5 instrument family ratios weighted by note count per track.
  const familyCounts = new Array<number>(5).fill(0);
  let familyTotal = 0;
  for (const note of allNotes) {
    const track = trackById.get(note.trackId);
    const family = resolveInstrumentFamily(track?.instrument);
    familyCounts[family] += 1;
    familyTotal += 1;
  }
  if (familyTotal === 0 && tracks.length > 0) {
    for (const track of tracks) {
      familyCounts[resolveInstrumentFamily(track.instrument)] += 1;
      familyTotal += 1;
    }
  }
  if (familyTotal > 0) {
    for (let f = 0; f < 5; f++) {
      vec[19 + f] = familyCounts[f] / familyTotal;
    }
  }

  return {
    embedding: l2Normalize(vec),
    tempo: Math.round(theory.profile.tempo),
    tonalityTonic: theory.tonality?.tonic ?? null,
    tonalityMode: theory.tonality?.mode ?? null,
    noteDensity: theory.profile.averageNotesPerBar,
  };
}
