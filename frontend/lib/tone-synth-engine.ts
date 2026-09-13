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
 * plays, just without the sampled-instrument upgrade). GM drum kits instead
 * play GeneralUser GS's own samples and zones (SoundFontKitVoice,
 * soundfont-kit.ts). Every voice is panned via Tone.Panner into a
 * caller-supplied bus.
 *
 * Voices are cached per playback session (see VoiceCache), keyed by track
 * id. The expensive part of building a Tone.Sampler — fetching + decoding
 * ~88 note files per instrument — is cached separately by URL in
 * sample-buffer-cache.ts, so rebuilding voices for a new session only
 * re-adds already-decoded buffers.
 */
import * as Tone from "tone";
import { isDrumKitInstrument } from "@stave/shared-types";
import type { DraftNote, DraftTrack } from "@stave/shared-types";
import { getOscillatorType } from "./instrument-waveform";
import { getInstrumentSamplerOptions } from "./instrument-samples";
import { loadSampleBuffer } from "./sample-buffer-cache";
import { SoundFontKitVoice } from "./soundfont-kit";

export function noteToFrequency(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

/** One track's voice + its filter/panner. Exactly one of `synth` / `kit` is set. */
export interface TrackVoice {
  /** Melodic instruments: sampled (Tone.Sampler) or oscillator fallback. */
  synth: Tone.PolySynth | Tone.Sampler | null;
  /** GM drum kits: GeneralUser GS samples + zone data (see soundfont-kit.ts). */
  kit: SoundFontKitVoice | null;
  filter: Tone.Filter;
  panner: Tone.Panner;
}

/**
 * Builds a track's voice and a promise that resolves once its samples (if
 * any) are loaded. Deliberately does NOT hand `urls`/`baseUrl` straight to
 * `Tone.Sampler` — that makes Sampler fetch every file immediately with no
 * concurrency limit, which is fine for one instrument's ~88 files but firing
 * that for many distinct instruments at once (a real 17-instrument project)
 * blew straight through the browser's per-origin connection limit and
 * failed a large fraction of them with net::ERR_INSUFFICIENT_RESOURCES —
 * confirmed by actually driving the app with Playwright. Instead, each
 * note's buffer goes through `loadSampleBuffer` (shared, concurrency-capped,
 * and cached by URL so multiple tracks using the same instrument don't
 * re-fetch its files either) and is added to an initially-empty Sampler via
 * `.add()` once ready.
 */
function createTrackVoiceWithReady(
  track: DraftTrack,
  destination: Tone.ToneAudioNode,
): { voice: TrackVoice; ready: Promise<void> } {
  const filter = new Tone.Filter(6000, "lowpass");
  const panner = new Tone.Panner(track.pan ?? 0);
  panner.connect(destination);

  if (isDrumKitInstrument(track.instrument)) {
    const kit = new SoundFontKitVoice(track.instrument, panner);
    return { voice: { synth: null, kit, filter, panner }, ready: kit.ready };
  }

  const sampler = getInstrumentSamplerOptions(track.instrument);
  let synth: Tone.PolySynth | Tone.Sampler;
  let ready: Promise<void>;

  if (sampler) {
    const toneSampler = new Tone.Sampler();
    synth = toneSampler;
    const loads = Object.entries(sampler.urls).map(([note, filename]) =>
      loadSampleBuffer(sampler.baseUrl + filename)
        .then((buffer) => {
          // Stop/Seek disposed this voice while its samples were still loading.
          if (toneSampler.disposed) return;
          // Note names come from instrument-samples.ts's own fixed list —
          // known-valid Tone.js note strings, just not narrowed to Tone's
          // literal union type by TS after the Object.entries() round-trip.
          toneSampler.add(note as Tone.Unit.Note, buffer);
        })
        .catch((err) => {
          // One missing/failed note sample shouldn't block the rest of this
          // instrument (or anything else) from loading and playing.
          console.warn(`Failed to load sample ${sampler.baseUrl}${filename}:`, err);
        }),
    );
    ready = Promise.allSettled(loads).then(() => undefined);
  } else {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: getOscillatorType(track.instrument) },
      envelope: { attack: 0.005, decay: 0.05, sustain: 0.6, release: 0.05 },
    });
    ready = Promise.resolve();
  }

  // Gentle low-pass — square/sawtooth oscillators are harmonic-rich enough
  // to sound harsh/buzzy on their own; rolling off the top end softens that
  // without noticeably darkening the sine/triangle voices. Harmless on
  // sampled instruments too (FluidR3_GM samples don't have problematic top
  // end, so this filter is a no-op for them in practice).
  synth.connect(filter);
  filter.connect(panner);
  return { voice: { synth, kit: null, filter, panner }, ready };
}

