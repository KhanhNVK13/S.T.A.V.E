import type { DraftNote } from "@stave/shared-types";
import { noteFramesToTime, outputToNotesPoly } from "@spotify/basic-pitch/esm/toMidi";

export const MAX_TRANSCRIBE_SEC = 45;
export const BASIC_PITCH_SAMPLE_RATE = 22050;
export const BASIC_PITCH_MODEL_URL = "/models/basic-pitch/model.json";

const MIN_PIANO_HZ = 27.5;
const MAX_PIANO_HZ = 4186.01;

export type QuantizeDivision = null | 8 | 16 | 32;

export interface RawBasicPitchFrames {
  frames: number[][];
  onsets: number[][];
  contours: number[][];
}

export interface AudioToMidiOptions {
  tempo: number;
  ppq: number;
  onsetThreshold?: number;
  frameThreshold?: number;
  minNoteLengthFrames?: number;
  minFreqHz?: number | null;
  maxFreqHz?: number | null;
  quantizeDivision?: QuantizeDivision;
}

export interface TranscribeRange {
  startSec: number;
  endSec: number;
  durationSec: number;
  wasCapped: boolean;
}

/** Computes the clamped [start, end] slice capped at `MAX_TRANSCRIBE_SEC`. */
export function computeTranscribeRange(
  totalDurationSec: number,
  trimStartSec?: number,
  trimEndSec?: number,
): TranscribeRange {
  const safeTotal = Number.isFinite(totalDurationSec) ? Math.max(0, totalDurationSec) : 0;
  const rawStart = trimStartSec ?? 0;
  const startSec = Number.isFinite(rawStart) ? Math.max(0, Math.min(safeTotal, rawStart)) : 0;
  const rawEnd = trimEndSec ?? safeTotal;
  const requestedEnd = Number.isFinite(rawEnd) ? Math.max(startSec, Math.min(safeTotal, rawEnd)) : safeTotal;
  const requestedSpan = Math.max(0, requestedEnd - startSec);
  const durationSec = Math.min(MAX_TRANSCRIBE_SEC, requestedSpan);
  return {
    startSec,
    endSec: startSec + durationSec,
    durationSec,
    wasCapped: requestedSpan > MAX_TRANSCRIBE_SEC,
  };
}

/**
 * Slices `[trimStartSec, trimEndSec]` capped at `MAX_TRANSCRIBE_SEC` seconds
 * and resamples to 22050 Hz mono for Basic Pitch.
 */
export async function resampleAudioForBasicPitch(
  buffer: AudioBuffer,
  trimStartSec?: number,
  trimEndSec?: number,
): Promise<AudioBuffer> {
  const range = computeTranscribeRange(buffer.duration, trimStartSec, trimEndSec);
  if (range.durationSec <= 0 || buffer.length <= 0) {
    throw new Error("Audio segment is empty.");
  }

  const targetSamples = Math.max(1, Math.round(range.durationSec * BASIC_PITCH_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, targetSamples, BASIC_PITCH_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0, range.startSec, range.durationSec);
  return offline.startRendering();
}

/**
 * Dynamically loads Basic Pitch on the client and runs neural inference once,
 * returning raw frame/onset/contour matrices for fast client-side post-processing.
 */
export async function runBasicPitchInference(
  mono22k: AudioBuffer,
  onProgress?: (pct: number) => void,
): Promise<RawBasicPitchFrames> {
  if (mono22k.length <= 0) {
    return { frames: [], onsets: [], contours: [] };
  }

  const { BasicPitch } = await import("@spotify/basic-pitch");
  const model = new BasicPitch(BASIC_PITCH_MODEL_URL);
  // BasicPitch starts loading the graph model in its constructor; attach a
  // no-op catch so an immediate fetch failure doesn't trigger unhandledRejection
  // before evaluateModel awaits `this.model`.
  model.model?.catch(() => {});

  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];

  await model.evaluateModel(
    mono22k,
    (frameBatch, onsetBatch, contourBatch) => {
      frames.push(...frameBatch);
      onsets.push(...onsetBatch);
      contours.push(...contourBatch);
    },
    (pct) => {
      const clamped = Number.isFinite(pct) ? Math.min(1, Math.max(0, pct)) : 0;
      onProgress?.(Math.round(clamped * 100));
    },
  );

  return { frames, onsets, contours };
}

