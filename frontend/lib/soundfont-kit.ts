/**
 * soundfont-kit.ts
 * Plays the GM drum kits (Standard, Orchestra) from GeneralUser GS's own
 * samples and zone data, extracted by scripts/extract-generaluser-drums.mjs
 * into public/instruments/generaluser_drums/.
 *
 * A small subset of a SoundFont 2 voice, following spessasynth_core (the
 * engine behind SpessaSynth) where it matters: per-zone key/velocity
 * selection, root key + tuning (scaleTuning 0 = no key tracking),
 * attenuation, pan, sample start offset, volume envelope, low-pass filter
 * with its modulation envelope, SF2's default velocity curve and exclusive
 * classes (hi-hat choke). Not modelled: sample loops, LFOs, reverb/chorus.
 */
import * as Tone from "tone";
import { loadSampleBuffer } from "./sample-buffer-cache";

const BASE_URL = "/instruments/generaluser_drums/";

interface KitZone {
  keyLo: number;
  keyHi: number;
  velLo: number;
  velHi: number;
  file: string;
  root: number;
  tune: number;
  scaleTuning: number;
  attenuation: number;
  pan: number;
  startOffset: number;
  sampleRate: number;
  /** delay, attack, hold, decay (timecents), sustain (cB), release (timecents) */
  volEnv: [number, number, number, number, number, number];
  keyToVolEnvHold: number;
  keyToVolEnvDecay: number;
  filterFc: number;
  filterQ: number;
  modEnvToFilterFc: number;
  /** delay, attack, hold, decay (timecents), sustain (0.1 %), release (timecents) */
  modEnv: [number, number, number, number, number, number];
  exclusiveClass: number;
}

interface KitTable {
  source: string;
  kits: Record<string, KitZone[]>;
}

let tablePromise: Promise<KitTable> | null = null;
function loadKitTable(): Promise<KitTable> {
  if (!tablePromise) {
    tablePromise = fetch(BASE_URL + "kits.json").then((res) => {
      if (!res.ok) throw new Error(`Failed to fetch drum kit table: HTTP ${res.status}`);
      return res.json() as Promise<KitTable>;
    });
    tablePromise.catch(() => {
      tablePromise = null; // let the next Play retry
    });
  }
  return tablePromise;
}

const tcToSec = (tc: number) => (tc <= -12000 ? 0.001 : Math.pow(2, tc / 1200));
const cbToGain = (cb: number) => Math.pow(10, -cb / 200);
const absCentsToHz = (cents: number) => 8.176 * Math.pow(2, cents / 1200);
// spessasynth_core's volume-envelope floor: decays/releases are timed as a
// fall to 96 dB below peak, not the spec's 100 dB.
const SILENCE_CB = 960;
// setTargetAtTime time constant per second of envelope time that reaches the
// SILENCE_CB floor after exactly that many seconds.
const TAU_PER_SEC = 1 / Math.log(Math.pow(10, SILENCE_CB / 200));
const FILTER_OPEN_CENTS = 13500; // SF2 default initialFilterFc ≈ 20 kHz = no filtering
const EXCLUSIVE_RELEASE_SEC = tcToSec(-2320); // spessasynth_core's exclusive-class cutoff

interface ActiveHit {
  noteOnId: number;
  start: number;
  end: number;
  exclusiveClass: number;
  nodes: Tone.ToneAudioNode[];
  env: Tone.Gain;
  disposed: boolean;
}

export class SoundFontKitVoice {
  readonly ready: Promise<void>;
  private zones: KitZone[] = [];
  private readonly buffers = new Map<string, AudioBuffer>();
  private active: ActiveHit[] = [];
  private nextNoteOnId = 0;
  private disposed = false;

  constructor(
    kitName: string,
    private readonly output: Tone.ToneAudioNode,
  ) {
    this.ready = loadKitTable()
      .then(async (table) => {
        this.zones = table.kits[kitName] ?? [];
        const files = [...new Set(this.zones.map((z) => z.file))];
        await Promise.allSettled(
          files.map((file) =>
            loadSampleBuffer(BASE_URL + file)
              .then((buffer) => {
                this.buffers.set(file, buffer);
              })
              .catch((err) => console.warn(`Failed to load drum sample ${file}:`, err)),
          ),
        );
      })
      .catch((err) => console.warn(`Failed to load drum kit "${kitName}":`, err));
  }

  /** Plays one MIDI note: every zone whose key and velocity range contain it. */
  trigger(pitch: number, midiVelocity: number, trackVolume: number, time: number, durSec: number): void {
    if (this.disposed || midiVelocity <= 0) return;
    const noteOnId = this.nextNoteOnId++;
    // SF2 default modulator (velocity → attenuation, concave, 960 cB) works
    // out to a gain of (velocity / 127)².
    const velocityGain = Math.pow(midiVelocity / 127, 2) * trackVolume;
    this.active = this.active.filter((h) => !h.disposed && h.end > time);
    for (const zone of this.zones) {
      if (pitch < zone.keyLo || pitch > zone.keyHi) continue;
      if (midiVelocity < zone.velLo || midiVelocity > zone.velHi) continue;
      const buffer = this.buffers.get(zone.file);
      if (!buffer) continue;
      if (zone.exclusiveClass) this.choke(zone.exclusiveClass, time, noteOnId);
      this.playZone(zone, buffer, pitch, velocityGain, time, durSec, noteOnId);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const hit of this.active) this.disposeHit(hit);
    this.active = [];
  }