export function disposeTrackVoice(voice: TrackVoice) {
  voice.kit?.dispose();
  voice.synth?.dispose();
  voice.filter.dispose();
  voice.panner.dispose();
}

/**
 * Per-track voice cache for one playback session. Owned by the caller
 * (midi-editor.tsx keeps one in a ref and disposes it on every Stop/Pause/
 * Seek; audio-exporter.ts uses a fresh one per offline render since each
 * Tone.Offline call is its own audio context anyway).
 */
export type VoiceCache = Map<string, { voice: TrackVoice; instrument: string | null; ready: Promise<void> }>;

export function createVoiceCache(): VoiceCache {
  return new Map();
}

export function disposeVoiceCache(cache: VoiceCache) {
  for (const { voice } of cache.values()) disposeTrackVoice(voice);
  cache.clear();
}

/** Removes and disposes one track's cached voice (e.g. when the track itself is deleted). */
export function evictVoice(cache: VoiceCache, trackId: string) {
  const entry = cache.get(trackId);
  if (!entry) return;
  disposeTrackVoice(entry.voice);
  cache.delete(trackId);
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
 * Returns (creating or reusing from `cache`) a voice for every track that
 * will actually sound, and waits for any newly-created Tone.Sampler's
 * sample files to finish loading. Call this and await it BEFORE capturing
 * the playback `startTime` — a track using a sampled instrument for the
 * first time needs its samples fetched+decoded before `triggerAttackRelease`
 * calls scheduled at/near `startTime` would actually produce sound, and if
 * `startTime` were captured first, the load delay would eat into the
 * schedule and the first several notes would fire "late"/bunched together.
 * A track already cached with the same instrument skips the network/decode
 * cost entirely — only an instrument *change* rebuilds it — but still awaits
 * that voice's own `ready` promise (a no-op once it has actually finished
 * loading; see the comment at the cache-hit branch below for why this still
 * matters even for a "reused" voice).
 */
export async function prepareVoices(
  notes: DraftNote[],
  tracks: DraftTrack[],
  fromTick: number,
  toTick: number | null,
  destination: Tone.ToneAudioNode,
  cache: VoiceCache,
): Promise<Map<string, TrackVoice>> {
  const active = new Map<string, TrackVoice>();
  const pendingLoads: Promise<void>[] = [];

  for (const { track } of audibleNotes(notes, tracks, fromTick, toTick)) {
    if (active.has(track.id)) continue;

    const cached = cache.get(track.id);
    if (cached && cached.instrument === track.instrument) {
      // Pan can change without the instrument changing — cheap to just
      // re-apply rather than rebuilding the whole voice.
      cached.voice.panner.pan.value = track.pan ?? 0;
      active.set(track.id, cached.voice);
      // Still await this voice's own `ready` (a no-op microtask once it has
      // actually finished loading). Without this, a SECOND overlapping
      // prepareVoices() call — e.g. a real repro: Play, then Stop+Play again
      // within the same second, before a many-instrument project's first
      // Sampler has finished fetching+decoding its ~88 files — would see
      // this cache entry as "already there" and skip waiting entirely,
      // handing back a Sampler with zero buffers loaded yet. triggerAttack
      // on that then throws "No available buffers for note: N" for every
      // note on that track until the original load finally finishes in the
      // background (confirmed: this is the exact error from the real Stop/
      // Play-repeatedly repro in PROJECT_STATE.md §23).
      pendingLoads.push(cached.ready);
      continue;
    }
    if (cached) disposeTrackVoice(cached.voice); // instrument changed since last use

    const { voice, ready } = createTrackVoiceWithReady(track, destination);
    cache.set(track.id, { voice, instrument: track.instrument, ready });
    active.set(track.id, voice);
    pendingLoads.push(ready);
  }
  // Only ever waits on voices actually created just now — a track reusing
  // its cached voice contributes nothing here, so replaying/seeking within
  // an already-loaded project never re-waits on anything.
  await Promise.allSettled(pendingLoads);
  return active;
}

