/**
 * audio-exporter.ts
 * UC-38: Export project audio (WAV)
 *
 * Renders the entire MIDI snapshot offline via Tone.Offline, using the same
 * shared engine (`tone-synth-engine.ts`) as live playback — same
 * instrument→waveform mapping, same mute/solo/volume/pan handling, same
 * Limiter on the master bus — so the exported file sounds like what the
 * user actually heard on Play, not a separately-tuned rendering.
 *
 * WAV is encoded here; MP3 goes through `mp3-encoder.ts` (`@breezystack/lamejs`).
 */

import * as Tone from "tone";
import type { DraftSnapshot, DraftTrack } from "@stave/shared-types";
import { prepareVoices, triggerNotes, createVoiceCache } from "./tone-synth-engine";
import { encodeMp3 } from "./mp3-encoder";

export const NO_AUDIBLE_CONTENT = "NO_AUDIBLE_CONTENT";
export const EXPORT_ABORTED = "EXPORT_ABORTED";

export interface ExportRange {
  fromTick: number;
  toTick: number;
}

export const MP3_BITRATES = [128, 192, 256, 320] as const;
export const DEFAULT_MP3_KBPS = 192;
export const LONG_EXPORT_SECONDS = 600;

export function normalizeMp3Kbps(kbps: number | undefined): number {
  return (MP3_BITRATES as readonly number[]).includes(kbps ?? -1) ? (kbps as number) : DEFAULT_MP3_KBPS;
}

export function rangeFromNotes(
  notes: DraftSnapshot["notes"],
  selectedIds: ReadonlySet<string>,
): ExportRange | null {
  const picked = notes.filter((n) => selectedIds.has(n.id));
  if (picked.length === 0) return null;
  return {
    fromTick: Math.min(...picked.map((n) => n.start)),
    toTick: Math.max(...picked.map((n) => n.start + n.duration)),
  };
}

export function tickToBar(tick: number, ppq: number, beatsPerBar: number): number {
  return Math.floor(tick / (ppq * beatsPerBar)) + 1;
}

export function withMutedIncluded(snapshot: DraftSnapshot, includeMuted: boolean): DraftSnapshot {
  if (!includeMuted) return snapshot;
  return { ...snapshot, tracks: snapshot.tracks.map((t) => ({ ...t, muted: false })) };
}

export function hasAudibleNotes(snapshot: DraftSnapshot, range?: ExportRange | null): boolean {
  const anySolo = snapshot.tracks.some((t) => t.solo);
  const audible = new Set(
    snapshot.tracks.filter((t) => (anySolo ? t.solo : !t.muted)).map((t) => t.id),
  );
  return snapshot.notes.some(
    (n) =>
      audible.has(n.trackId) &&
      (!range || (n.start >= range.fromTick && n.start < range.toTick)),
  );
}

export function estimateExportSeconds(
  snapshot: DraftSnapshot,
  range?: ExportRange | null,
  longestCustomSec = 0,
): number {
  const { tempo, ppq } = snapshot.meta;
  const secPerTick = 60 / (tempo * ppq);
  const fromTick = range?.fromTick ?? 0;
  let lastEndTick = range ? range.toTick : ppq * 4 * 4;
  for (const n of snapshot.notes) {
    if (range && (n.start < range.fromTick || n.start >= range.toTick)) continue;
    lastEndTick = Math.max(lastEndTick, n.start + n.duration);
  }
  return (lastEndTick - fromTick) * secPerTick + Math.max((60 / tempo) * 4, longestCustomSec);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error(EXPORT_ABORTED);
}

export interface ExportOptions {
  /** Sample rate for the output file (default: 44100) */
  sampleRate?: number;
  /** Called with 0–1 progress values during render */
  onProgress?: (p: number) => void;
  /** Decoded custom sounds by id (see custom-sound-buffers.ts). */
  customBuffers?: Map<string, AudioBuffer>;
  /** Output format (default: wav). */
  format?: "wav" | "mp3";
  /** Render only notes starting inside this tick range. */
  range?: ExportRange | null;
  /** Render muted tracks too, at their stored volume. */
  includeMuted?: boolean;
  /** MP3 bitrate in kbps (128/192/256/320, default 192). */
  kbps?: number;
  /** Aborting discards the export (nothing is returned). */
  signal?: AbortSignal;
}

