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
  it("UTCID01 (A): null instrument (unassigned track) → null (oscillator fallback)", () => {
    expect(getInstrumentSamplerOptions(null)).toBeNull();
  });

  it("UTCID02 (A): empty string → null", () => {
    expect(getInstrumentSamplerOptions("")).toBeNull();
  });

  it("UTCID03 (N): Acoustic Grand Piano → 88 urls, baseUrl /instruments/acoustic_grand_piano/", () => {
    const o = getInstrumentSamplerOptions("Acoustic Grand Piano")!;
    expect(o.baseUrl).toBe("/instruments/acoustic_grand_piano/");
    expect(Object.keys(o.urls)).toHaveLength(88);
    expect(o.urls.A0).toBe("A0.mp3");
    expect(o.urls.C8).toBe("C8.mp3");
    expect(o.urls).not.toHaveProperty("C9");
  });

  it("UTCID04 (N): Synth Drum → 88 urls, baseUrl /instruments/synth_drum/", () => {
    const o = getInstrumentSamplerOptions("Synth Drum")!;
    expect(o.baseUrl).toBe("/instruments/synth_drum/");
    expect(Object.keys(o.urls)).toHaveLength(88);
  });

  it("UTCID05 (A): Electric Piano 1 (not bundled) → null", () => {
    expect(getInstrumentSamplerOptions("Electric Piano 1")).toBeNull();
  });

  it("UTCID06 (A): lower-case name \"acoustic grand piano\" → null (exact match only)", () => {
    expect(getInstrumentSamplerOptions("acoustic grand piano")).toBeNull();
  });

  it("another bundled instrument (Trumpet) gets its own slug", () => {
    expect(getInstrumentSamplerOptions("Trumpet")!.baseUrl).toBe("/instruments/trumpet/");
  });

  it("drum kits are not served by this mapper → null", () => {
    expect(getInstrumentSamplerOptions("Standard Drum Kit")).toBeNull();
  });

  it("each call returns an independent object (no shared mutable state)", () => {
    const a = getInstrumentSamplerOptions("Oboe")!;
    a.urls.C4 = "hacked.mp3";
    expect(getInstrumentSamplerOptions("Oboe")!.urls.C4).toBe("C4.mp3");
  });
});