export interface TriggerNotesParams {
  notes: DraftNote[];
  tracks: DraftTrack[];
  ppq: number;
  bpm: number;
  /** Time (seconds, in the same clock as the voices' context) at which `anchorTick` plays. */
  startTime: number;
  /** Tick playback starts from — notes before this are skipped. */
  fromTick: number;
  /**
   * Tick that plays exactly at `startTime`. Defaults to `fromTick`. A caller
   * scheduling in chunks (live playback's lookahead scheduler) passes a
   * moving `fromTick` per chunk but must keep this fixed at the tick the
   * whole playback session started from — otherwise every chunk after the
   * first computes its note times against the wrong origin and lands them
   * in the past (they then start and release immediately: silence).
   */
  anchorTick?: number;
  /** Tick playback stops at (loop/export range end), or null to play to the last note. */
  toTick: number | null;
  voiceByTrack: Map<string, TrackVoice>;
}

/** Schedules every audible note's triggerAttackRelease using already-prepared voices (see prepareVoices). */
export function triggerNotes(params: TriggerNotesParams): void {
  const { notes, tracks, ppq, bpm, startTime, fromTick, toTick, voiceByTrack } = params;
  const anchorTick = params.anchorTick ?? fromTick;
  const secPerTick = 60 / (bpm * ppq);

  // Chronological order matters for drum-kit exclusive classes: a hit only
  // chokes hits that were scheduled before it (see SoundFontKitVoice.choke).
  const hits = audibleNotes(notes, tracks, fromTick, toTick).sort((a, b) => a.note.start - b.note.start);
  for (const { note: n, track } of hits) {
    const voice = voiceByTrack.get(track.id);
    if (!voice) continue;
    const freq = noteToFrequency(n.pitch);
    const velocity = Math.min(1, Math.max(0, (n.velocity / 127) * (track.volume ?? 1)));
    const durSec = n.duration * secPerTick;
    const time = startTime + (n.start - anchorTick) * secPerTick;
    try {
      if (voice.kit) {
        voice.kit.trigger(n.pitch, n.velocity, track.volume ?? 1, time, durSec);
      } else if (voice.synth) {
        voice.synth.triggerAttackRelease(freq, durSec, time, velocity);
      }
    } catch (err) {
      // A Tone.Sampler whose sample for this note failed to fetch/decode
      // (e.g. the browser hit its per-origin connection limit loading many
      // instruments' ~88 files at once — real, observed: firing 17
      // instruments' Samplers together can queue 1000+ requests, and
      // Chrome starts failing them with ERR_INSUFFICIENT_RESOURCES) throws
      // synchronously here instead of just being silent for that one note.
      // Left unguarded, that one bad note used to abort this entire loop —
      // every note after it in every other track never got scheduled, so
      // one flaky sample meant total silence instead of one missing note.
      console.warn("triggerAttackRelease failed for one note, skipping it:", err);
    }
  }
}
