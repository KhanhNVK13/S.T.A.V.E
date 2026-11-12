/**
 * soundfont-synth.test.ts — Report 5, sound engine (UC-37 playback / UC-38 export).
 *   FE-LIB-18 getInstrumentSamplerOptions      FE-LIB-19 getOscillatorType (bổ sung)
 *   FE-LIB-24 loadSampleBuffer                  FE-LIB-25..29 SoundFontKitVoice
 *   FE-LIB-30..35 tone-synth-engine
 * Owner: Haidnde180202.
 *
 * jsdom has no Web Audio: "tone" is replaced by test-helpers/fake-tone, `fetch`
 * is stubbed per test. Modules that keep module-level caches
 * (sample-buffer-cache, soundfont-kit) are re-imported after vi.resetModules()
 * so every test starts from an empty cache.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DraftNote, DraftTrack } from "@stave/shared-types";
import { getInstrumentSamplerOptions } from "./instrument-samples";
import { getOscillatorType } from "./instrument-waveform";

vi.mock("tone", () => import("./test-helpers/fake-tone"));

type FakeTone = typeof import("./test-helpers/fake-tone");
type AnyNode = InstanceType<FakeTone["FakeNode"]> & Record<string, any>;

function track(id: string, extra: Partial<DraftTrack> = {}): DraftTrack {
  return { id, name: id, order: 0, color: "#fff", muted: false, solo: false, volume: 1, pan: 0, instrument: null, ...extra };
}
function note(id: string, extra: Partial<DraftNote> = {}): DraftNote {
  return { id, trackId: "t1", pitch: 60, start: 0, duration: 480, velocity: 100, ...extra };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const tcToSec = (tc: number) => (tc <= -12000 ? 0.001 : Math.pow(2, tc / 1200));
const TAU_PER_SEC = 1 / Math.log(Math.pow(10, 960 / 200));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-18 getInstrumentSamplerOptions", () => {
  it("FE-LIB-18 UTCID01 (N): Acoustic Grand Piano → self-hosted folder + per-note mp3 file names", () => {
    const o = getInstrumentSamplerOptions("Acoustic Grand Piano")!;
    expect(o.baseUrl).toBe("/instruments/acoustic_grand_piano/");
    expect(o.urls.C4).toBe("C4.mp3");
    expect(o.urls.Bb3).toBe("Bb3.mp3");
  });

  it("FE-LIB-18 UTCID02 (N): another bundled instrument (Trumpet) → its own slug", () => {
    expect(getInstrumentSamplerOptions("Trumpet")!.baseUrl).toBe("/instruments/trumpet/");
  });

  it("FE-LIB-18 UTCID03 (B): sample set covers exactly the 88 piano keys A0..C8", () => {
    const urls = getInstrumentSamplerOptions("Flute")!.urls;
    expect(Object.keys(urls)).toHaveLength(88);
    expect(urls).toHaveProperty("A0");
    expect(urls).toHaveProperty("C8");
    expect(urls).not.toHaveProperty("C9");
  });

  it("FE-LIB-18 UTCID04 (B): null instrument (unassigned track) → null (oscillator fallback)", () => {
    expect(getInstrumentSamplerOptions(null)).toBeNull();
  });

  it("FE-LIB-18 UTCID05 (B): empty string → null", () => {
    expect(getInstrumentSamplerOptions("")).toBeNull();
  });

  it("FE-LIB-18 UTCID06 (A): valid GM instrument without a bundled sample set (Banjo) → null, not an error", () => {
    expect(getInstrumentSamplerOptions("Banjo")).toBeNull();
  });

  it("FE-LIB-18 UTCID07 (A): drum kits are not served by this mapper → null", () => {
    expect(getInstrumentSamplerOptions("Standard Drum Kit")).toBeNull();
  });

  it("FE-LIB-18 UTCID08 (N): each call returns an independent object (no shared mutable state)", () => {
    const a = getInstrumentSamplerOptions("Oboe")!;
    a.urls.C4 = "hacked.mp3";
    expect(getInstrumentSamplerOptions("Oboe")!.urls.C4).toBe("C4.mp3");
  });
});

// ═════════════════════════════════════════════════════════════
// UTCID01..15 đã có trong instrument-waveform.test.ts (trinv317) → đánh số tiếp.
describe("FE-LIB-19 getOscillatorType (bổ sung)", () => {
  it("FE-LIB-19 UTCID16 (N): Electric Piano 1 → triangle (piano family)", () => {
    expect(getOscillatorType("Electric Piano 1")).toBe("triangle");
  });
  it("FE-LIB-19 UTCID17 (N): Rock Organ → sawtooth (organ family)", () => {
    expect(getOscillatorType("Rock Organ")).toBe("sawtooth");
  });
  it("FE-LIB-19 UTCID18 (B): empty string → default triangle", () => {
    expect(getOscillatorType("")).toBe("triangle");
  });
  it("FE-LIB-19 UTCID19 (B): matching is case-insensitive (TRUMPET → square)", () => {
    expect(getOscillatorType("TRUMPET")).toBe("square");
  });
  it("FE-LIB-19 UTCID20 (A): GM Synth Lead instrument 'Lead 1 (square)' → square (Brass/Lead family)", () => {
    expect(getOscillatorType("Lead 1 (square)")).toBe("square");
  });
  it("FE-LIB-19 UTCID21 (A): GM Synth Pad instrument 'Pad 2 (warm)' → sine (Synth pad family)", () => {
    expect(getOscillatorType("Pad 2 (warm)")).toBe("sine");
  });
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-24 loadSampleBuffer", () => {
  let fake: FakeTone;
  let loadSampleBuffer: typeof import("./sample-buffer-cache").loadSampleBuffer;
  let fetchMock: ReturnType<typeof vi.fn>;
  const ok = () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) }) as Response;

  beforeEach(async () => {
    vi.resetModules();
    fake = (await import("tone")) as unknown as FakeTone;
    fake.__state.reset();
    fake.__state.decodeAudioData = vi.fn(async () => ({ duration: 1 }) as unknown as AudioBuffer);
    ({ loadSampleBuffer } = await import("./sample-buffer-cache"));
    fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
  });

  it("FE-LIB-24 UTCID01 (N): fetches the URL and decodes it with Tone's audio context", async () => {
    const buf = await loadSampleBuffer("/instruments/flute/C4.mp3");
    expect(fetchMock).toHaveBeenCalledWith("/instruments/flute/C4.mp3");
    expect(fake.__state.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(buf).toEqual({ duration: 1 });
  });

  it("FE-LIB-24 UTCID02 (N): same URL requested twice → fetched once, same promise returned", async () => {
    const p1 = loadSampleBuffer("/a.mp3");
    const p2 = loadSampleBuffer("/a.mp3");
    expect(p1).toBe(p2);
    await p1;
    await loadSampleBuffer("/a.mp3");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("FE-LIB-24 UTCID03 (N): different URLs → fetched separately", async () => {
    await Promise.all([loadSampleBuffer("/a.mp3"), loadSampleBuffer("/b.mp3")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("FE-LIB-24 UTCID04 (B): never more than 16 fetches in flight; queued ones start as slots free", async () => {
    const gates = Array.from({ length: 18 }, () => deferred<Response>());
    let i = 0;
    fetchMock.mockImplementation(() => gates[i++].promise);
    const all = Array.from({ length: 18 }, (_, k) => loadSampleBuffer(`/q${k}.mp3`));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(16);
    gates[0].resolve(ok());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(17);
    gates.slice(1).forEach((g) => g.resolve(ok()));
    await Promise.all(all);
    expect(fetchMock).toHaveBeenCalledTimes(18);
  });

  it("FE-LIB-24 UTCID05 (A): HTTP 404 → rejects with a descriptive error", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    await expect(loadSampleBuffer("/missing.mp3")).rejects.toThrow("Failed to fetch /missing.mp3: HTTP 404");
  });

  it("FE-LIB-24 UTCID06 (A): undecodable data → rejects with the decode error", async () => {
    fake.__state.decodeAudioData = vi.fn(async () => {
      throw new Error("EncodingError");
    });
    await expect(loadSampleBuffer("/bad.mp3")).rejects.toThrow("EncodingError");
  });

  it("FE-LIB-24 UTCID07 (A): a failed request frees its slot — the queue keeps draining", async () => {
    fetchMock.mockRejectedValue(new TypeError("net::ERR_INSUFFICIENT_RESOURCES"));
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, k) => loadSampleBuffer(`/f${k}.mp3`)));
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(8);
    fetchMock.mockImplementation(async () => ok());
    await expect(loadSampleBuffer("/after.mp3")).resolves.toBeDefined();
  });

  it("FE-LIB-24 UTCID08 (A): after a transient failure, the next request for the same URL retries (failure not cached)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("net::ERR_INSUFFICIENT_RESOURCES"));
    await expect(loadSampleBuffer("/flaky.mp3")).rejects.toThrow();
    await expect(loadSampleBuffer("/flaky.mp3")).resolves.toEqual({ duration: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ═════════════════════════════════════════════════════════════
// SoundFontKitVoice (FE-LIB-25..29)
// ═════════════════════════════════════════════════════════════
type Zone = Record<string, any>;
function zone(extra: Zone = {}): Zone {
  return {
    keyLo: 0, keyHi: 127, velLo: 0, velHi: 127, file: "kick.ogg",
    root: 60, tune: 0, scaleTuning: 100, attenuation: 0, pan: 0, startOffset: 0, sampleRate: 44100,
    volEnv: [-12000, -12000, -12000, -12000, 0, -12000],
    keyToVolEnvHold: 0, keyToVolEnvDecay: 0,
    filterFc: 13500, filterQ: 0, modEnvToFilterFc: 0,
    modEnv: [-12000, -12000, -12000, -12000, 0, -12000],
    exclusiveClass: 0,
    ...extra,
  };
}

function setupKit() {
  const ctx = {
    fake: null as unknown as FakeTone,
    Kit: null as unknown as typeof import("./soundfont-kit").SoundFontKitVoice,
    loadSample: vi.fn(async (url: string) => ({ duration: 2, url }) as unknown as AudioBuffer),
    fetchMock: vi.fn(),
    kits: {} as Record<string, Zone[]>,
  };
  beforeEach(async () => {
    vi.resetModules();
    ctx.fake = (await import("tone")) as unknown as FakeTone;
    ctx.fake.__state.reset();
    ctx.loadSample.mockReset();
    ctx.loadSample.mockImplementation(async (url: string) => ({ duration: 2, url }) as unknown as AudioBuffer);
    vi.doMock("./sample-buffer-cache", () => ({ loadSampleBuffer: ctx.loadSample }));
    ctx.kits = { "Standard Drum Kit": [zone()] };
    ctx.fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ source: "test", kits: ctx.kits }) }));
    vi.stubGlobal("fetch", ctx.fetchMock);
    ({ SoundFontKitVoice: ctx.Kit } = await import("./soundfont-kit"));
  });
  afterEach(() => {
    vi.doUnmock("./sample-buffer-cache");
  });
  return ctx;
}

async function readyKit(ctx: ReturnType<typeof setupKit>, zones: Zone[], name = "Standard Drum Kit") {
  ctx.kits = { [name]: zones };
  const out = new ctx.fake.Gain(1);
  const kit = new ctx.Kit(name, out as never);
  await kit.ready;
  ctx.fake.__state.created = [];
  return { kit, out };
}

describe("FE-LIB-25 SoundFontKitVoice.constructor", () => {
  const ctx = setupKit();

  it("FE-LIB-25 UTCID01 (N): loads kits.json then every sample file of the kit; ready resolves", async () => {
    ctx.kits = { "Standard Drum Kit": [zone({ file: "kick.ogg" }), zone({ file: "snare.ogg" })] };
    const kit = new ctx.Kit("Standard Drum Kit", {} as never);
    await expect(kit.ready).resolves.toBeUndefined();
    expect(ctx.fetchMock).toHaveBeenCalledWith("/instruments/generaluser_drums/kits.json");
    expect(ctx.loadSample.mock.calls.map((c) => c[0])).toEqual([
      "/instruments/generaluser_drums/kick.ogg",
      "/instruments/generaluser_drums/snare.ogg",
    ]);
  });

  it("FE-LIB-25 UTCID02 (B): a file shared by several zones is loaded only once", async () => {
    ctx.kits = { "Standard Drum Kit": [zone({ file: "hat.ogg", velHi: 63 }), zone({ file: "hat.ogg", velLo: 64 })] };
    await new ctx.Kit("Standard Drum Kit", {} as never).ready;
    expect(ctx.loadSample).toHaveBeenCalledTimes(1);
  });

  it("FE-LIB-25 UTCID03 (B): two voices share one kits.json request", async () => {
    await Promise.all([new ctx.Kit("Standard Drum Kit", {} as never).ready, new ctx.Kit("Standard Drum Kit", {} as never).ready]);
    expect(ctx.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("FE-LIB-25 UTCID04 (A): unknown kit name → no zones, no sample request, ready still resolves", async () => {
    await expect(new ctx.Kit("Room Kit", {} as never).ready).resolves.toBeUndefined();
    expect(ctx.loadSample).not.toHaveBeenCalled();
  });

  it("FE-LIB-25 UTCID05 (A): kits.json HTTP 500 → ready resolves (warns); next voice retries the table", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    ctx.fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(new ctx.Kit("Standard Drum Kit", {} as never).ready).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Failed to load drum kit "Standard Drum Kit":', expect.any(Error));
    await new ctx.Kit("Standard Drum Kit", {} as never).ready;
    expect(ctx.fetchMock).toHaveBeenCalledTimes(2);
    expect(ctx.loadSample).toHaveBeenCalledTimes(1);
  });

  it("FE-LIB-25 UTCID06 (A): one sample fails → others still load; ready resolves", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ctx.kits = { "Standard Drum Kit": [zone({ file: "bad.ogg", keyHi: 40 }), zone({ file: "good.ogg", keyLo: 41 })] };
    ctx.loadSample.mockImplementation(async (url: string) => {
      if (url.endsWith("bad.ogg")) throw new Error("404");
      return { duration: 2, url } as unknown as AudioBuffer;
    });
    const out = new ctx.fake.Gain(1);
    const kit = new ctx.Kit("Standard Drum Kit", out as never);
    await kit.ready;
    kit.trigger(36, 100, 1, 0, 0.5); // zone with failed sample → silent
    kit.trigger(50, 100, 1, 0, 0.5); // good zone → plays
    expect(ctx.fake.__state.of("ToneBufferSource")).toHaveLength(1);
  });
});

describe("FE-LIB-26 SoundFontKitVoice.trigger", () => {
  const ctx = setupKit();
  const sources = () => ctx.fake.__state.of<AnyNode>("ToneBufferSource");

  it("FE-LIB-26 UTCID01 (N): pitch/velocity inside a zone → one sample source started at `time`", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    kit.trigger(36, 100, 1, 1.5, 0.25);
    expect(sources()).toHaveLength(1);
    expect(sources()[0].start).toHaveBeenCalledWith(1.5, 0);
  });

  it("FE-LIB-26 UTCID02 (B): MIDI velocity 0 (note-off) → nothing plays", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    kit.trigger(36, 0, 1, 0, 0.25);
    expect(sources()).toHaveLength(0);
  });

  it("FE-LIB-26 UTCID03 (B): key range bounds — keyLo/keyHi inclusive, outside ignored", async () => {
    const { kit } = await readyKit(ctx, [zone({ keyLo: 36, keyHi: 38 })]);
    [35, 36, 38, 39].forEach((p) => kit.trigger(p, 100, 1, 0, 0.1));
    expect(sources()).toHaveLength(2);
  });

  it("FE-LIB-26 UTCID04 (N): velocity layers — only the zone whose velocity range matches plays", async () => {
    const { kit } = await readyKit(ctx, [zone({ file: "soft.ogg", velHi: 63 }), zone({ file: "hard.ogg", velLo: 64 })]);
    kit.trigger(36, 64, 1, 0, 0.1);
    expect(sources()).toHaveLength(1);
    expect((sources()[0].args[0] as any).url.url).toContain("hard.ogg");
  });

  it("FE-LIB-26 UTCID05 (N): gain follows SF2 concave curve (velocity/127)² × track volume", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    kit.trigger(60, 64, 0.5, 0, 0.1);
    const env = ctx.fake.__state.of<AnyNode>("Gain")[0];
    const peak = env.gain.calls.find((c: unknown[]) => c[0] === "linearRampToValueAtTime")![1];
    expect(peak).toBeCloseTo(Math.pow(64 / 127, 2) * 0.5, 10);
  });

  it("FE-LIB-26 UTCID06 (N): exclusive class — a later hit chokes the earlier one of the same class", async () => {
    const { kit } = await readyKit(ctx, [zone({ exclusiveClass: 1 })]);
    kit.trigger(42, 100, 1, 0, 1);
    const firstEnv = ctx.fake.__state.of<AnyNode>("Gain")[0];
    kit.trigger(42, 100, 1, 0.5, 1);
    expect(firstEnv.gain.calls).toContainEqual(["cancelAndHoldAtTime", 0.5]);
    expect(firstEnv.gain.calls).toContainEqual(["setTargetAtTime", 0, 0.5, tcToSec(-2320) * TAU_PER_SEC]);
  });

  it("FE-LIB-26 UTCID07 (B): hit at the same time is not choked; different class is not choked", async () => {
    const { kit } = await readyKit(ctx, [zone({ exclusiveClass: 1, keyHi: 50 }), zone({ exclusiveClass: 2, keyLo: 51 })]);
    kit.trigger(42, 100, 1, 0.5, 1);
    const env = ctx.fake.__state.of<AnyNode>("Gain")[0];
    const before = env.gain.calls.length;
    kit.trigger(42, 100, 1, 0.5, 1); // same time
    kit.trigger(60, 100, 1, 0.9, 1); // other class
    expect(env.gain.calls.length).toBe(before);
  });

  it("FE-LIB-26 UTCID08 (A): after dispose() nothing plays and active hits are disposed", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    kit.trigger(36, 100, 1, 0, 1);
    const nodes = ctx.fake.__state.created.slice();
    kit.dispose();
    expect(nodes.every((n) => n.disposed)).toBe(true);
    kit.trigger(36, 100, 1, 1, 1);
    expect(sources()).toHaveLength(1);
  });

  it("FE-LIB-26 UTCID09 (A): trigger before samples finished loading → silent, no throw", async () => {
    ctx.kits = { "Standard Drum Kit": [zone()] };
    const kit = new ctx.Kit("Standard Drum Kit", {} as never);
    expect(() => kit.trigger(36, 100, 1, 0, 1)).not.toThrow();
    await kit.ready;
    expect(sources()).toHaveLength(0);
  });
});

describe("FE-LIB-27 SoundFontKitVoice.playZone", () => {
  const ctx = setupKit();
  const buf = (duration = 2) => ({ duration }) as unknown as AudioBuffer;
  const play = (kit: any, z: Zone, pitch = 60, gain = 1, time = 0, dur = 1, b = buf()) =>
    kit.playZone(z, b, pitch, gain, time, dur, 0);
  const only = (kind: string) => ctx.fake.__state.of<AnyNode>(kind);

  it("FE-LIB-27 UTCID01 (N): playbackRate = 2^(((pitch-root)·scaleTuning + tune)/1200)", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone({ root: 60, tune: 50 }), 62);
    expect((only("ToneBufferSource")[0].args[0] as any).playbackRate).toBeCloseTo(Math.pow(2, 250 / 1200), 12);
  });

  it("FE-LIB-27 UTCID02 (B): scaleTuning 0 (no key tracking) → rate depends only on tune", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone({ scaleTuning: 0, tune: 0 }), 90);
    expect((only("ToneBufferSource")[0].args[0] as any).playbackRate).toBe(1);
  });

  it("FE-LIB-27 UTCID03 (N): unfiltered zone → source → env(Gain) → output", async () => {
    const { kit, out } = await readyKit(ctx, [zone()]);
    play(kit, zone());
    const [src] = only("ToneBufferSource");
    const [env] = only("Gain");
    expect(src.connections).toEqual([env]);
    expect(env.connections).toEqual([out]);
    expect(only("Filter")).toHaveLength(0);
  });

  it("FE-LIB-27 UTCID04 (N): filtered zone (filterFc < 13500) → low-pass Filter between source and env, Q = filterQ/10", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone({ filterFc: 9000, filterQ: 30 }));
    const [filter] = only("Filter");
    expect(filter.args[0]).toMatchObject({ type: "lowpass", rolloff: -12, Q: 3 });
    expect(only("ToneBufferSource")[0].connections).toEqual([filter]);
    expect(filter.connections).toEqual([only("Gain")[0]]);
  });

  it("FE-LIB-27 UTCID05 (N): zone pan 250 → Panner(0.5) between env and output", async () => {
    const { kit, out } = await readyKit(ctx, [zone()]);
    play(kit, zone({ pan: 250 }));
    const [panner] = only("Panner");
    expect(panner.args[0]).toBe(0.5);
    expect(panner.connections).toEqual([out]);
  });

  it("FE-LIB-27 UTCID06 (B): pan beyond ±500 is clamped to ±1", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone({ pan: 800 }));
    play(kit, zone({ pan: -900 }));
    expect(only("Panner").map((p) => p.args[0])).toEqual([1, -1]);
  });

  it("FE-LIB-27 UTCID07 (B): zero peak gain → no audio nodes created", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone(), 60, 0);
    expect(ctx.fake.__state.created).toHaveLength(0);
  });

  it("FE-LIB-27 UTCID08 (N): sample start offset = startOffset/sampleRate; onended disposes the hit's nodes", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone({ startOffset: 22050, sampleRate: 44100 }), 60, 1, 2);
    const [src] = only("ToneBufferSource");
    expect(src.start).toHaveBeenCalledWith(2, 0.5);
    src.onended();
    expect(ctx.fake.__state.created.every((n) => n.disposed)).toBe(true);
  });

  it("FE-LIB-27 UTCID09 (B): start offset beyond the sample length is clamped to the buffer duration", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone({ startOffset: 441000, sampleRate: 44100 }), 60, 1, 0, 1, buf(2));
    expect(only("ToneBufferSource")[0].start).toHaveBeenCalledWith(0, 2);
  });
});

describe("FE-LIB-28 SoundFontKitVoice.scheduleVolume", () => {
  const ctx = setupKit();
  const run = async (z: Zone, pitch = 60, peak = 1, time = 1, noteOff = 2) => {
    const { kit } = await readyKit(ctx, [zone()]);
    const env = new ctx.fake.Gain(0);
    (kit as any).scheduleVolume(env, z, pitch, peak, time, noteOff);
    return env.gain.calls as [string, ...number[]][];
  };

  it("FE-LIB-28 UTCID01 (N): delay → linear attack → hold → decay to sustain → release at note-off", async () => {
    const calls = await run(zone({ volEnv: [-12000, -12000, -12000, 0, 480, 0] }));
    const t0 = 1.001, tPeak = 1.002, tHold = 1.003;
    expect(calls.map((c) => c[0])).toEqual([
      "setValueAtTime", "setValueAtTime", "linearRampToValueAtTime", "setValueAtTime",
      "exponentialRampToValueAtTime", "cancelAndHoldAtTime", "setTargetAtTime",
    ]);
    expect(calls[1]).toEqual(["setValueAtTime", 0, t0]);
    expect(calls[2][1]).toBe(1);
    expect(calls[2][2]).toBeCloseTo(tPeak, 9);
    expect(calls[3][2]).toBeCloseTo(tHold, 9);
    expect(calls[4][1]).toBeCloseTo(Math.pow(10, -480 / 200), 12);
    expect(calls[4][2]).toBeCloseTo(tHold + 1 * 0.5, 9); // decay 1 s × (480/960)
    expect(calls[6]).toEqual(["setTargetAtTime", 0, 2, 1 * TAU_PER_SEC]);
  });

  it("FE-LIB-28 UTCID02 (B): sustain 0 cB (full level) → no decay ramp", async () => {
    const calls = await run(zone({ volEnv: [-12000, -12000, -12000, 0, 0, 0] }));
    expect(calls.some((c) => c[0] === "exponentialRampToValueAtTime")).toBe(false);
  });

  it("FE-LIB-28 UTCID03 (B): sustain above the 960 cB floor is clamped to 960", async () => {
    const calls = await run(zone({ volEnv: [-12000, -12000, -12000, 0, 1440, 0] }));
    const ramp = calls.find((c) => c[0] === "exponentialRampToValueAtTime")!;
    expect(ramp[1]).toBeCloseTo(Math.pow(10, -960 / 200), 12);
  });

  it("FE-LIB-28 UTCID04 (N): keyToVolEnvHold lengthens the hold for notes below middle C", async () => {
    const calls = await run(zone({ volEnv: [-12000, -12000, 0, 0, 0, 0], keyToVolEnvHold: 100 }), 48);
    const hold = calls[3][2];
    expect(hold).toBeCloseTo(1.002 + Math.pow(2, 1200 / 1200), 9); // hold tc 0 + 100×12 = 1200 → 2 s
  });

  it("FE-LIB-28 UTCID05 (B): −12000 timecents (SF2 'instant') maps to 1 ms, not 0", async () => {
    const calls = await run(zone(), 60, 1, 0, 1);
    expect(calls[1]).toEqual(["setValueAtTime", 0, 0.001]);
  });

  it("FE-LIB-28 UTCID06 (A): note-off before the envelope finishes → cancelAndHold at note-off then release", async () => {
    const calls = await run(zone({ volEnv: [-12000, 1200, 1200, 0, 480, -1200] }), 60, 1, 0, 0.5);
    expect(calls.at(-2)).toEqual(["cancelAndHoldAtTime", 0.5]);
    expect(calls.at(-1)).toEqual(["setTargetAtTime", 0, 0.5, 0.5 * TAU_PER_SEC]);
  });
});

describe("FE-LIB-29 SoundFontKitVoice.scheduleFilter", () => {
  const ctx = setupKit();
  const hz = (c: number, nyq = 22050) => Math.max(20, Math.min(20000, nyq - 100, 8.176 * Math.pow(2, c / 1200)));
  const run = async (z: Zone, time = 0, noteOff = 1) => {
    const { kit } = await readyKit(ctx, [zone()]);
    const filter = new ctx.fake.Filter({});
    (kit as any).scheduleFilter(filter, z, time, noteOff);
    return filter.frequency.calls as [string, ...number[]][];
  };

  it("FE-LIB-29 UTCID01 (N): no modulation → a single cutoff set at note start", async () => {
    const calls = await run(zone({ filterFc: 9000 }), 0.25);
    expect(calls).toEqual([["setValueAtTime", hz(9000), 0.25]]);
  });

  it("FE-LIB-29 UTCID02 (N): mod envelope sweeps cutoff base → base+amount → sustain → back to base after release", async () => {
    const calls = await run(zone({ filterFc: 6000, modEnvToFilterFc: 2400, modEnv: [-12000, -12000, -12000, 0, 500, 0] }));
    expect(calls.map((c) => c[0])).toEqual([
      "setValueAtTime", "setValueAtTime", "exponentialRampToValueAtTime", "setValueAtTime",
      "exponentialRampToValueAtTime", "cancelAndHoldAtTime", "exponentialRampToValueAtTime",
    ]);
    expect(calls[2][1]).toBeCloseTo(hz(8400), 6);
    expect(calls[4][1]).toBeCloseTo(hz(6000 + 2400 * 0.5), 6);
    expect(calls[6]).toEqual(["exponentialRampToValueAtTime", hz(6000), 2]);
  });

  it("FE-LIB-29 UTCID03 (B): cutoff never exceeds Nyquist − 100 Hz (22.05 kHz context → 10 925 Hz)", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    ctx.fake.__state.sampleRate = 22050;
    const filter = new ctx.fake.Filter({});
    (kit as any).scheduleFilter(filter, zone({ filterFc: 13000 }), 0, 1);
    expect(filter.frequency.calls[0][1]).toBe(10925);
  });

  it("FE-LIB-29 UTCID04 (B): very low cutoff is floored at 20 Hz", async () => {
    const calls = await run(zone({ filterFc: 0 }));
    expect(calls[0][1]).toBe(20);
  });

  it("FE-LIB-29 UTCID05 (B): sustain 1000‰ → sustain level 0 (decays back to base cutoff)", async () => {
    const calls = await run(zone({ filterFc: 6000, modEnvToFilterFc: 2400, modEnv: [-12000, -12000, -12000, 0, 1000, 0] }));
    expect(calls[4][1]).toBeCloseTo(hz(6000), 6);
  });

  it("FE-LIB-29 UTCID06 (A): negative modulation amount sweeps cutoff downward", async () => {
    const calls = await run(zone({ filterFc: 9000, modEnvToFilterFc: -1200 }));
    expect(calls[2][1]).toBeCloseTo(hz(7800), 6);
    expect(calls[2][1]).toBeLessThan(calls[0][1]);
  });
});

// ═════════════════════════════════════════════════════════════
// tone-synth-engine (FE-LIB-30..35)
// ═════════════════════════════════════════════════════════════
function setupEngine() {
  const ctx = {
    fake: null as unknown as FakeTone,
    eng: null as unknown as typeof import("./tone-synth-engine"),
    loadSample: vi.fn(),
    kits: [] as any[],
  };
  class FakeKit {
    ready = Promise.resolve();
    trigger = vi.fn();
    dispose = vi.fn();
    constructor(public name: string, public output: unknown) {
      ctx.kits.push(this);
    }
  }
  beforeEach(async () => {
    vi.resetModules();
    ctx.fake = (await import("tone")) as unknown as FakeTone;
    ctx.fake.__state.reset();
    ctx.kits = [];
    ctx.loadSample = vi.fn(async (url: string) => ({ url }) as unknown as AudioBuffer);
    vi.doMock("./sample-buffer-cache", () => ({ loadSampleBuffer: ctx.loadSample }));
    vi.doMock("./soundfont-kit", () => ({ SoundFontKitVoice: FakeKit }));
    ctx.eng = await import("./tone-synth-engine");
  });
  afterEach(() => {
    vi.doUnmock("./sample-buffer-cache");
    vi.doUnmock("./soundfont-kit");
  });
  return ctx;
}

describe("FE-LIB-30 noteToFrequency", () => {
  const ctx = setupEngine();
  it("FE-LIB-30 UTCID01 (N): A4 (69) → 440 Hz", () => {
    expect(ctx.eng.noteToFrequency(69)).toBe(440);
  });
  it("FE-LIB-30 UTCID02 (N): middle C (60) → 261.63 Hz", () => {
    expect(ctx.eng.noteToFrequency(60)).toBeCloseTo(261.6256, 4);
  });
  it("FE-LIB-30 UTCID03 (N): one octave up / down doubles / halves (81 → 880, 57 → 220)", () => {
    expect(ctx.eng.noteToFrequency(81)).toBeCloseTo(880, 9);
    expect(ctx.eng.noteToFrequency(57)).toBeCloseTo(220, 9);
  });
  it("FE-LIB-30 UTCID04 (B): lowest MIDI pitch 0 → 8.176 Hz", () => {
    expect(ctx.eng.noteToFrequency(0)).toBeCloseTo(8.1758, 4);
  });
  it("FE-LIB-30 UTCID05 (B): highest MIDI pitch 127 → 12 543.85 Hz", () => {
    expect(ctx.eng.noteToFrequency(127)).toBeCloseTo(12543.85, 2);
  });
  it("FE-LIB-30 UTCID06 (A): non-numeric input (NaN) → NaN, no exception", () => {
    expect(ctx.eng.noteToFrequency(Number.NaN)).toBeNaN();
  });
});

describe("FE-LIB-31 createTrackVoiceWithReady (via prepareVoices)", () => {
  const ctx = setupEngine();
  const prep = async (t: DraftTrack) => {
    const dest = new ctx.fake.Gain(1);
    const voices = await ctx.eng.prepareVoices([note("n", { trackId: t.id })], [t], 0, null, dest as never, ctx.eng.createVoiceCache());
    return { voice: voices.get(t.id)! as any, dest };
  };

  it("FE-LIB-31 UTCID01 (N): unassigned instrument → oscillator PolySynth → 6 kHz low-pass → Panner → destination", async () => {
    const { voice, dest } = await prep(track("t1"));
    expect(voice.kit).toBeNull();
    expect(voice.synth.kind).toBe("PolySynth");
    expect(voice.synth.args[1]).toMatchObject({ oscillator: { type: "triangle" } });
    expect(voice.filter.args).toEqual([6000, "lowpass"]);
    expect(voice.synth.connections).toEqual([voice.filter]);
    expect(voice.filter.connections).toEqual([voice.panner]);
    expect(voice.panner.connections).toEqual([dest]);
  });

  it("FE-LIB-31 UTCID02 (N): oscillator type follows the instrument (Church Organ → sawtooth)", async () => {
    const { voice } = await prep(track("t1", { instrument: "Church Organ" }));
    expect(voice.synth.args[1].oscillator.type).toBe("sawtooth");
  });

  it("FE-LIB-31 UTCID03 (N): bundled instrument → Tone.Sampler filled with only the decoded notes the track uses", async () => {
    const { voice } = await prep(track("t1", { instrument: "Trumpet" }));
    expect(voice.synth.kind).toBe("Sampler");
    expect(ctx.loadSample).toHaveBeenCalledTimes(1);
    expect(ctx.loadSample).toHaveBeenCalledWith("/instruments/trumpet/C4.mp3");
    expect(voice.synth.added).toHaveLength(1);
  });

  it("FE-LIB-31 UTCID04 (N): drum kit instrument → SoundFontKitVoice on the panner, no synth", async () => {
    const { voice } = await prep(track("t1", { instrument: "Standard Drum Kit" }));
    expect(voice.synth).toBeNull();
    expect(voice.kit).toBe(ctx.kits[0]);
    expect(ctx.kits[0].name).toBe("Standard Drum Kit");
    expect(ctx.kits[0].output).toBe(voice.panner);
  });

  it("FE-LIB-31 UTCID05 (B): track pan −1 / +1 is applied to the Panner", async () => {
    expect((await prep(track("L", { pan: -1 }))).voice.panner.args[0]).toBe(-1);
    expect((await prep(track("R", { pan: 1 }))).voice.panner.args[0]).toBe(1);
  });

  it("FE-LIB-31 UTCID06 (A): a used note sample fails → warning, nothing is added for it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ctx.loadSample.mockImplementation(async (url: string) => {
      if (url.endsWith("/C4.mp3")) throw new Error("404");
      return { url };
    });
    const { voice } = await prep(track("t1", { instrument: "Trumpet" }));
    expect(voice.synth.added).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith("Failed to load sample /instruments/trumpet/C4.mp3:", expect.any(Error));
  });

  it("FE-LIB-31 UTCID07 (A): voice disposed while samples still loading → late buffers are not added", async () => {
    const gate = deferred<void>();
    ctx.loadSample.mockImplementation(async (url: string) => {
      await gate.promise;
      return { url };
    });
    const cache = ctx.eng.createVoiceCache();
    const t = track("t1", { instrument: "Trumpet" });
    const pending = ctx.eng.prepareVoices([note("n")], [t], 0, null, new ctx.fake.Gain(1) as never, cache);
    const sampler = cache.get("t1")!.voice.synth as any;
    ctx.eng.evictVoice(cache, "t1");
    gate.resolve();
    await pending;
    expect(sampler.added).toHaveLength(0);
  });
});

describe("FE-LIB-32 evictVoice", () => {
  const ctx = setupEngine();
  const build = async (tracks: DraftTrack[]) => {
    const cache = ctx.eng.createVoiceCache();
    await ctx.eng.prepareVoices(tracks.map((t) => note(`n-${t.id}`, { trackId: t.id })), tracks, 0, null, new ctx.fake.Gain(1) as never, cache);
    return cache;
  };

  it("FE-LIB-32 UTCID01 (N): disposes the track's synth, filter and panner and removes the entry", async () => {
    const cache = await build([track("a")]);
    const v = cache.get("a")!.voice as any;
    ctx.eng.evictVoice(cache, "a");
    expect(cache.has("a")).toBe(false);
    expect([v.synth.disposed, v.filter.disposed, v.panner.disposed]).toEqual([true, true, true]);
  });

  it("FE-LIB-32 UTCID02 (N): drum-kit voice → kit.dispose() called", async () => {
    const cache = await build([track("d", { instrument: "Standard Drum Kit" })]);
    ctx.eng.evictVoice(cache, "d");
    expect(ctx.kits[0].dispose).toHaveBeenCalledTimes(1);
  });

  it("FE-LIB-32 UTCID03 (N): other tracks' voices are untouched", async () => {
    const cache = await build([track("a"), track("b")]);
    const vb = cache.get("b")!.voice as any;
    ctx.eng.evictVoice(cache, "a");
    expect(cache.has("b")).toBe(true);
    expect(vb.synth.disposed).toBe(false);
  });

  it("FE-LIB-32 UTCID04 (A): unknown track id → no-op, no throw", async () => {
    const cache = await build([track("a")]);
    expect(() => ctx.eng.evictVoice(cache, "ghost")).not.toThrow();
    expect(cache.size).toBe(1);
  });

  it("FE-LIB-32 UTCID05 (B): empty cache → no-op", () => {
    const cache = ctx.eng.createVoiceCache();
    expect(() => ctx.eng.evictVoice(cache, "a")).not.toThrow();
    expect(cache.size).toBe(0);
  });

  it("FE-LIB-32 UTCID06 (B): evicting twice is safe (second call is a no-op)", async () => {
    const cache = await build([track("a")]);
    ctx.eng.evictVoice(cache, "a");
    expect(() => ctx.eng.evictVoice(cache, "a")).not.toThrow();
  });
});

describe("FE-LIB-33 audibleNotes (via triggerNotes)", () => {
  const ctx = setupEngine();
  /** Returns ids of notes that actually got scheduled. */
  const audible = (notes: DraftNote[], tracks: DraftTrack[], fromTick = 0, toTick: number | null = null) => {
    const played: string[] = [];
    const voiceByTrack = new Map(
      tracks.map((t) => [
        t.id,
        { synth: { triggerAttackRelease: (_f: number, _d: number, time: number) => played.push(`${t.id}@${time}`) }, kit: null } as any,
      ]),
    );
    ctx.eng.triggerNotes({ notes, tracks, ppq: 480, bpm: 120, startTime: 0, fromTick, toTick, voiceByTrack });
    return played.length;
  };

  it("FE-LIB-33 UTCID01 (N): all notes of normal tracks are audible", () => {
    expect(audible([note("a"), note("b", { start: 480 })], [track("t1")])).toBe(2);
  });

  it("FE-LIB-33 UTCID02 (N): muted track is silent", () => {
    expect(audible([note("a"), note("b", { trackId: "t2" })], [track("t1", { muted: true }), track("t2")])).toBe(1);
  });

  it("FE-LIB-33 UTCID03 (N): when any track is soloed, only soloed tracks play", () => {
    expect(audible([note("a"), note("b", { trackId: "t2" }), note("c", { trackId: "t3" })], [track("t1"), track("t2", { solo: true }), track("t3")])).toBe(1);
  });

  it("FE-LIB-33 UTCID04 (A): soloed AND muted track → mute wins (silent)", () => {
    expect(audible([note("a")], [track("t1", { solo: true, muted: true })])).toBe(0);
  });

  it("FE-LIB-33 UTCID05 (A): note whose track no longer exists is skipped", () => {
    expect(audible([note("a", { trackId: "deleted" }), note("b")], [track("t1")])).toBe(1);
  });

  it("FE-LIB-33 UTCID06 (B): fromTick — note starting exactly at fromTick plays; earlier note skipped (not truncated)", () => {
    expect(audible([note("a", { start: 479, duration: 960 }), note("b", { start: 480 })], [track("t1")], 480)).toBe(1);
  });

  it("FE-LIB-33 UTCID07 (B): toTick is exclusive; toTick null → plays to the last note", () => {
    const notes = [note("a", { start: 0 }), note("b", { start: 960 })];
    expect(audible(notes, [track("t1")], 0, 960)).toBe(1);
    expect(audible(notes, [track("t1")], 0, null)).toBe(2);
  });
});

