import {
  isDrumKitInstrument,
  type DraftNote,
  type DraftSnapshot,
  type DraftTrack,
} from '@stave/shared-types';

export const MAX_NOTES_FOR_THEORY = 5000;
export const MAX_TRACKS_FOR_THEORY = 16;
export const MIN_NOTES_FOR_TONALITY = 4;
export const MIN_PITCH_CLASSES_FOR_TONALITY = 3;
export const MIN_TONALITY_CONFIDENCE = 0.65;
export const ALTERNATIVE_TONALITY_MIN_CONFIDENCE = 0.6;
export const ALTERNATIVE_TONALITY_MAX_GAP = 0.15;
export const MAX_BARS_FOR_CHORDS = 512;
export const MAX_CADENCES = 24;
export const MAX_INTEGRITY_SAMPLES = 8;

export type TonalityMode = 'major' | 'minor';

export interface Tonality {
  tonic: string;
  mode: TonalityMode;
  confidence: number;
}

export interface TonalityCandidates {
  primary: Tonality | null;
  alternative: Tonality | null;
}

export interface BarChord {
  bar: number;
  chord: string | null;
  roman: string | null;
}

export type CadenceType = 'authentic' | 'plagal' | 'deceptive' | 'half';

export interface DetectedCadence {
  type: CadenceType;
  fromBar: number;
  toBar: number;
  fromChord: string;
  toChord: string;
  fromRoman: string;
  toRoman: string;
}

export interface DescriptiveProfile {
  tempo: number;
  timeSignature: [number, number];
  totalBars: number;
  totalNotes: number;
  pitchedTrackCount: number;
  percussionTrackCount: number;
  pitchRange: {
    lowest: string;
    highest: string;
    lowestMidi: number;
    highestMidi: number;
  } | null;
  averageNotesPerBar: number;
  densestBar: { bar: number; noteCount: number } | null;
  velocity: { min: number; max: number; average: number } | null;
  scaleFit: {
    inScalePercent: number;
    outOfScaleCount: number;
    accidentalPitchClasses: string[];
  } | null;
}

export interface MidiIntegritySample {
  bar: number;
  trackName: string;
  pitchName: string;
}

export interface MidiIntegrityReport {
  duplicateCount: number;
  overlapCount: number;
  duplicateSamples: MidiIntegritySample[];
  overlapSamples: MidiIntegritySample[];
}

export interface TheoryAnalysis {
  tonality: Tonality | null;
  alternativeTonality: Tonality | null;
  chords: BarChord[];
  cadences: DetectedCadence[];
  profile: DescriptiveProfile;
  integrity: MidiIntegrityReport;
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

const MAJOR_SCALE_OFFSETS = new Set([0, 2, 4, 5, 7, 9, 11]);
const MINOR_SCALE_OFFSETS = new Set([0, 2, 3, 5, 7, 8, 10]);

const MAJOR_STEP_NUMERALS = new Map<number, string>([
  [0, 'I'],
  [1, 'bII'],
  [2, 'II'],
  [3, 'bIII'],
  [4, 'III'],
  [5, 'IV'],
  [6, '#IV'],
  [7, 'V'],
  [8, 'bVI'],
  [9, 'VI'],
  [10, 'bVII'],
  [11, 'VII'],
]);

const MINOR_STEP_NUMERALS = new Map<number, string>([
  [0, 'I'],
  [1, 'bII'],
  [2, 'II'],
  [3, 'III'],
  [4, '#III'],
  [5, 'IV'],
  [6, '#IV'],
  [7, 'V'],
  [8, 'VI'],
  [9, '#VI'],
  [10, 'VII'],
  [11, '#VII'],
]);

const CHORD_TEMPLATES: Array<{ suffix: string; intervals: number[] }> = [
  { suffix: '', intervals: [0, 4, 7] },
  { suffix: 'm', intervals: [0, 3, 7] },
  { suffix: 'dim', intervals: [0, 3, 6] },
  { suffix: 'aug', intervals: [0, 4, 8] },
  { suffix: 'sus2', intervals: [0, 2, 7] },
  { suffix: 'sus4', intervals: [0, 5, 7] },
  { suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { suffix: '7', intervals: [0, 4, 7, 10] },
  { suffix: 'm7', intervals: [0, 3, 7, 10] },
  { suffix: 'dim7', intervals: [0, 3, 6, 9] },
];

export function midiPitchToSpn(pitch: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(pitch)));
  const octave = Math.floor(clamped / 12) - 1;
  return `${PITCH_NAMES[mod12(clamped)]}${octave}`;
}

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