/**
 * Decodes raw Basic Pitch frame activations into STAVE integer-tick notes
 * without re-running neural inference.
 */
export function extractMidiNotesFromFrames(
  raw: RawBasicPitchFrames,
  options: AudioToMidiOptions,
): Omit<DraftNote, "trackId">[] {
  if (
    raw.frames.length === 0 ||
    raw.onsets.length === 0 ||
    (raw.frames[0]?.length ?? 0) === 0
  ) {
    return [];
  }

  // `outputToNotesPoly` mutates `onsets` and `frames` in place when frequency
  // bounds are set, so copy rows to keep `raw` immutable across UI tweaks.
  const framesCopy = raw.frames.map((row) => row.slice());
  const onsetsCopy = raw.onsets.map((row) => row.slice());

  const onsetThreshold = options.onsetThreshold ?? 0.5;
  const frameThreshold = options.frameThreshold ?? 0.3;
  const minNoteLengthFrames = options.minNoteLengthFrames ?? 5;
  const minFreqHz =
    options.minFreqHz != null && Number.isFinite(options.minFreqHz)
      ? Math.max(MIN_PIANO_HZ, options.minFreqHz)
      : null;
  const maxFreqHz =
    options.maxFreqHz != null && Number.isFinite(options.maxFreqHz)
      ? Math.min(MAX_PIANO_HZ, options.maxFreqHz)
      : null;

  const events = outputToNotesPoly(
    framesCopy,
    onsetsCopy,
    onsetThreshold,
    frameThreshold,
    minNoteLengthFrames,
    true,
    maxFreqHz,
    minFreqHz,
    true,
  );

  const timedNotes = noteFramesToTime(events);
  const tempo = Number.isFinite(options.tempo) && options.tempo > 0 ? options.tempo : 120;
  const ppq = Number.isFinite(options.ppq) && options.ppq > 0 ? options.ppq : 480;
  const ticksPerSec = (tempo / 60) * ppq;
  const quantizeStep = options.quantizeDivision
    ? Math.max(1, Math.round((ppq * 4) / options.quantizeDivision))
    : null;

  const converted: Omit<DraftNote, "trackId">[] = [];
  const seenAtTick = new Map<string, number>();

  for (const n of timedNotes) {
    const pitch = Math.max(0, Math.min(127, Math.round(n.pitchMidi)));
    const amp = Number.isFinite(n.amplitude) ? Math.max(0, Math.min(1, n.amplitude)) : 0.8;
    const velocity = Math.max(1, Math.min(127, Math.round(amp * 127)));

    let start = Math.max(0, Math.round(n.startTimeSeconds * ticksPerSec));
    let duration = Math.max(1, Math.round(n.durationSeconds * ticksPerSec));

    if (quantizeStep !== null) {
      start = Math.max(0, Math.round(start / quantizeStep) * quantizeStep);
      duration = Math.max(1, Math.max(quantizeStep, Math.round(duration / quantizeStep) * quantizeStep));
    }

    const dedupeKey = `${pitch}:${start}`;
    const existingIdx = seenAtTick.get(dedupeKey);
    if (existingIdx !== undefined) {
      const existing = converted[existingIdx];
      existing.duration = Math.max(existing.duration, duration);
      existing.velocity = Math.max(existing.velocity, velocity);
      continue;
    }

    seenAtTick.set(dedupeKey, converted.length);
    converted.push({
      id: crypto.randomUUID(),
      pitch,
      start,
      duration,
      velocity,
    });
  }

  converted.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  return converted;
}

/** Fetches an audio URL and decodes it to an `AudioBuffer` in the browser. */
export async function fetchAndDecodeAudio(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error("AudioContext is unavailable in this browser.");
  }
  const context = new AudioCtx();
  try {
    return await context.decodeAudioData(arrayBuffer);
  } finally {
    void context.close();
  }
}