describe("FE-LIB-34 prepareVoices", () => {
  const ctx = setupEngine();
  const dest = () => new ctx.fake.Gain(1) as never;

  it("FE-LIB-34 UTCID01 (N): one voice per audible track, stored in the cache", async () => {
    const cache = ctx.eng.createVoiceCache();
    const tracks = [track("a"), track("b")];
    const out = await ctx.eng.prepareVoices([note("1", { trackId: "a" }), note("2", { trackId: "a" }), note("3", { trackId: "b" })], tracks, 0, null, dest(), cache);
    expect([...out.keys()]).toEqual(["a", "b"]);
    expect(cache.size).toBe(2);
    expect(ctx.fake.__state.of("PolySynth")).toHaveLength(2);
  });

  it("FE-LIB-34 UTCID02 (N): cache hit with same instrument → same voice reused, only pan re-applied", async () => {
    const cache = ctx.eng.createVoiceCache();
    const first = await ctx.eng.prepareVoices([note("1")], [track("t1")], 0, null, dest(), cache);
    const before = ctx.fake.__state.created.length;
    const second = await ctx.eng.prepareVoices([note("1")], [track("t1", { pan: 0.7 })], 0, null, dest(), cache);
    expect(second.get("t1")).toBe(first.get("t1"));
    expect((second.get("t1") as any).panner.pan.value).toBe(0.7);
    expect(ctx.fake.__state.created.length).toBe(before + 1); // only the new dest Gain
  });

  it("FE-LIB-34 UTCID03 (N): instrument changed → old voice disposed and rebuilt", async () => {
    const cache = ctx.eng.createVoiceCache();
    const first = (await ctx.eng.prepareVoices([note("1")], [track("t1")], 0, null, dest(), cache)).get("t1") as any;
    const second = (await ctx.eng.prepareVoices([note("1")], [track("t1", { instrument: "Church Organ" })], 0, null, dest(), cache)).get("t1") as any;
    expect(second).not.toBe(first);
    expect(first.synth.disposed).toBe(true);
    expect(cache.get("t1")!.instrument).toBe("Church Organ");
  });

  it("FE-LIB-34 UTCID04 (B): no audible notes in range → empty map, no voice built", async () => {
    const out = await ctx.eng.prepareVoices([note("1", { start: 0 })], [track("t1")], 480, null, dest(), ctx.eng.createVoiceCache());
    expect(out.size).toBe(0);
    expect(ctx.fake.__state.of("PolySynth")).toHaveLength(0);
  });

  it("FE-LIB-34 UTCID05 (N): waits for sampled instruments to finish loading before resolving", async () => {
    const gate = deferred<void>();
    ctx.loadSample.mockImplementation(async () => {
      await gate.promise;
      return {};
    });
    let done = false;
    const p = ctx.eng.prepareVoices([note("1")], [track("t1", { instrument: "Flute" })], 0, null, dest(), ctx.eng.createVoiceCache()).then(() => (done = true));
    await flush();
    expect(done).toBe(false);
    gate.resolve();
    await p;
    expect(done).toBe(true);
  });

  it("FE-LIB-34 UTCID06 (A): overlapping call reusing a still-loading cached voice also waits for it", async () => {
    const gate = deferred<void>();
    ctx.loadSample.mockImplementation(async () => {
      await gate.promise;
      return {};
    });
    const cache = ctx.eng.createVoiceCache();
    const t = track("t1", { instrument: "Flute" });
    void ctx.eng.prepareVoices([note("1")], [t], 0, null, dest(), cache);
    let secondDone = false;
    const second = ctx.eng.prepareVoices([note("1")], [t], 0, null, dest(), cache).then(() => (secondDone = true));
    await flush();
    expect(secondDone).toBe(false);
    gate.resolve();
    await second;
    expect(secondDone).toBe(true);
  });

  it("FE-LIB-34 UTCID07 (A): every sample fails to load → still resolves (allSettled), voice returned", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ctx.loadSample.mockRejectedValue(new Error("offline"));
    const out = await ctx.eng.prepareVoices([note("1")], [track("t1", { instrument: "Flute" })], 0, null, dest(), ctx.eng.createVoiceCache());
    expect(out.has("t1")).toBe(true);
  });

  it("FE-LIB-34 UTCID08 (N): muted tracks get no voice", async () => {
    const out = await ctx.eng.prepareVoices([note("1"), note("2", { trackId: "m" })], [track("t1"), track("m", { muted: true })], 0, null, dest(), ctx.eng.createVoiceCache());
    expect([...out.keys()]).toEqual(["t1"]);
  });

  it("FE-LIB-34 UTCID09 (N): reusing a cached voice loads only the pitches that are new since last time", async () => {
    const cache = ctx.eng.createVoiceCache();
    const t = track("t1", { instrument: "Flute" });
    await ctx.eng.prepareVoices([note("1", { pitch: 60 })], [t], 0, null, dest(), cache);
    expect(ctx.loadSample).toHaveBeenCalledTimes(1);
    await ctx.eng.prepareVoices([note("1", { pitch: 60 }), note("2", { pitch: 72 })], [t], 0, null, dest(), cache);
    expect(ctx.loadSample).toHaveBeenCalledTimes(2);
    expect(ctx.loadSample).toHaveBeenLastCalledWith("/instruments/flute/C5.mp3");
  });
});

