/**
 * tone-synth-engine.ts
 * UC-37/UC-38: Shared Tone.js note-scheduling logic for both live playback
 * (midi-editor.tsx) and offline audio export (audio-exporter.ts).
 *
 * Report 3 (SRS) §4.1/§4.2 specifies "Web Audio API / Tone.js" for in-browser
 * MIDI synthesis, and playback timing "governed by the Web Audio API's
 * scheduler via Tone.js" — the previous engine used bare Web Audio
 * OscillatorNodes and never actually depended on Tone.js. This module is the
 * real Tone.js engine: one Tone.PolySynth per track (oscillator type from
 * the existing getOscillatorType mapping, so instrument choice still means
 * the same thing it did before), panned via Tone.Panner, feeding into a
 * caller-supplied bus. A single bare oscillator can't play more than one
 * note per track at once; PolySynth can, which also matters for the dense,
 * overlapping passages that were clipping before (see the master
 * Gain→Limiter chain built in midi-editor.tsx / audio-exporter.ts).
 */
import * as Tone from "tone";
import type { DraftNote, DraftTrack } from "@stave/shared-types";
import { getOscillatorType } from "./instrument-waveform";

export function noteToFrequency(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

/** One synth voice + its filter/panner, created per track and disposed together. */
export interface TrackVoice {
  synth: Tone.PolySynth;
  filter: Tone.Filter;
  panner: Tone.Panner;
}

export function createTrackVoice(track: DraftTrack, destination: Tone.ToneAudioNode): TrackVoice {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: getOscillatorType(track.instrument) },
    envelope: { attack: 0.005, decay: 0.05, sustain: 0.6, release: 0.05 },
  });
  // Gentle low-pass — square/sawtooth oscillators are harmonic-rich enough
  // to sound harsh/buzzy on their own; rolling off the top end softens that
  // without noticeably darkening the sine/triangle voices.
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

export interface ScheduleNotesParams {
  notes: DraftNote[];
  tracks: DraftTrack[];
  ppq: number;
  bpm: number;
  /** Time (seconds, in the same clock as `destination`'s context) at which `fromTick` plays. */
  startTime: number;
  /** Tick playback starts from — notes before this are skipped. */
  fromTick: number;
  /** Tick playback stops at (loop/export range end), or null to play to the last note. */
  toTick: number | null;
  destination: Tone.ToneAudioNode;
}

/**
 * Schedules every audible note (respecting mute/solo, same rule as before)
 * onto fresh per-track PolySynths. Returns the created voices so the caller
 * can dispose them (live playback disposes on Stop/next Play; export lets
 * Tone.Offline's callback scope handle it).
 */
export function scheduleNotes(params: ScheduleNotesParams): TrackVoice[] {
  const { notes, tracks, ppq, bpm, startTime, fromTick, toTick, destination } = params;
  const secPerTick = 60 / (bpm * ppq);
  const hasSolo = tracks.some((t) => t.solo);
  const voiceByTrack = new Map<string, TrackVoice>();
  const voices: TrackVoice[] = [];

  function voiceFor(track: DraftTrack): TrackVoice {
    let v = voiceByTrack.get(track.id);
    if (!v) {
      v = createTrackVoice(track, destination);
      voiceByTrack.set(track.id, v);
      voices.push(v);
    }
    return v;
  }

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

    const voice = voiceFor(track);
    const freq = noteToFrequency(n.pitch);
    const velocity = Math.min(1, Math.max(0, (n.velocity / 127) * (track.volume ?? 1)));
    const durSec = n.duration * secPerTick;
    const time = startTime + (n.start - fromTick) * secPerTick;
    voice.synth.triggerAttackRelease(freq, durSec, time, velocity);
  }

  return voices;
}