function roundConfidence(r: number): number {
  return Math.round(Math.min(r, 1) * 100) / 100;
}

export function detectTonalityCandidates(
  notes: PitchedNote[],
): TonalityCandidates {
  if (notes.length < MIN_NOTES_FOR_TONALITY) {
    return { primary: null, alternative: null };
  }

  const histogram = new Array<number>(12).fill(0);
  for (const note of notes) {
    histogram[mod12(note.pitch)] += Math.max(note.duration, 1);
  }
  if (histogram.filter((w) => w > 0).length < MIN_PITCH_CLASSES_FOR_TONALITY) {
    return { primary: null, alternative: null };
  }

  const candidates: Array<{ tonic: number; mode: TonalityMode; r: number }> =
    [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = histogram.map((_, i) => histogram[mod12(i + tonic)]);
    for (const [mode, profile] of [
      ['major', MAJOR_PROFILE],
      ['minor', MINOR_PROFILE],
    ] as const) {
      candidates.push({ tonic, mode, r: pearson(rotated, profile) });
    }
  }
  candidates.sort((a, b) => b.r - a.r);

  const best = candidates[0];
  if (!best || best.r < MIN_TONALITY_CONFIDENCE) {
    return { primary: null, alternative: null };
  }

  const primary: Tonality = {
    tonic: PITCH_NAMES[best.tonic],
    mode: best.mode,
    confidence: roundConfidence(best.r),
  };

  const second = candidates[1];
  const alternative: Tonality | null =
    second &&
    second.r >= ALTERNATIVE_TONALITY_MIN_CONFIDENCE &&
    best.r - second.r <= ALTERNATIVE_TONALITY_MAX_GAP
      ? {
          tonic: PITCH_NAMES[second.tonic],
          mode: second.mode,
          confidence: roundConfidence(second.r),
        }
      : null;

  return { primary, alternative };
}