describe("FE-LIB-35 triggerNotes", () => {
  const ctx = setupEngine();
  // ppq 480, 120 BPM → 1 tick = 1/960 s
  const synthVoice = () => ({ synth: { triggerAttackRelease: vi.fn() }, kit: null, panner: new ctx.fake.Panner(0) }) as any;
  const run = (params: Partial<Parameters<typeof ctx.eng.triggerNotes>[0]> & { voice?: any }) => {
    const voice = params.voice ?? synthVoice();
    const tracks = params.tracks ?? [track("t1")];
    ctx.eng.triggerNotes({
      notes: [],
      ppq: 480,
      bpm: 120,
      startTime: 10,
      fromTick: 0,
      toTick: null,
      voiceByTrack: new Map(tracks.map((t) => [t.id, voice])),
      ...params,
      tracks,
    });
    return voice;
  };

  it("FE-LIB-35 UTCID01 (N): synth note → triggerAttackRelease(freq, durSec, startTime + offset, velocity/127)", () => {
    const v = run({ notes: [note("a", { pitch: 69, start: 480, duration: 240, velocity: 100 })] });
    expect(v.synth.triggerAttackRelease).toHaveBeenCalledWith(440, 0.25, 10.5, 100 / 127);
  });

  it("FE-LIB-35 UTCID02 (N): anchorTick fixes the time origin for chunked scheduling", () => {
    const v = run({ notes: [note("a", { start: 1920 })], fromTick: 1920, anchorTick: 960 });
    expect(v.synth.triggerAttackRelease.mock.calls[0][2]).toBeCloseTo(11, 9);
  });

  it("FE-LIB-35 UTCID03 (B): velocity × track volume is clamped to [0, 1]", () => {
    const v = run({ notes: [note("a", { velocity: 127 }), note("b", { velocity: 100, start: 1 })], tracks: [track("t1", { volume: 2 })] });
    expect(v.synth.triggerAttackRelease.mock.calls.map((c: number[]) => c[3])).toEqual([1, 1]);
    const v0 = run({ notes: [note("a")], tracks: [track("t1", { volume: 0 })] });
    expect(v0.synth.triggerAttackRelease.mock.calls[0][3]).toBe(0);
  });

  it("FE-LIB-35 UTCID04 (N): drum-kit voice → kit.trigger(pitch, midiVelocity, volume, time, durSec)", () => {
    const kitVoice = { synth: null, kit: { trigger: vi.fn() }, panner: new ctx.fake.Panner(0) };
    run({ voice: kitVoice, notes: [note("a", { pitch: 36, velocity: 90, start: 960, duration: 96 })], tracks: [track("t1", { volume: 0.8 })] });
    expect(kitVoice.kit.trigger).toHaveBeenCalledWith(36, 90, 0.8, 11, 0.1);
  });

  it("FE-LIB-35 UTCID05 (N): pitch mapped to a custom sound → sample played whole through the track panner", () => {
    const buffer = { duration: 3 } as AudioBuffer;
    const v = run({
      notes: [note("a", { pitch: 36, velocity: 127 })],
      tracks: [track("t1", { soundMap: { "36": "snd" } })],
      customBuffers: new Map([["snd", buffer]]),
    });
    const [src] = ctx.fake.__state.of<AnyNode>("ToneBufferSource");
    expect(src.args[0]).toBe(buffer);
    expect(src.connections).toEqual([v.panner]);
    expect(src.start).toHaveBeenCalledWith(10, 0, undefined, 1);
    expect(v.synth.triggerAttackRelease).not.toHaveBeenCalled();
  });

  it("FE-LIB-35 UTCID06 (A): soundMap entry whose buffer is missing → falls back to the instrument", () => {
    const v = run({ notes: [note("a", { pitch: 36 })], tracks: [track("t1", { soundMap: { "36": "gone" } })], customBuffers: new Map() });
    expect(v.synth.triggerAttackRelease).toHaveBeenCalledTimes(1);
  });

  it("FE-LIB-35 UTCID07 (A): one note throwing (unloaded sample) is skipped; later notes still scheduled", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const voice = synthVoice();
    voice.synth.triggerAttackRelease.mockImplementationOnce(() => {
      throw new Error("No available buffers for note: 60");
    });
    run({ voice, notes: [note("a"), note("b", { start: 480 }), note("c", { start: 960 })] });
    expect(voice.synth.triggerAttackRelease).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("FE-LIB-35 UTCID08 (N): notes are scheduled in chronological order regardless of input order", () => {
    const v = run({ notes: [note("c", { start: 960 }), note("a", { start: 0 }), note("b", { start: 480 })] });
    expect(v.synth.triggerAttackRelease.mock.calls.map((c: number[]) => c[2])).toEqual([10, 10.5, 11]);
  });

  it("FE-LIB-35 UTCID09 (A): track without a prepared voice → its notes are skipped silently", () => {
    const voice = synthVoice();
    ctx.eng.triggerNotes({
      notes: [note("a"), note("b", { trackId: "t2" })],
      tracks: [track("t1"), track("t2")],
      ppq: 480, bpm: 120, startTime: 0, fromTick: 0, toTick: null,
      voiceByTrack: new Map([["t1", voice]]),
    });
    expect(voice.synth.triggerAttackRelease).toHaveBeenCalledTimes(1);
  });

  it("FE-LIB-35 UTCID10 (B): empty note list → nothing scheduled", () => {
    const v = run({ notes: [] });
    expect(v.synth.triggerAttackRelease).not.toHaveBeenCalled();
  });
});
