/**
 * tone-synth-engine.ts
 * UC-37/UC-38: Shared Tone.js note-scheduling logic for both live playback
 * (midi-editor.tsx) and offline audio export (audio-exporter.ts).
 *
 * Report 3 (SRS) §4.1/§4.2 specifies "Web Audio API / Tone.js" for in-browser
 * MIDI synthesis, and playback timing "governed by the Web Audio API's
 * scheduler via Tone.js" — the previous engine used bare Web Audio
 * OscillatorNodes and never actually depended on Tone.js.
 *
 * Each track gets a real sampled instrument (Tone.Sampler, FluidR3_GM
 * samples — see instrument-samples.ts) when one is bundled for its assigned
 * instrument, or falls back to the same oscillator-based Tone.PolySynth as
 * before when it isn't (so an unrecognized/unassigned instrument still
 * plays, just without the sampled-instrument upgrade). Either way the voice
 * is panned via Tone.Panner into a caller-supplied bus.
 */
import * as Tone from "tone";
import type { DraftNote, DraftTrack } from "@stave/shared-types";
import { getOscillatorType } from "./instrument-waveform";
import { getInstrumentSamplerOptions } from "./instrument-samples";

export function noteToFrequency(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

/** One synth voice + its filter/panner, created per track and disposed together. */
export interface TrackVoice {
  synth: Tone.PolySynth | Tone.Sampler;
  filter: Tone.Filter;
  panner: Tone.Panner;
}

export function createTrackVoice(track: DraftTrack, destination: Tone.ToneAudioNode): TrackVoice {
  const sampler = getInstrumentSamplerOptions(track.instrument);
  const synth = sampler
    ? new Tone.Sampler({ urls: sampler.urls, baseUrl: sampler.baseUrl })
    : new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: getOscillatorType(track.instrument) },
        envelope: { attack: 0.005, decay: 0.05, sustain: 0.6, release: 0.05 },
      });
  // Gentle low-pass — square/sawtooth oscillators are harmonic-rich enough
  // to sound harsh/buzzy on their own; rolling off the top end softens that
  // without noticeably darkening the sine/triangle voices. Harmless on
  // sampled instruments too (FluidR3_GM samples don't have problematic top
  // end, so this filter is a no-op for them in practice).
  const filter = new Tone.Filter(6000, "lowpass");
  const panner = new Tone.Panner(track.pan ?? 0);
  synth.connect(filter);
  filter.connect(panner);
  panner.connect(destination);
  return { synth, filter, panner };
}

export function disposeTrackVoice(voice: TrackVoice) {
  voice.synth.dispose();
  voice.filter.dispose();
  voice.panner.dispose();
}

function audibleNotes(
  notes: DraftNote[],
  tracks: DraftTrack[],
  fromTick: number,
  toTick: number | null,
): { note: DraftNote; track: DraftTrack }[] {
  const hasSolo = tracks.some((t) => t.solo);
  const out: { note: DraftNote; track: DraftTrack }[] = [];
  for (const n of notes) {
    const track = tracks.find((t) => t.id === n.trackId);
    if (!track) continue;
    if (track.muted) continue;
    if (hasSolo && !track.solo) continue;
    // Notes starting before `fromTick` are skipped entirely (not truncated
    // to start mid-note) — matches the pre-Tone.js engine's behavior, since
    // there's no user-selectable loop *region* yet (UC-36 loops the whole
    // playback from its anchor point, not a sub-range).
    if (n.start < fromTick) continue;
    if (toTick !== null && n.start >= toTick) continue;
    out.push({ note: n, track });
  }
  return out;
}

/**
 * Creates (or reuses, via `voiceByTrack`) a voice for every track that will
 * actually sound, and waits for any newly-created Tone.Sampler's sample
 * files to finish loading. Call this and await it BEFORE capturing the
 * playback `startTime` — a track using a sampled instrument for the first
 * time needs its samples fetched+decoded before `triggerAttackRelease`
 * calls scheduled at/near `startTime` would actually produce sound, and if
 * `startTime` were captured first, the load delay would eat into the
 * schedule and the first several notes would fire "late"/bunched together.
 */
export async function prepareVoices(
  notes: DraftNote[],
  tracks: DraftTrack[],
  fromTick: number,
  toTick: number | null,
  destination: Tone.ToneAudioNode,
): Promise<Map<string, TrackVoice>> {
  const voiceByTrack = new Map<string, TrackVoice>();
  for (const { track } of audibleNotes(notes, tracks, fromTick, toTick)) {
    if (!voiceByTrack.has(track.id)) {
      voiceByTrack.set(track.id, createTrackVoice(track, destination));
    }
  }
  await Tone.loaded();
  return voiceByTrack;
}

export interface TriggerNotesParams {
  notes: DraftNote[];
  tracks: DraftTrack[];
  ppq: number;
  bpm: number;
  /** Time (seconds, in the same clock as the voices' context) at which `fromTick` plays. */
  startTime: number;
  /** Tick playback starts from — notes before this are skipped. */
  fromTick: number;
  /** Tick playback stops at (loop/export range end), or null to play to the last note. */
  toTick: number | null;
  voiceByTrack: Map<string, TrackVoice>;
}

/** Schedules every audible note's triggerAttackRelease using already-prepared voices (see prepareVoices). */
export function triggerNotes(params: TriggerNotesParams): void {
  const { notes, tracks, ppq, bpm, startTime, fromTick, toTick, voiceByTrack } = params;
  const secPerTick = 60 / (bpm * ppq);

  for (const { note: n, track } of audibleNotes(notes, tracks, fromTick, toTick)) {
    const voice = voiceByTrack.get(track.id);
    if (!voice) continue;
    const freq = noteToFrequency(n.pitch);
    const velocity = Math.min(1, Math.max(0, (n.velocity / 127) * (track.volume ?? 1)));
    const durSec = n.duration * secPerTick;
    const time = startTime + (n.start - fromTick) * secPerTick;
    voice.synth.triggerAttackRelease(freq, durSec, time, velocity);
  }
}