export function detectTonality(notes: PitchedNote[]): Tonality | null {
  return detectTonalityCandidates(notes).primary;
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

export function toRomanNumeral(
  chord: string,
  tonality: Tonality,
): string | null {
  const chordMatch =
    /^(C#|D#|F#|G#|A#|[A-G])(maj7|dim7|sus2|sus4|dim|aug|m7|m|7)?$/.exec(chord);
  if (!chordMatch) return null;
  const rootIdx = PITCH_NAMES.indexOf(chordMatch[1]);
  const tonicIdx = PITCH_NAMES.indexOf(tonality.tonic);
  if (rootIdx < 0 || tonicIdx < 0) return null;

  const offset = mod12(rootIdx - tonicIdx);
  const rawDegree =
    tonality.mode === 'major'
      ? MAJOR_STEP_NUMERALS.get(offset)
      : MINOR_STEP_NUMERALS.get(offset);
  if (!rawDegree) return null;

  const quality = chordMatch[2] ?? '';
  const lowercaseQualities = new Set(['m', 'm7', 'dim', 'dim7']);
  const degreeMatch = /^([b#]?)(.+)$/.exec(rawDegree);
  if (!degreeMatch) return null;
  const prefix = degreeMatch[1];
  const baseRoman = lowercaseQualities.has(quality)
    ? degreeMatch[2].toLowerCase()
    : degreeMatch[2].toUpperCase();

  let suffix = '';
  if (quality === 'dim') suffix = '°';
  else if (quality === 'dim7') suffix = '°7';
  else if (quality === 'aug') suffix = '+';
  else if (quality === 'm7') suffix = '7';
  else if (
    quality === '7' ||
    quality === 'maj7' ||
    quality === 'sus2' ||
    quality === 'sus4'
  ) {
    suffix = quality;
  }

  return `${prefix}${baseRoman}${suffix}`;
}

export function detectBarChords(
  notes: PitchedNote[],
  ppq: number,
  timeSignature: [number, number],
  maxBars = MAX_BARS_FOR_CHORDS,
  tonality: Tonality | null = null,
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
      const chord = chordAt(minWeight) ?? chordAt(barTicks / 4);
      return {
        bar: bar + 1,
        chord,
        roman: chord && tonality ? toRomanNumeral(chord, tonality) : null,
      };
    });
}

const TONIC_ROMANS = new Set(['I', 'i']);
const DOMINANT_ROMANS = new Set(['V', 'V7']);
const SUBDOMINANT_ROMANS = new Set(['IV', 'iv']);
const SUBMEDIANT_ROMANS = new Set(['vi', 'VI']);
const HALF_CADENCE_ORIGINS = new Set([
  'I',
  'i',
  'ii',
  'ii°',
  'IV',
  'iv',
  'vi',
  'VI',
]);

export function detectCadences(chords: BarChord[]): DetectedCadence[] {
  const chorded = chords.filter(
    (c): c is { bar: number; chord: string; roman: string } =>
      c.chord !== null && c.roman !== null,
  );
  const cadences: DetectedCadence[] = [];
  for (let i = 1; i < chorded.length; i++) {
    const prev = chorded[i - 1];
    const curr = chorded[i];
    if (curr.bar - prev.bar !== 1) continue;
    const isLast = i === chorded.length - 1;
    const followedByGap = !isLast && chorded[i + 1].bar - curr.bar > 1;
    const endsFourBarPhrase = curr.bar % 4 === 0;
    if (!isLast && !followedByGap && !endsFourBarPhrase) continue;

    let type: CadenceType | null = null;
    if (DOMINANT_ROMANS.has(prev.roman) && TONIC_ROMANS.has(curr.roman)) {
      type = 'authentic';
    } else if (
      SUBDOMINANT_ROMANS.has(prev.roman) &&
      TONIC_ROMANS.has(curr.roman)
    ) {
      type = 'plagal';
    } else if (
      DOMINANT_ROMANS.has(prev.roman) &&
      SUBMEDIANT_ROMANS.has(curr.roman)
    ) {
      type = 'deceptive';
    } else if (
      HALF_CADENCE_ORIGINS.has(prev.roman) &&
      DOMINANT_ROMANS.has(curr.roman)
    ) {
      type = 'half';
    }

    if (type) {
      cadences.push({
        type,
        fromBar: prev.bar,
        toBar: curr.bar,
        fromChord: prev.chord,
        toChord: curr.chord,
        fromRoman: prev.roman,
        toRoman: curr.roman,
      });
      if (cadences.length >= MAX_CADENCES) break;
    }
  }
  return cadences;
}

function safeBarTicks(meta?: DraftSnapshot['meta']): number {
  const ppq = meta?.ppq ?? 480;
  const [numerator = 4, denominator = 4] = meta?.timeSignature ?? [4, 4];
  if (
    !Number.isFinite(ppq) ||
    ppq <= 0 ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator <= 0 ||
    denominator <= 0
  ) {
    return 1920;
  }
  const barTicks = Math.round((ppq * 4 * numerator) / denominator);
  return barTicks > 0 ? barTicks : 1920;
}

export function buildDescriptiveProfile(
  snapshot: DraftSnapshot,
  pitchedNotes: DraftNote[],
  tonality: Tonality | null,
  pitchedTrackCount: number,
  percussionTrackCount: number,
): DescriptiveProfile {
  const allNotes = snapshot.notes ?? [];
  const barTicks = safeBarTicks(snapshot.meta);
  const tempo =
    typeof snapshot.meta?.tempo === 'number' &&
    Number.isFinite(snapshot.meta.tempo)
      ? Math.round(snapshot.meta.tempo)
      : 120;
  const rawTs = snapshot.meta?.timeSignature;
  const timeSignature: [number, number] =
    Array.isArray(rawTs) &&
    rawTs.length === 2 &&
    Number.isFinite(rawTs[0]) &&
    Number.isFinite(rawTs[1]) &&
    rawTs[0] > 0 &&
    rawTs[1] > 0
      ? [rawTs[0], rawTs[1]]
      : [4, 4];

  if (allNotes.length === 0) {
    return {
      tempo,
      timeSignature,
      totalBars: 0,
      totalNotes: 0,
      pitchedTrackCount,
      percussionTrackCount,
      pitchRange: null,
      averageNotesPerBar: 0,
      densestBar: null,
      velocity: null,
      scaleFit: null,
    };
  }

  let maxEndTick = 0;
  let velMin = 127;
  let velMax = 0;
  let velSum = 0;
  const barCounts = new Map<number, number>();
  for (const note of allNotes) {
    const start = Math.max(0, note.start);
    const dur = Math.max(1, note.duration);
    maxEndTick = Math.max(maxEndTick, start + dur);
    const bar = Math.floor(start / barTicks) + 1;
    barCounts.set(bar, (barCounts.get(bar) ?? 0) + 1);
    const vel = Math.max(0, Math.min(127, Math.round(note.velocity ?? 100)));
    if (vel < velMin) velMin = vel;
    if (vel > velMax) velMax = vel;
    velSum += vel;
  }

  const totalBars = Math.max(1, Math.ceil(maxEndTick / barTicks));
  let densestBar: { bar: number; noteCount: number } | null = null;
  for (const [bar, noteCount] of barCounts.entries()) {
    if (
      !densestBar ||
      noteCount > densestBar.noteCount ||
      (noteCount === densestBar.noteCount && bar < densestBar.bar)
    ) {
      densestBar = { bar, noteCount };
    }
  }

  let pitchRange: DescriptiveProfile['pitchRange'] = null;
  let scaleFit: DescriptiveProfile['scaleFit'] = null;
  if (pitchedNotes.length > 0) {
    let lowestMidi = 127;
    let highestMidi = 0;
    for (const note of pitchedNotes) {
      const p = Math.max(0, Math.min(127, Math.round(note.pitch)));
      if (p < lowestMidi) lowestMidi = p;
      if (p > highestMidi) highestMidi = p;
    }
    pitchRange = {
      lowest: midiPitchToSpn(lowestMidi),
      highest: midiPitchToSpn(highestMidi),
      lowestMidi,
      highestMidi,
    };

    if (tonality) {
      const tonicIdx = PITCH_NAMES.indexOf(tonality.tonic);
      const scaleOffsets =
        tonality.mode === 'major' ? MAJOR_SCALE_OFFSETS : MINOR_SCALE_OFFSETS;
      if (tonicIdx >= 0) {
        let inScale = 0;
        let outScale = 0;
        const accidentals = new Set<string>();
        for (const note of pitchedNotes) {
          const pc = mod12(note.pitch);
          const rel = mod12(pc - tonicIdx);
          if (scaleOffsets.has(rel)) {
            inScale += 1;
          } else {
            outScale += 1;
            accidentals.add(PITCH_NAMES[pc]);
          }
        }
        scaleFit = {
          inScalePercent: Math.round((inScale / pitchedNotes.length) * 100),
          outOfScaleCount: outScale,
          accidentalPitchClasses: [...accidentals].sort(
            (a, b) => PITCH_NAMES.indexOf(a) - PITCH_NAMES.indexOf(b),
          ),
        };
      }
    }
  }

  return {
    tempo,
    timeSignature,
    totalBars,
    totalNotes: allNotes.length,
    pitchedTrackCount,
    percussionTrackCount,
    pitchRange,
    averageNotesPerBar: Math.round((allNotes.length / totalBars) * 10) / 10,
    densestBar,
    velocity: {
      min: velMin,
      max: velMax,
      average: Math.round(velSum / allNotes.length),
    },
    scaleFit,
  };
}

function cleanTrackLabel(tracks: DraftTrack[], trackId: string): string {
  const found = tracks.find((t) => t.id === trackId)?.name?.trim();
  return found && found.length > 0 ? found.slice(0, 40) : 'Track';
}

export function detectMidiIntegrity(
  snapshot: DraftSnapshot,
  maxNotes = MAX_NOTES_FOR_THEORY,
): MidiIntegrityReport {
  const allNotes = snapshot.notes ?? [];
  const tracks = snapshot.tracks ?? [];
  if (allNotes.length === 0) {
    return {
      duplicateCount: 0,
      overlapCount: 0,
      duplicateSamples: [],
      overlapSamples: [],
    };
  }

  const barTicks = safeBarTicks(snapshot.meta);
  const capped = allNotes.slice(0, maxNotes);
  const byTrackPitch = new Map<string, DraftNote[]>();
  for (const note of capped) {
    const key = `${note.trackId}:${note.pitch}`;
    const list = byTrackPitch.get(key);
    if (list) list.push(note);
    else byTrackPitch.set(key, [note]);
  }

  let duplicateCount = 0;
  let overlapCount = 0;
  const duplicateSamples: MidiIntegritySample[] = [];
  const overlapSamples: MidiIntegritySample[] = [];
  const trackNameCache = new Map<string, string>();
  const getTrackName = (trackId: string) => {
    let label = trackNameCache.get(trackId);
    if (!label) {
      label = cleanTrackLabel(tracks, trackId);
      trackNameCache.set(trackId, label);
    }
    return label;
  };

  for (const group of byTrackPitch.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.start - b.start || a.duration - b.duration);
    const deduped: DraftNote[] = [];
    for (const note of group) {
      const prev = deduped[deduped.length - 1];
      if (prev && prev.start === note.start) {
        duplicateCount += 1;
        if (duplicateSamples.length < MAX_INTEGRITY_SAMPLES) {
          duplicateSamples.push({
            bar: Math.floor(Math.max(0, note.start) / barTicks) + 1,
            trackName: getTrackName(note.trackId),
            pitchName: midiPitchToSpn(note.pitch),
          });
        }
        // Keep the longer note at this start tick so overlap checks remain accurate.
        if (note.duration > prev.duration) {
          deduped[deduped.length - 1] = note;
        }
      } else {
        deduped.push(note);
      }
    }

    let prevEnd = -1;
    for (const note of deduped) {
      const start = Math.max(0, note.start);
      const end = start + Math.max(1, note.duration);
      if (prevEnd > start) {
        overlapCount += 1;
        if (overlapSamples.length < MAX_INTEGRITY_SAMPLES) {
          overlapSamples.push({
            bar: Math.floor(start / barTicks) + 1,
            trackName: getTrackName(note.trackId),
            pitchName: midiPitchToSpn(note.pitch),
          });
        }
      }
      if (end > prevEnd) prevEnd = end;
    }
  }

  return {
    duplicateCount,
    overlapCount,
    duplicateSamples,
    overlapSamples,
  };
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
  const percussionTrackCount = percussionTracks.size;
  const pitchedTrackCount = Math.max(0, tracks.length - percussionTrackCount);

  const truncated =
    allNotes.length > MAX_NOTES_FOR_THEORY ||
    tracks.length > MAX_TRACKS_FOR_THEORY;

  const { primary: tonality, alternative: alternativeTonality } =
    detectTonalityCandidates(notes);
  const profile = buildDescriptiveProfile(
    snapshot,
    notes,
    tonality,
    pitchedTrackCount,
    percussionTrackCount,
  );
  const integrity = detectMidiIntegrity(snapshot);

  if (truncated) {
    return {
      tonality,
      alternativeTonality,
      chords: [],
      cadences: [],
      profile,
      integrity,
      truncated: true,
    };
  }

  const ppq = snapshot.meta?.ppq ?? 480;
  const timeSignature = snapshot.meta?.timeSignature ?? [4, 4];
  const chords = detectBarChords(
    notes,
    ppq,
    timeSignature,
    MAX_BARS_FOR_CHORDS,
    tonality,
  );
  const cadences = detectCadences(chords);
  const [numerator, denominator] = timeSignature;
  const barTicks = (ppq * 4 * numerator) / denominator;
  const cutOff =
    barTicks > 0 &&
    notes.some(
      (note) => note.start + note.duration > barTicks * MAX_BARS_FOR_CHORDS,
    );
  return {
    tonality,
    alternativeTonality,
    chords,
    cadences,
    profile,
    integrity,
    truncated: cutOff,
  };
}
