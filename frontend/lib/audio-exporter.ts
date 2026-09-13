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
 * Only WAV is implemented. A real MP3 encoder needs a WASM/JS dependency
 * (e.g. lamejs) that hasn't been added to the project yet — rather than
 * silently relabeling a WAV file as .mp3, MP3 is simply not offered until
 * that dependency decision is made (see CLAUDE.md §4.7 on placeholders).
 */

import * as Tone from "tone";
import type { DraftSnapshot, DraftTrack } from "@stave/shared-types";
import { scheduleNotes } from "./tone-synth-engine";

export interface ExportOptions {
  /** Sample rate for the output file (default: 44100) */
  sampleRate?: number;
  /** Called with 0–1 progress values during render */
  onProgress?: (p: number) => void;
}

/** Synthesise and export the project audio. Returns a downloadable WAV Blob. */
export async function exportAudio(
  snapshot: DraftSnapshot,
  options: ExportOptions = {},
): Promise<Blob> {
  const { sampleRate = 44100, onProgress } = options;
  const { meta, notes, tracks } = snapshot;
  const bpm = meta.tempo;
  const ppq = meta.ppq;
  const secPerTick = 60 / (bpm * ppq);

  onProgress?.(0.02);

  // ── 1. Compute total duration ──────────────────────────────
  let lastEndTick = ppq * 4 * 4; // minimum 4 bars
  for (const n of notes) {
    const end = n.start + n.duration;
    if (end > lastEndTick) lastEndTick = end;
  }
  // Add 1 bar of silence at the end so notes don't cut abruptly
  const totalSec = lastEndTick * secPerTick + (60 / bpm) * 4;

  onProgress?.(0.1);

  // ── 2. Offline render (Tone.Offline swaps the "current" Tone context for
  // the duration of this callback, so `.toDestination()` inside it — and
  // inside scheduleNotes' per-track voices — routes to the offline buffer,
  // not real speakers) ──────────────────────────────
  const rendered = await Tone.Offline(() => {
    // Same Limiter as live playback — without it, a dense passage renders
    // exactly the same clipped/buzzing audio it would play live.
    const limiter = new Tone.Limiter(-1).toDestination();
    scheduleNotes({
      notes,
      tracks,
      ppq,
      bpm,
      startTime: 0,
      fromTick: 0,
      toTick: null,
      destination: limiter,
    });
  }, totalSec, 2, sampleRate);

  onProgress?.(0.7);

  // ── 3. Encode to WAV ──────────────────────────────────────
  const wavBlob = audioBufferToWav(rendered.get()!);
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
  const { onProgress } = options;
  const playableTracks = snapshot.tracks.filter((t) => !t.muted);
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