  /** Exclusive class (e.g. closed hi-hat cutting an open one): fast-release earlier hits of the same class. */
  private choke(exclusiveClass: number, time: number, noteOnId: number) {
    for (const hit of this.active) {
      if (hit.exclusiveClass !== exclusiveClass || hit.noteOnId === noteOnId || hit.start >= time) continue;
      hit.env.gain.cancelAndHoldAtTime(time);
      hit.env.gain.setTargetAtTime(0, time, EXCLUSIVE_RELEASE_SEC * TAU_PER_SEC);
    }
  }

  private playZone(
    zone: KitZone,
    buffer: AudioBuffer,
    pitch: number,
    velocityGain: number,
    time: number,
    durSec: number,
    noteOnId: number,
  ) {
    const peak = velocityGain * cbToGain(zone.attenuation);
    if (peak <= 0) return;
    const playbackRate = Math.pow(2, ((pitch - zone.root) * zone.scaleTuning + zone.tune) / 1200);
    const offset = zone.startOffset / zone.sampleRate;

    const source = new Tone.ToneBufferSource({ url: buffer, playbackRate });
    const env = new Tone.Gain(0);
    const nodes: Tone.ToneAudioNode[] = [source, env];
    const noteOff = time + durSec;

    const filtered = zone.filterFc < FILTER_OPEN_CENTS || zone.modEnvToFilterFc !== 0;
    if (filtered) {
      const filter = new Tone.Filter({ type: "lowpass", rolloff: -12, Q: zone.filterQ / 10 });
      this.scheduleFilter(filter, zone, time, noteOff);
      source.connect(filter);
      filter.connect(env);
      nodes.push(filter);
    } else {
      source.connect(env);
    }
    if (zone.pan) {
      const panner = new Tone.Panner(Math.max(-1, Math.min(1, zone.pan / 500)));
      env.connect(panner);
      panner.connect(this.output);
      nodes.push(panner);
    } else {
      env.connect(this.output);
    }

    this.scheduleVolume(env, zone, pitch, peak, time, noteOff);

    const hit: ActiveHit = {
      noteOnId,
      start: time,
      end: time + (buffer.duration - offset) / playbackRate,
      exclusiveClass: zone.exclusiveClass,
      nodes,
      env,
      disposed: false,
    };
    this.active.push(hit);
    source.onended = () => this.disposeHit(hit);
    // No source.stop(): the envelope silences the hit and the sample ends on
    // its own (a native source can only be stopped once, which exclusive
    // chokes and note-offs would otherwise both need).
    source.start(time, Math.min(offset, buffer.duration));
  }

  /** SF2 volume envelope: delay, linear attack, hold, dB-linear decay to sustain; release from note-off. */
  private scheduleVolume(env: Tone.Gain, zone: KitZone, pitch: number, peak: number, time: number, noteOff: number) {
    const [delayTc, attackTc, holdTc, decayTc, sustainCb, releaseTc] = zone.volEnv;
    const keyShift = 60 - pitch;
    const t0 = time + tcToSec(delayTc);
    const tPeak = t0 + tcToSec(attackTc);
    const tHold = tPeak + tcToSec(holdTc + zone.keyToVolEnvHold * keyShift);
    const sustain = Math.max(0, Math.min(SILENCE_CB, sustainCb));
    const g = env.gain;
    g.setValueAtTime(0, time);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(peak, tPeak);
    g.setValueAtTime(peak, tHold);
    if (sustain > 0) {
      // The decay time is for a fall all the way to silence; only the part
      // down to the sustain level is used.
      const decay = tcToSec(decayTc + zone.keyToVolEnvDecay * keyShift) * (sustain / SILENCE_CB);
      g.exponentialRampToValueAtTime(peak * cbToGain(sustain), tHold + decay);
    }
    g.cancelAndHoldAtTime(noteOff);
    g.setTargetAtTime(0, noteOff, tcToSec(releaseTc) * TAU_PER_SEC);
  }

  /** Low-pass cutoff = initialFilterFc + modEnvToFilterFc × modulation envelope. */
  private scheduleFilter(filter: Tone.Filter, zone: KitZone, time: number, noteOff: number) {
    const nyquist = Tone.getContext().sampleRate / 2;
    const hz = (cents: number) => Math.max(20, Math.min(20000, nyquist - 100, absCentsToHz(cents)));
    const f = filter.frequency;
    const base = zone.filterFc;
    const amount = zone.modEnvToFilterFc;
    f.setValueAtTime(hz(base), time);
    if (amount === 0) return;
    const [delayTc, attackTc, holdTc, decayTc, sustainPermille, releaseTc] = zone.modEnv;
    const sustainLevel = 1 - Math.max(0, Math.min(1000, sustainPermille)) / 1000;
    const t0 = time + tcToSec(delayTc);
    const tPeak = t0 + tcToSec(attackTc);
    const tHold = tPeak + tcToSec(holdTc);
    f.setValueAtTime(hz(base), t0);
    f.exponentialRampToValueAtTime(hz(base + amount), tPeak);
    f.setValueAtTime(hz(base + amount), tHold);
    f.exponentialRampToValueAtTime(hz(base + amount * sustainLevel), tHold + tcToSec(decayTc) * (1 - sustainLevel));
    f.cancelAndHoldAtTime(noteOff);
    f.exponentialRampToValueAtTime(hz(base), noteOff + tcToSec(releaseTc));
  }

  private disposeHit(hit: ActiveHit) {
    if (hit.disposed) return;
    hit.disposed = true;
    for (const node of hit.nodes) node.dispose();
  }
}
