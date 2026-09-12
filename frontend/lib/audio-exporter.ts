/**
 * audio-exporter.ts
 * UC-38: Export project audio (WAV)
 *
 * Uses OfflineAudioContext to render the entire MIDI snapshot into a PCM
 * audio buffer at full quality, then encodes it to WAV.
 *
 * Mirrors the exact same synthesis rules as live playback
 * (midi-editor.tsx startPlayback) — same instrument→waveform mapping
 * (getOscillatorType), same mute/solo/volume/pan handling — so the
 * exported file sounds like what the user actually heard on Play, not a
 * generic sine-wave rendering of the notes.
 *
 * Only WAV is implemented. A real MP3 encoder needs a WASM/JS dependency
 * (e.g. lamejs) that hasn't been added to the project yet — rather than
 * silently relabeling a WAV file as .mp3, MP3 is simply not offered until
 * that dependency decision is made (see CLAUDE.md §4.7 on placeholders).
 */

import type { DraftSnapshot } from "@stave/shared-types";
import { getOscillatorType } from "./instrument-waveform";

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

  // ── 2. Offline render ──────────────────────────────────────
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalSec), sampleRate);

  // Same solo rule as live playback: if any track is solo'd, only solo'd
  // tracks are audible — otherwise exporting while previewing a soloed
  // track would silently include every other unmuted track too.
  const hasSolo = tracks.some((t) => t.solo);

  // Schedule all audible notes (respecting mute + solo)
  for (const n of notes) {
    const track = tracks.find((t) => t.id === n.trackId);
    if (track?.muted) continue;
    if (hasSolo && !track?.solo) continue;

    const startSec = n.start * secPerTick;
    const durSec = n.duration * secPerTick;
    const freq = 440 * Math.pow(2, (n.pitch - 69) / 12);
    const vol = (n.velocity / 127) * (track?.volume ?? 1) * 0.3;

    const osc = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();
    const panner = offlineCtx.createStereoPanner();

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(offlineCtx.destination);

    // Same instrument → waveform mapping as live playback (getOscillatorType)
    osc.type = getOscillatorType(track?.instrument ?? null);
    osc.frequency.value = freq;
    panner.pan.value = track?.pan ?? 0;

    // ADSR-like envelope
    gain.gain.setValueAtTime(0, startSec);
    gain.gain.linearRampToValueAtTime(vol, startSec + 0.01);
    gain.gain.setValueAtTime(vol, startSec + durSec - 0.02);
    gain.gain.linearRampToValueAtTime(0, startSec + durSec);

    osc.start(startSec);
    osc.stop(startSec + durSec + 0.01);
  }

  onProgress?.(0.1);

  const rendered = await offlineCtx.startRendering();
  onProgress?.(0.7);

  // ── 3. Encode to WAV ──────────────────────────────────────
  const wavBlob = audioBufferToWav(rendered);
  onProgress?.(1.0);

  return new Blob([wavBlob], { type: "audio/wav" });
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