// ═════════════════════════════════════════════════════════════
describe("getOscillatorType (bổ sung)", () => {
  it("Electric Piano 1 → triangle (piano family)", () => {
    expect(getOscillatorType("Electric Piano 1")).toBe("triangle");
  });
  it("Rock Organ → sawtooth (organ family)", () => {
    expect(getOscillatorType("Rock Organ")).toBe("sawtooth");
  });
  it("empty string → default triangle", () => {
    expect(getOscillatorType("")).toBe("triangle");
  });
  it("matching is case-insensitive (TRUMPET → square)", () => {
    expect(getOscillatorType("TRUMPET")).toBe("square");
  });
  it("GM Synth Pad instrument 'Pad 2 (warm)' → sine (Synth pad family)", () => {
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

  function gated(count: number) {
    const gates = Array.from({ length: count }, () => deferred<Response>());
    let i = 0;
    fetchMock.mockImplementation(() => gates[i++].promise);
    return gates;
  }

  it("UTCID01 (N): fetch 200 + decode ok → resolves to the decoded AudioBuffer", async () => {
    const buf = await loadSampleBuffer("/instruments/piano/C4.mp3");
    expect(fetchMock).toHaveBeenCalledWith("/instruments/piano/C4.mp3");
    expect(fake.__state.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(buf).toEqual({ duration: 1 });
  });

  it("UTCID02 (N): same URL already requested → same promise returned, fetch called once", async () => {
    const p1 = loadSampleBuffer("/instruments/piano/C4.mp3");
    const p2 = loadSampleBuffer("/instruments/piano/C4.mp3");
    expect(p1).toBe(p2);
    await p1;
    await loadSampleBuffer("/instruments/piano/C4.mp3");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("UTCID03 (B): 16 distinct URLs requested at once → all 16 fetches start immediately", async () => {
    const gates = gated(16);
    const all = Array.from({ length: 16 }, (_, k) => loadSampleBuffer(`/q${k}.mp3`));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(16);
    gates.forEach((g) => g.resolve(ok()));
    await Promise.all(all);
  });

  it("UTCID04 (B): 17 distinct URLs requested at once → the 17th starts only after one finishes", async () => {
    const gates = gated(17);
    const all = Array.from({ length: 17 }, (_, k) => loadSampleBuffer(`/q${k}.mp3`));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(16);
    gates[0].resolve(ok());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(17);
    gates.slice(1).forEach((g) => g.resolve(ok()));
    await Promise.all(all);
  });

  it("UTCID05 (A): fetch returns 404 → Error \"Failed to fetch /x.mp3: HTTP 404\"", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    await expect(loadSampleBuffer("/x.mp3")).rejects.toThrow("Failed to fetch /x.mp3: HTTP 404");
  });

  it("UTCID06 (A): decodeAudioData rejects → decode error propagated, slot released", async () => {
    fake.__state.decodeAudioData = vi.fn(async () => {
      throw new Error("EncodingError");
    });
    await expect(loadSampleBuffer("/x.mp3")).rejects.toThrow("EncodingError");
    fake.__state.decodeAudioData = vi.fn(async () => ({ duration: 1 }) as unknown as AudioBuffer);
    fetchMock.mockClear();
    const gates = gated(16);
    const all = Array.from({ length: 16 }, (_, k) => loadSampleBuffer(`/s${k}.mp3`));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(16);
    gates.forEach((g) => g.resolve(ok()));
    await Promise.all(all);
  });

  it("UTCID07 (A): earlier request for the URL rejected → failure not cached, the next call refetches", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("net::ERR_INSUFFICIENT_RESOURCES"));
    await expect(loadSampleBuffer("/x.mp3")).rejects.toThrow();
    await expect(loadSampleBuffer("/x.mp3")).resolves.toEqual({ duration: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("different URLs are fetched separately", async () => {
    await Promise.all([loadSampleBuffer("/a.mp3"), loadSampleBuffer("/b.mp3")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("failed requests free their slots — the queue keeps draining", async () => {
    fetchMock.mockRejectedValue(new TypeError("net::ERR_INSUFFICIENT_RESOURCES"));
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, k) => loadSampleBuffer(`/f${k}.mp3`)));
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(8);
    fetchMock.mockImplementation(async () => ok());
    await expect(loadSampleBuffer("/after.mp3")).resolves.toBeDefined();
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
    vi.doMock("./sample-buffer-cache", () => ({ loadSampleBuffer: ctx.loadSample, releaseSampleOwner: vi.fn() }));
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

  it("UTCID01 (N): Standard Drum Kit, kits.json 200 → ready resolves; zones + buffers loaded", async () => {
    ctx.kits = { "Standard Drum Kit": [zone({ file: "kick.ogg" }), zone({ file: "snare.ogg" })] };
    const kit = new ctx.Kit("Standard Drum Kit", {} as never);
    await expect(kit.ready).resolves.toBeUndefined();
    expect(ctx.fetchMock).toHaveBeenCalledWith("/instruments/generaluser_drums/kits.json");
    expect(ctx.loadSample.mock.calls.map((c) => c[0])).toEqual([
      "/instruments/generaluser_drums/kick.ogg",
      "/instruments/generaluser_drums/snare.ogg",
    ]);
  });

  it("UTCID02 (N): 2 zones share one file → file loaded once", async () => {
    ctx.kits = { "Standard Drum Kit": [zone({ file: "hat.ogg", velHi: 63 }), zone({ file: "hat.ogg", velLo: 64 })] };
    await new ctx.Kit("Standard Drum Kit", {} as never).ready;
    expect(ctx.loadSample).toHaveBeenCalledTimes(1);
  });

  it("UTCID03 (A): \"Unknown Kit\" → ready resolves; no zones, no sample loads", async () => {
    const out = new ctx.fake.Gain(1);
    const kit = new ctx.Kit("Unknown Kit", out as never);
    await expect(kit.ready).resolves.toBeUndefined();
    expect(ctx.loadSample).not.toHaveBeenCalled();
    kit.trigger(36, 100, 1, 0, 0.5);
    expect(ctx.fake.__state.of("ToneBufferSource")).toHaveLength(0);
  });

  it("UTCID04 (N): table already loaded by another voice → Orchestra Drum Kit does not fetch kits.json again", async () => {
    ctx.kits = { "Standard Drum Kit": [zone({ file: "kick.ogg" })], "Orchestra Drum Kit": [zone({ file: "timp.ogg" })] };
    await new ctx.Kit("Standard Drum Kit", {} as never).ready;
    await new ctx.Kit("Orchestra Drum Kit", {} as never).ready;
    expect(ctx.fetchMock).toHaveBeenCalledTimes(1);
    expect(ctx.loadSample).toHaveBeenLastCalledWith("/instruments/generaluser_drums/timp.ogg", expect.anything());
  });

  it("two voices created at the same time share one kits.json request", async () => {
    await Promise.all([new ctx.Kit("Standard Drum Kit", {} as never).ready, new ctx.Kit("Standard Drum Kit", {} as never).ready]);
    expect(ctx.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("UTCID05 (A): kits.json 500 → ready resolves, warning logged, next voice refetches the table", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    ctx.fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(new ctx.Kit("Standard Drum Kit", {} as never).ready).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Failed to load drum kit "Standard Drum Kit":', expect.any(Error));
    await new ctx.Kit("Standard Drum Kit", {} as never).ready;
    expect(ctx.fetchMock).toHaveBeenCalledTimes(2);
    expect(ctx.loadSample).toHaveBeenCalledTimes(1);
  });

  it("UTCID06 (A): one sample file fails → ready resolves, other buffers loaded, warning logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
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
    expect(warn).toHaveBeenCalledWith("Failed to load drum sample bad.ogg:", expect.any(Error));
  });
});

describe("FE-LIB-26 SoundFontKitVoice.trigger", () => {
  const ctx = setupKit();
  const sources = () => ctx.fake.__state.of<AnyNode>("ToneBufferSource");
  const peakOf = (env: AnyNode) => env.gain.calls.find((c: unknown[]) => c[0] === "linearRampToValueAtTime")![1];
  const kick = () => zone({ keyLo: 35, keyHi: 36, velLo: 0, velHi: 127 });

  it("UTCID01 (N): pitch 36, velocity 100 in zone 35-36 → 1 hit, gain (100/127)² × volume", async () => {
    const { kit } = await readyKit(ctx, [kick()]);
    kit.trigger(36, 100, 0.5, 1.5, 0.25);
    expect(sources()).toHaveLength(1);
    expect(sources()[0].start).toHaveBeenCalledWith(1.5, 0);
    expect(peakOf(ctx.fake.__state.of<AnyNode>("Gain")[0])).toBeCloseTo(Math.pow(100 / 127, 2) * 0.5, 10);
  });

  it("UTCID02 (A): voice disposed → nothing played", async () => {
    const { kit } = await readyKit(ctx, [kick()]);
    kit.dispose();
    kit.trigger(36, 100, 1, 0, 0.25);
    expect(sources()).toHaveLength(0);
  });

  it("UTCID03 (B): velocity 0 → nothing played", async () => {
    const { kit } = await readyKit(ctx, [kick()]);
    kit.trigger(36, 0, 1, 0, 0.25);
    expect(sources()).toHaveLength(0);
  });

  it("UTCID04 (B): velocity 1 → 1 hit, gain (1/127)² × volume", async () => {
    const { kit } = await readyKit(ctx, [kick()]);
    kit.trigger(36, 1, 1, 0, 0.25);
    expect(sources()).toHaveLength(1);
    expect(peakOf(ctx.fake.__state.of<AnyNode>("Gain")[0])).toBeCloseTo(Math.pow(1 / 127, 2), 12);
  });

  it("UTCID05 (B): pitch 35 (keyLo) → 1 hit, gain (100/127)² × volume", async () => {
    const { kit } = await readyKit(ctx, [kick()]);
    kit.trigger(35, 100, 1, 0, 0.25);
    expect(sources()).toHaveLength(1);
    expect(peakOf(ctx.fake.__state.of<AnyNode>("Gain")[0])).toBeCloseTo(Math.pow(100 / 127, 2), 10);
  });

  it("UTCID06 (B): pitch 34 (keyLo − 1) → nothing played", async () => {
    const { kit } = await readyKit(ctx, [kick()]);
    kit.trigger(34, 100, 1, 0, 0.25);
    expect(sources()).toHaveLength(0);
  });

  it("UTCID07 (B): pitch 37 (keyHi + 1) → nothing played", async () => {
    const { kit } = await readyKit(ctx, [kick()]);
    kit.trigger(37, 100, 1, 0, 0.25);
    expect(sources()).toHaveLength(0);
  });

  it("UTCID08 (A): zone velocity range 64-127, velocity 63 → nothing played", async () => {
    const { kit } = await readyKit(ctx, [zone({ keyLo: 35, keyHi: 36, velLo: 64, velHi: 127 })]);
    kit.trigger(36, 63, 1, 0, 0.25);
    expect(sources()).toHaveLength(0);
  });

  it("UTCID09 (A): zone buffer failed to load → nothing played", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ctx.loadSample.mockRejectedValue(new Error("404"));
    const { kit } = await readyKit(ctx, [kick()]);
    kit.trigger(36, 100, 1, 0, 0.25);
    expect(sources()).toHaveLength(0);
  });

  it("UTCID10 (N): 2 layered zones match → 2 hits played", async () => {
    const { kit } = await readyKit(ctx, [zone({ file: "a.ogg", keyLo: 35, keyHi: 36 }), zone({ file: "b.ogg", keyLo: 36, keyHi: 36 })]);
    kit.trigger(36, 100, 1, 0, 0.25);
    expect(sources()).toHaveLength(2);
  });

  it("UTCID11 (N): open hi-hat (class 1) started earlier, new class-1 hit → earlier hit fast-released, new hit played", async () => {
    const { kit } = await readyKit(ctx, [zone({ exclusiveClass: 1 })]);
    kit.trigger(46, 100, 1, 0, 1);
    const firstEnv = ctx.fake.__state.of<AnyNode>("Gain")[0];
    kit.trigger(42, 100, 1, 0.5, 1);
    expect(firstEnv.gain.calls).toContainEqual(["cancelAndHoldAtTime", 0.5]);
    expect(firstEnv.gain.calls).toContainEqual(["setTargetAtTime", 0, 0.5, tcToSec(-2320) * TAU_PER_SEC]);
    expect(sources()).toHaveLength(2);
  });

  it("UTCID12 (B): class-1 hit active with start == time → existing hit not choked, new hit played", async () => {
    const { kit } = await readyKit(ctx, [zone({ exclusiveClass: 1 })]);
    kit.trigger(46, 100, 1, 0.5, 1);
    const env = ctx.fake.__state.of<AnyNode>("Gain")[0];
    const before = env.gain.calls.length;
    kit.trigger(42, 100, 1, 0.5, 1);
    expect(env.gain.calls.length).toBe(before);
    expect(sources()).toHaveLength(2);
  });

  it("UTCID13 (N): old hit already ended (end <= time) → pruned from the active list", async () => {
    const { kit } = await readyKit(ctx, [kick()]);
    kit.trigger(36, 100, 1, 0, 0.25);
    expect((kit as any).active).toHaveLength(1);
    kit.trigger(36, 100, 1, 10, 0.25);
    expect((kit as any).active).toHaveLength(1);
    expect((kit as any).active[0].start).toBe(10);
  });

  it("UTCID14 (N): 2 active hits then dispose() → all hit nodes disposed, active list emptied", async () => {
    const { kit } = await readyKit(ctx, [kick()]);
    kit.trigger(36, 100, 1, 0, 1);
    kit.trigger(35, 100, 1, 0.1, 1);
    const nodes = ctx.fake.__state.created.slice();
    expect(nodes.length).toBeGreaterThan(0);
    kit.dispose();
    expect(nodes.every((n) => n.disposed)).toBe(true);
    expect((kit as any).active).toHaveLength(0);
  });

  it("velocity layers — only the zone whose velocity range matches plays", async () => {
    const { kit } = await readyKit(ctx, [zone({ file: "soft.ogg", velHi: 63 }), zone({ file: "hard.ogg", velLo: 64 })]);
    kit.trigger(36, 64, 1, 0, 0.1);
    expect(sources()).toHaveLength(1);
    expect((sources()[0].args[0] as any).url.url).toContain("hard.ogg");
  });

  it("a different exclusive class is not choked", async () => {
    const { kit } = await readyKit(ctx, [zone({ exclusiveClass: 1, keyHi: 50 }), zone({ exclusiveClass: 2, keyLo: 51 })]);
    kit.trigger(42, 100, 1, 0.5, 1);
    const env = ctx.fake.__state.of<AnyNode>("Gain")[0];
    const before = env.gain.calls.length;
    kit.trigger(60, 100, 1, 0.9, 1);
    expect(env.gain.calls.length).toBe(before);
  });

  it("trigger before samples finished loading → silent, no throw", async () => {
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

  it("UTCID01 (B): velocityGain 0 (track volume 0) → no nodes created", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone(), 60, 0);
    expect(ctx.fake.__state.created).toHaveLength(0);
  });

  it("UTCID02 (N): filterFc 13500, modEnvToFilterFc 0, pan 0 → source → env → output, no filter/panner", async () => {
    const { kit, out } = await readyKit(ctx, [zone()]);
    play(kit, zone({ filterFc: 13500, modEnvToFilterFc: 0, pan: 0 }));
    const [src] = only("ToneBufferSource");
    const [env] = only("Gain");
    expect(src.connections).toEqual([env]);
    expect(env.connections).toEqual([out]);
    expect(only("Filter")).toHaveLength(0);
    expect(only("Panner")).toHaveLength(0);
  });

  it("UTCID03 (N): filterFc 5000, filterQ 50 → low-pass filter Q 5 inserted, scheduleFilter called", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    const spy = vi.spyOn(kit as any, "scheduleFilter");
    play(kit, zone({ filterFc: 5000, filterQ: 50 }));
    const [filter] = only("Filter");
    expect(filter.args[0]).toMatchObject({ type: "lowpass", rolloff: -12, Q: 5 });
    expect(only("ToneBufferSource")[0].connections).toEqual([filter]);
    expect(filter.connections).toEqual([only("Gain")[0]]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("UTCID04 (N): filterFc 13500 but modEnvToFilterFc 2000 → low-pass filter Q 5 inserted, scheduleFilter called", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    const spy = vi.spyOn(kit as any, "scheduleFilter");
    play(kit, zone({ filterFc: 13500, modEnvToFilterFc: 2000, filterQ: 50 }));
    const [filter] = only("Filter");
    expect(filter.args[0]).toMatchObject({ type: "lowpass", Q: 5 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("UTCID05 (N): zone pan 250 → Panner(0.5) between env and output", async () => {
    const { kit, out } = await readyKit(ctx, [zone()]);
    play(kit, zone({ pan: 250 }));
    const [panner] = only("Panner");
    expect(panner.args[0]).toBe(0.5);
    expect(only("Gain")[0].connections).toEqual([panner]);
    expect(panner.connections).toEqual([out]);
  });

  it("UTCID06 (B): zone pan 600 → Panner clamped to 1", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone({ pan: 600 }));
    expect(only("Panner")[0].args[0]).toBe(1);
  });

  it("UTCID07 (B): zone pan -600 → Panner clamped to -1", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone({ pan: -600 }));
    expect(only("Panner")[0].args[0]).toBe(-1);
  });

  it("UTCID08 (N): pitch = root + 12, scaleTuning 100, tune 0 → playbackRate 2", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone({ root: 60, scaleTuning: 100, tune: 0 }), 72);
    expect((only("ToneBufferSource")[0].args[0] as any).playbackRate).toBeCloseTo(2, 12);
  });

  it("UTCID09 (N): scaleTuning 0, tune 0 → playbackRate 1 regardless of pitch", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone({ scaleTuning: 0, tune: 0 }), 90);
    play(kit, zone({ scaleTuning: 0, tune: 0 }), 20);
    expect(only("ToneBufferSource").map((s) => (s.args[0] as any).playbackRate)).toEqual([1, 1]);
  });

  it("UTCID10 (B): startOffset/sampleRate > buffer.duration → source.start offset clamped to buffer.duration", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone({ startOffset: 441000, sampleRate: 44100 }), 60, 1, 0, 1, buf(2));
    expect(only("ToneBufferSource")[0].start).toHaveBeenCalledWith(0, 2);
  });

  it("UTCID11 (N): source onended fires → hit marked disposed, nodes disposed once", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone({ startOffset: 22050, sampleRate: 44100 }), 60, 1, 2);
    const [src] = only("ToneBufferSource");
    expect(src.start).toHaveBeenCalledWith(2, 0.5);
    const disposeSpies = ctx.fake.__state.created.map((n: AnyNode) => vi.spyOn(n, "dispose"));
    src.onended();
    src.onended();
    expect((kit as any).active[0].disposed).toBe(true);
    expect(ctx.fake.__state.created.every((n) => n.disposed)).toBe(true);
    disposeSpies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
  });

  it("playbackRate = 2^(((pitch-root)·scaleTuning + tune)/1200) with fine tune", async () => {
    const { kit } = await readyKit(ctx, [zone()]);
    play(kit, zone({ root: 60, tune: 50 }), 62);
    expect((only("ToneBufferSource")[0].args[0] as any).playbackRate).toBeCloseTo(Math.pow(2, 250 / 1200), 12);
  });
});

describe("FE-LIB-28 SoundFontKitVoice.scheduleVolume", () => {
  const ctx = setupKit();
  const run = async (z: Zone, pitch = 60, peak = 1, time = 1, noteOff = 10) => {
    const { kit } = await readyKit(ctx, [zone()]);
    const env = new ctx.fake.Gain(0);
    (kit as any).scheduleVolume(env, z, pitch, peak, time, noteOff);
    return env.gain.calls as [string, ...number[]][];
  };
  const volEnv = (sustainCb: number, extra: Partial<Record<"delay" | "attack" | "hold" | "decay" | "release", number>> = {}) => [
    extra.delay ?? 0,
    extra.attack ?? 0,
    extra.hold ?? 0,
    extra.decay ?? 0,
    sustainCb,
    extra.release ?? 0,
  ];
  const ramp = (calls: [string, ...number[]][]) => calls.find((c) => c[0] === "exponentialRampToValueAtTime");
  const tHoldOf = (calls: [string, ...number[]][]) => calls[3][2];

  it("UTCID01 (N): sustain 0, delay/attack 0 tc → no decay ramp; holds peak until note-off", async () => {
    const calls = await run(zone({ volEnv: volEnv(0) }), 60, 0.8);
    expect(ramp(calls)).toBeUndefined();
    expect(calls[3]).toEqual(["setValueAtTime", 0.8, 1 + 1 + 1 + 1]);
    expect(calls[4]).toEqual(["cancelAndHoldAtTime", 10]);
  });

  it("UTCID02 (N): sustain 480 → exponential ramp to peak·10^-2.4 over half the decay time", async () => {
    const calls = await run(zone({ volEnv: volEnv(480) }));
    const r = ramp(calls)!;
    expect(r[1]).toBeCloseTo(Math.pow(10, -2.4), 12);
    expect(r[2]).toBeCloseTo(tHoldOf(calls) + 1 * 0.5, 9);
  });

  it("UTCID03 (B): sustain 960 → exponential ramp to peak·10^-4.8 over the full decay time", async () => {
    const calls = await run(zone({ volEnv: volEnv(960) }));
    const r = ramp(calls)!;
    expect(r[1]).toBeCloseTo(Math.pow(10, -4.8), 12);
    expect(r[2]).toBeCloseTo(tHoldOf(calls) + 1, 9);
  });

  it("UTCID04 (A): sustain 1440 (> 960) → clamped: ramp to peak·10^-4.8 over the full decay time", async () => {
    const calls = await run(zone({ volEnv: volEnv(1440) }));
    const r = ramp(calls)!;
    expect(r[1]).toBeCloseTo(Math.pow(10, -4.8), 12);
    expect(r[2]).toBeCloseTo(tHoldOf(calls) + 1, 9);
  });

  it("UTCID05 (A): sustain -100 → clamped to 0: no decay ramp; holds peak until note-off", async () => {
    const calls = await run(zone({ volEnv: volEnv(-100) }));
    expect(ramp(calls)).toBeUndefined();
    expect(calls[4]).toEqual(["cancelAndHoldAtTime", 10]);
  });

  it("UTCID06 (B): delay -12000 tc (floor) → delay treated as 0.001 s", async () => {
    const calls = await run(zone({ volEnv: volEnv(0, { delay: -12000 }) }), 60, 1, 0);
    expect(calls[1]).toEqual(["setValueAtTime", 0, 0.001]);
  });

  it("UTCID07 (N): sustain 480, keyToVolEnvHold 100, pitch 48 → hold time = tcToSec(hold + 100·12)", async () => {
    const calls = await run(zone({ volEnv: volEnv(480), keyToVolEnvHold: 100 }), 48);
    const tPeak = calls[2][2];
    expect(tHoldOf(calls) - tPeak).toBeCloseTo(tcToSec(0 + 100 * 12), 9);
  });

  it("UTCID08 (N): release 0 tc → cancelAndHold at note-off; setTarget 0 with tau 1 s·TAU", async () => {
    const calls = await run(zone({ volEnv: volEnv(0, { release: 0 }) }), 60, 1, 1, 3);
    expect(calls.at(-2)).toEqual(["cancelAndHoldAtTime", 3]);
    expect(calls.at(-1)).toEqual(["setTargetAtTime", 0, 3, 1 * TAU_PER_SEC]);
  });

  it("full envelope order: delay → linear attack → hold → decay to sustain → release", async () => {
    const calls = await run(zone({ volEnv: [-12000, -12000, -12000, 0, 480, 0] }), 60, 1, 1, 2);
    expect(calls.map((c) => c[0])).toEqual([
      "setValueAtTime", "setValueAtTime", "linearRampToValueAtTime", "setValueAtTime",
      "exponentialRampToValueAtTime", "cancelAndHoldAtTime", "setTargetAtTime",
    ]);
  });
});

describe("FE-LIB-29 SoundFontKitVoice.scheduleFilter", () => {
  const ctx = setupKit();
  const hz = (c: number, nyq = 22050) => Math.max(20, Math.min(20000, nyq - 100, 8.176 * Math.pow(2, c / 1200)));
  const run = async (z: Zone, time = 0, noteOff = 1, sampleRate = 44100) => {
    const { kit } = await readyKit(ctx, [zone()]);
    ctx.fake.__state.sampleRate = sampleRate;
    const filter = new ctx.fake.Filter({});
    (kit as any).scheduleFilter(filter, z, time, noteOff);
    return filter.frequency.calls as [string, ...number[]][];
  };
  const modEnv = (sustain: number) => [-12000, -12000, -12000, 0, sustain, 0];

  it("UTCID01 (N): modEnvToFilterFc 0, filterFc 5000 → only setValueAtTime(hz(5000)) at note start", async () => {
    const calls = await run(zone({ filterFc: 5000, modEnvToFilterFc: 0 }), 0.25);
    expect(calls).toEqual([["setValueAtTime", hz(5000), 0.25]]);
  });

  it("UTCID02 (N): mod 2400, sustain 0 → ramp to hz(7400) and stays (sustain level 1)", async () => {
    const calls = await run(zone({ filterFc: 5000, modEnvToFilterFc: 2400, modEnv: modEnv(0) }));
    expect(calls[2][1]).toBeCloseTo(hz(7400), 6);
    expect(calls[4][1]).toBeCloseTo(hz(7400), 6);
    expect(calls.at(-1)).toEqual(["exponentialRampToValueAtTime", hz(5000), 2]);
  });

  it("UTCID03 (B): mod 2400, sustain 1000 → ramp to hz(7400), decays back to hz(5000)", async () => {
    const calls = await run(zone({ filterFc: 5000, modEnvToFilterFc: 2400, modEnv: modEnv(1000) }));
    expect(calls[2][1]).toBeCloseTo(hz(7400), 6);
    expect(calls[4][1]).toBeCloseTo(hz(5000), 6);
  });

  it("UTCID04 (A): mod 2400, sustain 1500 → clamped: ramp to hz(7400), decays back to hz(5000)", async () => {
    const calls = await run(zone({ filterFc: 5000, modEnvToFilterFc: 2400, modEnv: modEnv(1500) }));
    expect(calls[2][1]).toBeCloseTo(hz(7400), 6);
    expect(calls[4][1]).toBeCloseTo(hz(5000), 6);
  });

  it("UTCID05 (A): mod 2400, sustain -10 → clamped: ramp to hz(7400) and stays", async () => {
    const calls = await run(zone({ filterFc: 5000, modEnvToFilterFc: 2400, modEnv: modEnv(-10) }));
    expect(calls[2][1]).toBeCloseTo(hz(7400), 6);
    expect(calls[4][1]).toBeCloseTo(hz(7400), 6);
  });

  it("UTCID06 (B): filterFc 14000 cents (> 20 kHz) → cutoff clamped to 20000 Hz", async () => {
    const calls = await run(zone({ filterFc: 14000, modEnvToFilterFc: 0 }));
    expect(calls).toEqual([["setValueAtTime", 20000, 0]]);
  });

  it("UTCID07 (B): sampleRate 22050, filterFc 13000 → cutoff clamped to 10925 Hz (Nyquist − 100)", async () => {
    const calls = await run(zone({ filterFc: 13000, modEnvToFilterFc: 0 }), 0, 1, 22050);
    expect(calls[0][1]).toBe(10925);
  });

  it("UTCID08 (B): filterFc 0 cents (8.2 Hz) → cutoff clamped to 20 Hz", async () => {
    const calls = await run(zone({ filterFc: 0, modEnvToFilterFc: 0 }));
    expect(calls[0][1]).toBe(20);
  });

  it("negative modulation amount sweeps cutoff downward", async () => {
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
    kitReady: null as Promise<void> | null,
  };
  class FakeKit {
    ready = ctx.kitReady ?? Promise.resolve();
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
    ctx.kitReady = null;
    ctx.loadSample = vi.fn(async (url: string) => ({ url }) as unknown as AudioBuffer);
    vi.doMock("./sample-buffer-cache", () => ({ loadSampleBuffer: ctx.loadSample, releaseSampleOwner: vi.fn() }));
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
  it("UTCID01 (N): 69 → 440 Hz", () => {
    expect(ctx.eng.noteToFrequency(69)).toBe(440);
  });
  it("UTCID02 (N): 81 → 880 Hz", () => {
    expect(ctx.eng.noteToFrequency(81)).toBeCloseTo(880, 9);
  });
  it("UTCID03 (N): 60 → 261.63 Hz", () => {
    expect(ctx.eng.noteToFrequency(60)).toBeCloseTo(261.63, 2);
  });
  it("UTCID04 (B): 0 → 8.18 Hz", () => {
    expect(ctx.eng.noteToFrequency(0)).toBeCloseTo(8.18, 2);
  });
  it("UTCID05 (B): 127 → 12543.85 Hz", () => {
    expect(ctx.eng.noteToFrequency(127)).toBeCloseTo(12543.85, 2);
  });
  it("one octave down halves the frequency (57 → 220)", () => {
    expect(ctx.eng.noteToFrequency(57)).toBeCloseTo(220, 9);
  });
  it("non-numeric input (NaN) → NaN, no exception", () => {
    expect(ctx.eng.noteToFrequency(Number.NaN)).toBeNaN();
  });
});

describe("FE-LIB-31 createTrackVoiceWithReady (via prepareVoices)", () => {
  const ctx = setupEngine();
  const ALL_88 = Array.from({ length: 88 }, (_, i) => 21 + i);
  const prep = async (t: DraftTrack, pitches: number[] = [60]) => {
    const dest = new ctx.fake.Gain(1);
    const cache = ctx.eng.createVoiceCache();
    const notes = pitches.map((p, i) => note(`n${i}`, { trackId: t.id, pitch: p, start: i }));
    const voices = await ctx.eng.prepareVoices(notes, [t], 0, null, dest as never, cache);
    return { voice: voices.get(t.id)! as any, dest, entry: cache.get(t.id)! };
  };

  it("UTCID01 (N): Standard Drum Kit, pan 0 → voice.kit set, synth null, ready = kit.ready", async () => {
    const { voice, entry } = await prep(track("t1", { instrument: "Standard Drum Kit", pan: 0 }));
    expect(voice.synth).toBeNull();
    expect(voice.kit).toBe(ctx.kits[0]);
    expect(ctx.kits[0].name).toBe("Standard Drum Kit");
    expect(ctx.kits[0].output).toBe(voice.panner);
    expect(entry.ready).toBe(ctx.kits[0].ready);
  });

  it("UTCID02 (N): Acoustic Grand Piano, all 88 samples load → Sampler with 88 buffers added; ready resolves", async () => {
    const { voice, entry } = await prep(track("t1", { instrument: "Acoustic Grand Piano", pan: 0 }), ALL_88);
    expect(voice.synth.kind).toBe("Sampler");
    expect(ctx.loadSample).toHaveBeenCalledTimes(88);
    expect(voice.synth.added).toHaveLength(88);
    await expect(entry.ready).resolves.toBeUndefined();
  });

  it("UTCID03 (A): sample A0.mp3 fails → 87 buffers added, ready still resolves, warning logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    ctx.loadSample.mockImplementation(async (url: string) => {
      if (url.endsWith("/A0.mp3")) throw new Error("404");
      return { url };
    });
    const { voice, entry } = await prep(track("t1", { instrument: "Acoustic Grand Piano", pan: 0 }), ALL_88);
    expect(voice.synth.added).toHaveLength(87);
    await expect(entry.ready).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("Failed to load sample /instruments/acoustic_grand_piano/A0.mp3:", expect.any(Error));
  });

  it("UTCID04 (A): sampler disposed before loads finish → no buffers added after dispose", async () => {
    const gate = deferred<void>();
    ctx.loadSample.mockImplementation(async (url: string) => {
      await gate.promise;
      return { url };
    });
    const cache = ctx.eng.createVoiceCache();
    const t = track("t1", { instrument: "Acoustic Grand Piano", pan: 0 });
    const pending = ctx.eng.prepareVoices([note("n")], [t], 0, null, new ctx.fake.Gain(1) as never, cache);
    const sampler = cache.get("t1")!.voice.synth as any;
    ctx.eng.evictVoice(cache, "t1");
    gate.resolve();
    await pending;
    expect(sampler.added).toHaveLength(0);
  });

  it("UTCID05 (N): Electric Piano 1 (no samples) → PolySynth (triangle), ready resolved immediately", async () => {
    const { voice, entry } = await prep(track("t1", { instrument: "Electric Piano 1", pan: 0 }));
    expect(voice.synth.kind).toBe("PolySynth");
    expect(voice.synth.args[1]).toMatchObject({ oscillator: { type: "triangle" } });
    expect(ctx.loadSample).not.toHaveBeenCalled();
    await expect(entry.ready).resolves.toBeUndefined();
  });

  it("UTCID06 (N): instrument null, pan undefined → PolySynth (triangle), Panner(0)", async () => {
    const t = track("t1");
    delete (t as Partial<DraftTrack>).pan;
    const { voice, dest } = await prep(t);
    expect(voice.kit).toBeNull();
    expect(voice.synth.kind).toBe("PolySynth");
    expect(voice.synth.args[1].oscillator.type).toBe("triangle");
    expect(voice.panner.args[0]).toBe(0);
    expect(voice.filter.args).toEqual([6000, "lowpass"]);
    expect(voice.synth.connections).toEqual([voice.filter]);
    expect(voice.filter.connections).toEqual([voice.panner]);
    expect(voice.panner.connections).toEqual([dest]);
  });

  it("UTCID07 (B): Electric Piano 1, pan -1 → Panner(-1) connected to destination", async () => {
    const { voice, dest } = await prep(track("t1", { instrument: "Electric Piano 1", pan: -1 }));
    expect(voice.panner.args[0]).toBe(-1);
    expect(voice.panner.connections).toEqual([dest]);
  });

  it("oscillator type follows the instrument (Church Organ → sawtooth)", async () => {
    const { voice } = await prep(track("t1", { instrument: "Church Organ" }));
    expect(voice.synth.args[1].oscillator.type).toBe("sawtooth");
  });

  it("sampled instrument loads only the samples for the pitches the track uses", async () => {
    const { voice } = await prep(track("t1", { instrument: "Trumpet" }));
    expect(ctx.loadSample).toHaveBeenCalledTimes(1);
    expect(ctx.loadSample).toHaveBeenCalledWith("/instruments/trumpet/C4.mp3", expect.anything());
    expect(voice.synth.added).toHaveLength(1);
  });
});

describe("FE-LIB-32 evictVoice", () => {
  const ctx = setupEngine();
  const build = async (tracks: DraftTrack[]) => {
    const cache = ctx.eng.createVoiceCache();
    await ctx.eng.prepareVoices(tracks.map((t) => note(`n-${t.id}`, { trackId: t.id })), tracks, 0, null, new ctx.fake.Gain(1) as never, cache);
    return cache;
  };

  it("UTCID01 (N): synth voice for t1, evict t1 → synth/filter/panner disposed, entry removed", async () => {
    const cache = await build([track("t1")]);
    const v = cache.get("t1")!.voice as any;
    ctx.eng.evictVoice(cache, "t1");
    expect(cache.has("t1")).toBe(false);
    expect([v.synth.disposed, v.filter.disposed, v.panner.disposed]).toEqual([true, true, true]);
  });

  it("UTCID02 (N): kit voice for t1, evict t1 → kit.dispose called, entry removed", async () => {
    const cache = await build([track("t1", { instrument: "Standard Drum Kit" })]);
    ctx.eng.evictVoice(cache, "t1");
    expect(ctx.kits[0].dispose).toHaveBeenCalledTimes(1);
    expect(cache.has("t1")).toBe(false);
  });

  it("UTCID03 (A): synth voice for t1, evict t2 → no-op, cache unchanged", async () => {
    const cache = await build([track("t1")]);
    const v = cache.get("t1")!.voice as any;
    expect(() => ctx.eng.evictVoice(cache, "t2")).not.toThrow();
    expect(cache.size).toBe(1);
    expect(v.synth.disposed).toBe(false);
  });

  it("UTCID04 (B): empty cache, evict t1 → no-op, cache unchanged", () => {
    const cache = ctx.eng.createVoiceCache();
    expect(() => ctx.eng.evictVoice(cache, "t1")).not.toThrow();
    expect(cache.size).toBe(0);
  });

  it("other tracks' voices are untouched", async () => {
    const cache = await build([track("a"), track("b")]);
    const vb = cache.get("b")!.voice as any;
    ctx.eng.evictVoice(cache, "a");
    expect(cache.has("b")).toBe(true);
    expect(vb.synth.disposed).toBe(false);
  });

  it("evicting twice is safe (second call is a no-op)", async () => {
    const cache = await build([track("a")]);
    ctx.eng.evictVoice(cache, "a");
    expect(() => ctx.eng.evictVoice(cache, "a")).not.toThrow();
  });
});

describe("FE-LIB-33 audibleNotes (via triggerNotes)", () => {
  const ctx = setupEngine();
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
  const at = (start: number, extra: Partial<DraftNote> = {}) => [note("a", { start, ...extra })];

  it("UTCID01 (N): track exists, not muted, no solo; start 480 in [0, null) → included", () => {
    expect(audible(at(480), [track("t1")])).toBe(1);
  });

  it("UTCID02 (A): note's trackId not in tracks → excluded", () => {
    expect(audible(at(480, { trackId: "deleted" }), [track("t1")])).toBe(0);
  });

  it("UTCID03 (A): track muted → excluded", () => {
    expect(audible(at(480), [track("t1", { muted: true })])).toBe(0);
  });

  it("UTCID04 (A): another track soloed → excluded", () => {
    expect(audible(at(480), [track("t1"), track("t2", { solo: true })])).toBe(0);
  });

  it("UTCID05 (N): own track soloed → included", () => {
    expect(audible(at(480), [track("t1", { solo: true }), track("t2")])).toBe(1);
  });

  it("UTCID06 (B): start 479, fromTick 480 → excluded", () => {
    expect(audible(at(479), [track("t1")], 480)).toBe(0);
  });

  it("UTCID07 (B): start 480, fromTick 480 → included", () => {
    expect(audible(at(480), [track("t1")], 480)).toBe(1);
  });

  it("UTCID08 (B): start 959, toTick 960 → included", () => {
    expect(audible(at(959), [track("t1")], 0, 960)).toBe(1);
  });

  it("UTCID09 (B): start 960, toTick 960 → excluded", () => {
    expect(audible(at(960), [track("t1")], 0, 960)).toBe(0);
  });

  it("soloed AND muted track → mute wins (silent)", () => {
    expect(audible([note("a")], [track("t1", { solo: true, muted: true })])).toBe(0);
  });
});

describe("FE-LIB-34 prepareVoices", () => {
  const ctx = setupEngine();
  const dest = () => new ctx.fake.Gain(1) as never;
  const twoNotes = () => [note("1", { pitch: 60 }), note("2", { pitch: 64, start: 480 })];

  it("UTCID01 (N): empty cache, track t1 with 2 notes → {t1 → new voice}, cached, one voice created", async () => {
    const cache = ctx.eng.createVoiceCache();
    const out = await ctx.eng.prepareVoices(twoNotes(), [track("t1")], 0, null, dest(), cache);
    expect([...out.keys()]).toEqual(["t1"]);
    expect(cache.get("t1")!.voice).toBe(out.get("t1"));
    expect(ctx.fake.__state.of("PolySynth")).toHaveLength(1);
  });

  it("UTCID02 (N): cache has t1 with the same instrument, pan changed to 0.5 → cached voice reused, panner.pan = 0.5", async () => {
    const cache = ctx.eng.createVoiceCache();
    const first = await ctx.eng.prepareVoices(twoNotes(), [track("t1")], 0, null, dest(), cache);
    const second = await ctx.eng.prepareVoices(twoNotes(), [track("t1", { pan: 0.5 })], 0, null, dest(), cache);
    expect(second.get("t1")).toBe(first.get("t1"));
    expect((second.get("t1") as any).panner.pan.value).toBe(0.5);
    expect(ctx.fake.__state.of("PolySynth")).toHaveLength(1);
  });

  it("UTCID03 (N): cache has t1, instrument changed → old voice disposed, new voice cached", async () => {
    const cache = ctx.eng.createVoiceCache();
    const first = (await ctx.eng.prepareVoices(twoNotes(), [track("t1")], 0, null, dest(), cache)).get("t1") as any;
    const second = (await ctx.eng.prepareVoices(twoNotes(), [track("t1", { instrument: "Church Organ" })], 0, null, dest(), cache)).get("t1") as any;
    expect(second).not.toBe(first);
    expect(first.synth.disposed).toBe(true);
    expect(cache.get("t1")!.voice).toBe(second);
    expect(cache.get("t1")!.instrument).toBe("Church Organ");
  });

  it("UTCID04 (N): cache has t1 still loading samples → resolves only after the cached ready settles", async () => {
    const gate = deferred<void>();
    ctx.loadSample.mockImplementation(async () => {
      await gate.promise;
      return {};
    });
    const cache = ctx.eng.createVoiceCache();
    const t = track("t1", { instrument: "Flute" });
    void ctx.eng.prepareVoices(twoNotes(), [t], 0, null, dest(), cache);
    let secondDone = false;
    const second = ctx.eng.prepareVoices(twoNotes(), [t], 0, null, dest(), cache).then(() => (secondDone = true));
    await flush();
    expect(secondDone).toBe(false);
    gate.resolve();
    await second;
    expect(secondDone).toBe(true);
  });

  it("UTCID05 (B): empty cache, all notes before fromTick → empty map, nothing created", async () => {
    const cache = ctx.eng.createVoiceCache();
    const out = await ctx.eng.prepareVoices(twoNotes(), [track("t1")], 960, null, dest(), cache);
    expect(out.size).toBe(0);
    expect(cache.size).toBe(0);
    expect(ctx.fake.__state.created.filter((n) => n.kind !== "Gain")).toHaveLength(0);
  });

  it("UTCID06 (A): voice ready promise rejects → still resolves with {t1 → new voice}, cached, one voice created", async () => {
    ctx.kitReady = Promise.reject(new Error("kit load failed"));
    const cache = ctx.eng.createVoiceCache();
    const out = await ctx.eng.prepareVoices(twoNotes(), [track("t1", { instrument: "Standard Drum Kit" })], 0, null, dest(), cache);
    expect([...out.keys()]).toEqual(["t1"]);
    expect(cache.get("t1")!.voice).toBe(out.get("t1"));
    expect(ctx.kits).toHaveLength(1);
  });

  it("one voice per audible track; muted tracks get no voice", async () => {
    const out = await ctx.eng.prepareVoices(
      [note("1", { trackId: "a" }), note("2", { trackId: "b" }), note("3", { trackId: "m" })],
      [track("a"), track("b"), track("m", { muted: true })],
      0, null, dest(), ctx.eng.createVoiceCache(),
    );
    expect([...out.keys()]).toEqual(["a", "b"]);
  });

  it("waits for sampled instruments to finish loading before resolving", async () => {
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

  it("every sample fails to load → still resolves, voice returned", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ctx.loadSample.mockRejectedValue(new Error("offline"));
    const out = await ctx.eng.prepareVoices([note("1")], [track("t1", { instrument: "Flute" })], 0, null, dest(), ctx.eng.createVoiceCache());
    expect(out.has("t1")).toBe(true);
  });

  it("reusing a cached voice loads only the pitches that are new since last time", async () => {
    const cache = ctx.eng.createVoiceCache();
    const t = track("t1", { instrument: "Flute" });
    await ctx.eng.prepareVoices([note("1", { pitch: 60 })], [t], 0, null, dest(), cache);
    expect(ctx.loadSample).toHaveBeenCalledTimes(1);
    await ctx.eng.prepareVoices([note("1", { pitch: 60 }), note("2", { pitch: 72 })], [t], 0, null, dest(), cache);
    expect(ctx.loadSample).toHaveBeenCalledTimes(2);
    expect(ctx.loadSample).toHaveBeenLastCalledWith("/instruments/flute/C5.mp3", expect.anything());
  });
});

describe("FE-LIB-35 triggerNotes", () => {
  const ctx = setupEngine();
  const synthVoice = () => ({ synth: { triggerAttackRelease: vi.fn() }, kit: null, panner: new ctx.fake.Panner(0) }) as any;
  const a69 = (extra: Partial<DraftNote> = {}) => note("a", { pitch: 69, velocity: 127, start: 480, duration: 480, ...extra });
  const run = (params: Partial<Parameters<typeof ctx.eng.triggerNotes>[0]> & { voice?: any }) => {
    const voice = params.voice ?? synthVoice();
    const tracks = params.tracks ?? [track("t1")];
    ctx.eng.triggerNotes({
      notes: [],
      ppq: 480,
      bpm: 120,
      startTime: 0,
      fromTick: 0,
      toTick: null,
      voiceByTrack: new Map(tracks.map((t) => [t.id, voice])),
      ...params,
      tracks,
    });
    return voice;
  };

  it("UTCID01 (N): synth voice → triggerAttackRelease(440, 0.5, 0.5, 1)", () => {
    const v = run({ notes: [a69()] });
    expect(v.synth.triggerAttackRelease).toHaveBeenCalledWith(440, 0.5, 0.5, 1);
  });

  it("UTCID02 (N): kit voice → kit.trigger(69, 127, 1, 0.5, 0.5)", () => {
    const kitVoice = { synth: null, kit: { trigger: vi.fn() }, panner: new ctx.fake.Panner(0) };
    run({ voice: kitVoice, notes: [a69()] });
    expect(kitVoice.kit.trigger).toHaveBeenCalledWith(69, 127, 1, 0.5, 0.5);
  });

  it("UTCID03 (N): soundMap {69: s1}, buffer loaded → custom sample started at 0.5 s with gain 1", () => {
    const buffer = { duration: 3 } as AudioBuffer;
    const v = run({ notes: [a69()], tracks: [track("t1", { soundMap: { "69": "s1" } })], customBuffers: new Map([["s1", buffer]]) });
    const [src] = ctx.fake.__state.of<AnyNode>("ToneBufferSource");
    expect(src.args[0]).toBe(buffer);
    expect(src.connections).toEqual([v.panner]);
    expect(src.start).toHaveBeenCalledWith(0.5, 0, undefined, 1);
    expect(v.synth.triggerAttackRelease).not.toHaveBeenCalled();
  });

  it("UTCID04 (A): soundMap {69: s1}, s1 not loaded → falls back to the instrument voice", () => {
    const v = run({ notes: [a69()], tracks: [track("t1", { soundMap: { "69": "s1" } })], customBuffers: new Map() });
    expect(v.synth.triggerAttackRelease).toHaveBeenCalledWith(440, 0.5, 0.5, 1);
    expect(ctx.fake.__state.of("ToneBufferSource")).toHaveLength(0);
  });

  it("UTCID05 (A): no voice for the track → note skipped, nothing scheduled", () => {
    const other = synthVoice();
    expect(() =>
      ctx.eng.triggerNotes({
        notes: [a69()],
        tracks: [track("t1")],
        ppq: 480, bpm: 120, startTime: 0, fromTick: 0, toTick: null,
        voiceByTrack: new Map([["other", other]]),
      }),
    ).not.toThrow();
    expect(other.synth.triggerAttackRelease).not.toHaveBeenCalled();
    expect(ctx.fake.__state.of("ToneBufferSource")).toHaveLength(0);
  });

  it("UTCID06 (B): track volume 2 → velocity clamped to 1", () => {
    const v = run({ notes: [a69()], tracks: [track("t1", { volume: 2 })] });
    expect(v.synth.triggerAttackRelease.mock.calls[0][3]).toBe(1);
  });

  it("UTCID07 (B): note velocity 0 → velocity 0 passed to the synth", () => {
    const v = run({ notes: [a69({ velocity: 0 })] });
    expect(v.synth.triggerAttackRelease.mock.calls[0][3]).toBe(0);
  });

  it("UTCID08 (N): start 1440, startTime 10, fromTick 960, anchorTick 0 → note time 11.5 s", () => {
    const v = run({ notes: [a69({ start: 1440 })], startTime: 10, fromTick: 960, anchorTick: 0 });
    expect(v.synth.triggerAttackRelease.mock.calls[0][2]).toBeCloseTo(11.5, 9);
  });

  it("UTCID09 (N): start 1440, startTime 10, fromTick 960 (no anchor) → note time 10.5 s", () => {
    const v = run({ notes: [a69({ start: 1440 })], startTime: 10, fromTick: 960 });
    expect(v.synth.triggerAttackRelease.mock.calls[0][2]).toBeCloseTo(10.5, 9);
  });

  it("UTCID10 (N): 3 unsorted notes (960, 0, 480) → scheduled in order 0, 480, 960", () => {
    const v = run({ notes: [note("c", { start: 960 }), note("a", { start: 0 }), note("b", { start: 480 })] });
    expect(v.synth.triggerAttackRelease.mock.calls.map((c: number[]) => c[2])).toEqual([0, 0.5, 1]);
  });

  it("UTCID11 (A): synth throws on the 1st of 2 notes → 2nd still scheduled, warning logged", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const voice = synthVoice();
    voice.synth.triggerAttackRelease.mockImplementationOnce(() => {
      throw new Error("No available buffers for note: 69");
    });
    run({ voice, notes: [a69(), a69({ start: 960 })] });
    expect(voice.synth.triggerAttackRelease).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith("triggerAttackRelease failed for one note, skipping it:", expect.any(Error));
  });

  it("velocity × track volume scales below 1 and volume 0 gives silence", () => {
    const v = run({ notes: [a69({ velocity: 100 })], tracks: [track("t1", { volume: 0.5 })] });
    expect(v.synth.triggerAttackRelease.mock.calls[0][3]).toBeCloseTo((100 / 127) * 0.5, 12);
  });

  it("empty note list → nothing scheduled", () => {
    const v = run({ notes: [] });
    expect(v.synth.triggerAttackRelease).not.toHaveBeenCalled();
  });
});