/** Synthesise and export the project audio. Returns a downloadable WAV or MP3 Blob. */
export async function exportAudio(
  snapshot: DraftSnapshot,
  options: ExportOptions = {},
): Promise<Blob> {
  const { sampleRate = 44100, onProgress, customBuffers, format = "wav", range = null, signal } = options;
  const source = withMutedIncluded(snapshot, options.includeMuted ?? false);
  const { meta, notes, tracks } = source;
  const fromTick = range?.fromTick ?? 0;
  const toTick = range ? range.toTick : null;
  const bpm = meta.tempo;
  const ppq = meta.ppq;

  if (!hasAudibleNotes(source, range)) {
    throw new Error(NO_AUDIBLE_CONTENT);
  }
  throwIfAborted(signal);

  onProgress?.(0.02);

  // ── 1. Compute total duration ──────────────────────────────
  let longestCustomSec = 0;
  for (const buffer of customBuffers?.values() ?? []) {
    longestCustomSec = Math.max(longestCustomSec, buffer.duration);
  }
  const totalSec = estimateExportSeconds(source, range, longestCustomSec);

  onProgress?.(0.1);

  // ── 2. Offline render (Tone.Offline swaps the "current" Tone context for
  // the duration of this callback, so `.toDestination()` inside it — and
  // inside prepareVoices' per-track voices — routes to the offline buffer,
  // not real speakers). The callback is async so any sampled instrument's
  // files finish loading before triggerNotes schedules anything — same
  // reasoning as startPlayback in midi-editor.tsx. ──────────────────────────────
  const rendered = await Tone.Offline(async () => {
    // Same Limiter as live playback — without it, a dense passage renders
    // exactly the same clipped/buzzing audio it would play live.
    const limiter = new Tone.Limiter(-1).toDestination();
    // Fresh cache per export — each Tone.Offline call is its own audio
    // context, so voices can't be shared with live playback or other
    // export calls anyway.
    const voiceByTrack = await prepareVoices(notes, tracks, fromTick, toTick, limiter, createVoiceCache());
    triggerNotes({
      notes,
      tracks,
      ppq,
      bpm,
      startTime: 0,
      fromTick,
      toTick,
      voiceByTrack,
      customBuffers,
    });
  }, totalSec, 2, sampleRate);

  throwIfAborted(signal);
  onProgress?.(0.7);

  // ── 3. Encode ─────────────────────────────────────────────
  if (format === "mp3") {
    const mp3 = await encodeMp3(rendered.get()!, normalizeMp3Kbps(options.kbps), (p) => onProgress?.(0.7 + p * 0.3));
    throwIfAborted(signal);
    onProgress?.(1.0);
    return mp3;
  }
  const wavBlob = audioBufferToWav(rendered.get()!);
  throwIfAborted(signal);
  onProgress?.(1.0);

  return new Blob([wavBlob], { type: "audio/wav" });
}

/**
 * UC-38 (per-track variant): render each unmuted track as its own WAV file.
 * Reuses `exportAudio`'s solo handling — `scheduleNotes` already mutes every
 * other track whenever one is soloed, so exporting "just this track" is just
 * exporting the whole snapshot with only that track's `solo` flag set,
 * rather than a second synthesis path to keep in sync.
 */
export async function exportAudioPerTrack(
  snapshot: DraftSnapshot,
  options: ExportOptions = {},
): Promise<{ track: DraftTrack; blob: Blob }[]> {
  const { onProgress, range = null, includeMuted = false } = options;
  const playableTracks = snapshot.tracks.filter(
    (t) =>
      (includeMuted || !t.muted) &&
      snapshot.notes.some(
        (n) =>
          n.trackId === t.id && (!range || (n.start >= range.fromTick && n.start < range.toTick)),
      ),
  );
  const results: { track: DraftTrack; blob: Blob }[] = [];

  for (let i = 0; i < playableTracks.length; i++) {
    const track = playableTracks[i];
    const soloSnapshot: DraftSnapshot = {
      ...snapshot,
      tracks: snapshot.tracks.map((t) => ({ ...t, solo: t.id === track.id })),
    };
    const blob = await exportAudio(soloSnapshot, {
      ...options,
      // Report overall progress across all tracks, not just the current one.
      onProgress: (p) => onProgress?.((i + p) / playableTracks.length),
    });
    results.push({ track, blob });
  }

  return results;
}

// ── WAV encoder (pure TypeScript, no deps) ──────────────────
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataByteLen = numSamples * numChannels * (bitsPerSample / 8);
  const bufferLen = 44 + dataByteLen;

  const out = new ArrayBuffer(bufferLen);
  const view = new DataView(out);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataByteLen, true);
  writeString(view, 8, "WAVE");
  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true);  // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataByteLen, true);

  // Interleave channels
  let offset = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return out;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
