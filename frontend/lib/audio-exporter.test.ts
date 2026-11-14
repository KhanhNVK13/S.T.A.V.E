/**
 * audio-exporter.test.ts — Report 5, FE-LIB-06 / FE-LIB-07 (UC-38 Export audio).
 * Owner: Haidnde180202. Tone.Offline is replaced by test-helpers/fake-tone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DraftSnapshot, DraftTrack, DraftNote } from "@stave/shared-types";

vi.mock("tone", () => import("./test-helpers/fake-tone"));
vi.mock("./tone-synth-engine", () => ({
  prepareVoices: vi.fn(async () => new Map()),
  triggerNotes: vi.fn(),
  createVoiceCache: vi.fn(() => new Map()),
}));
vi.mock("./mp3-encoder", () => ({
  encodeMp3: vi.fn(async (_b: AudioBuffer, _kbps: number, onProgress?: (p: number) => void) => {
    onProgress?.(0.5);
    onProgress?.(1);
    return new Blob([new Uint8Array([0xff, 0xfb])], { type: "audio/mpeg" });
  }),
}));

import {
  exportAudio,
  exportAudioPerTrack,
  NO_AUDIBLE_CONTENT,
  EXPORT_ABORTED,
  LONG_EXPORT_SECONDS,
  rangeFromNotes,
  tickToBar,
  estimateExportSeconds,
  normalizeMp3Kbps,
} from "./audio-exporter";
import { prepareVoices, triggerNotes } from "./tone-synth-engine";
import { encodeMp3 } from "./mp3-encoder";
import { __state } from "./test-helpers/fake-tone";
import { makeAudioBuffer, blobView, readAscii } from "./test-helpers/fake-audio";
import * as Tone from "tone";

function track(id: string, extra: Partial<DraftTrack> = {}): DraftTrack {
  return { id, name: id, order: 0, color: "#fff", muted: false, solo: false, volume: 1, pan: 0, instrument: null, ...extra };
}
function note(id: string, extra: Partial<DraftNote> = {}): DraftNote {
  return { id, trackId: "t1", pitch: 60, start: 0, duration: 480, velocity: 100, ...extra };
}
function snap(extra: Partial<DraftSnapshot> = {}): DraftSnapshot {
  return {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [track("t1")],
    notes: [note("n1")],
    ...extra,
  } as DraftSnapshot;
}

beforeEach(() => {
  __state.reset();
  __state.renderedBuffer = makeAudioBuffer([[0, 0.5, -0.5], [0.25, -0.25, 1]]);
  vi.clearAllMocks();
});

// tempo 120, ppq 480 → 1 tick = 1/960 s; 1 bar (4 beats) = 2 s; min length 4 bars = 8 s.
describe("FE-LIB-06 exportAudio", () => {
  it("UTCID01 (N): notes end before 4 bars, defaults → audio/wav Blob, 10 s (4 bars + 1 bar tail), 44100 Hz", async () => {
    const blob = await exportAudio(snap());
    expect(blob.type).toBe("audio/wav");
    expect(__state.offlineCalls[0]).toMatchObject({ channels: 2, sampleRate: 44100 });
    expect(__state.offlineCalls[0].duration).toBeCloseTo(10, 6);
    const v = await blobView(blob);
    expect(readAscii(v, 0, 4)).toBe("RIFF");
    expect(readAscii(v, 8, 4)).toBe("WAVE");
    expect(readAscii(v, 12, 4)).toBe("fmt ");
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint16(34, true)).toBe(16);
    expect(readAscii(v, 36, 4)).toBe("data");
    expect(v.getUint32(40, true)).toBe(3 * 2 * 2);
    expect(blob.size).toBe(44 + 12);
  });

  it("UTCID02 (N): last note ends at bar 8 → 18 s (8 bars + 1 bar tail)", async () => {
    const blob = await exportAudio(snap({ notes: [note("n1", { start: 13440, duration: 1920 })] }));
    expect(blob.type).toBe("audio/wav");
    expect(__state.offlineCalls[0].duration).toBeCloseTo(18, 6);
  });

  it("UTCID03 (A): no notes → rejected before rendering (no audible content)", async () => {
    await expect(exportAudio(snap({ notes: [] }))).rejects.toThrow(NO_AUDIBLE_CONTENT);
    expect(__state.offlineCalls).toHaveLength(0);
  });

  it("UTCID04 (N): longest custom sound 12 s → tail = 12 s, total 20 s", async () => {
    const custom = new Map([
      ["s1", { duration: 3 } as AudioBuffer],
      ["s2", { duration: 12 } as AudioBuffer],
    ]);
    const blob = await exportAudio(snap(), { customBuffers: custom });
    expect(blob.type).toBe("audio/wav");
    expect(__state.offlineCalls[0].duration).toBeCloseTo(20, 6);
  });

  it("UTCID05 (N): sampleRate 48000 → Tone.Offline called with 48000 Hz and WAV header says 48000", async () => {
    __state.renderedBuffer = makeAudioBuffer([[0, 0.5], [0, -0.5]], 48000);
    const v = await blobView(await exportAudio(snap(), { sampleRate: 48000 }));
    expect(__state.offlineCalls[0]).toMatchObject({ channels: 2, sampleRate: 48000 });
    expect(v.getUint32(24, true)).toBe(48000);
  });

  it("UTCID06 (N): onProgress reports 0.02 → 0.1 → 0.7 → 1.0 in order", async () => {
    const progress: number[] = [];
    await exportAudio(snap(), { onProgress: (p) => progress.push(p) });
    expect(progress).toEqual([0.02, 0.1, 0.7, 1.0]);
  });

  it("UTCID07 (B): rendered samples 1.5 and -2.0 are clipped to 32767 / -32768", async () => {
    __state.renderedBuffer = makeAudioBuffer([[1.5, -2.0]]);
    const v = await blobView(await exportAudio(snap()));
    expect([0, 1].map((i) => v.getInt16(44 + i * 2, true))).toEqual([32767, -32768]);
  });

  it("UTCID08 (A): Tone.Offline rejects → error propagated, progress never reaches 1", async () => {
    const spy = vi.spyOn(Tone, "Offline").mockRejectedValueOnce(new Error("render failed"));
    const progress: number[] = [];
    await expect(exportAudio(snap(), { onProgress: (p) => progress.push(p) })).rejects.toThrow("render failed");
    expect(progress).not.toContain(1);
    spy.mockRestore();
  });

  it("UTCID09 (A): all tracks muted → rejected before rendering (no audible content)", async () => {
    await expect(
      exportAudio(snap({ tracks: [track("t1", { muted: true })] })),
    ).rejects.toThrow(NO_AUDIBLE_CONTENT);
    expect(__state.offlineCalls).toHaveLength(0);
  });

  it("UTCID10 (N): range bars 2-3 (ticks 3840-7680) → voices and notes limited to the range, length = range + 1 bar tail (6 s)", async () => {
    const s = snap({ notes: [note("a", { start: 0 }), note("b", { start: 3840 }), note("c", { start: 8000 })] });
    await exportAudio(s, { range: { fromTick: 3840, toTick: 7680 } });
    expect(__state.offlineCalls[0].duration).toBeCloseTo(6, 6);
    expect(prepareVoices).toHaveBeenCalledWith(s.notes, s.tracks, 3840, 7680, expect.anything(), expect.any(Map));
    expect(triggerNotes).toHaveBeenCalledWith(expect.objectContaining({ startTime: 0, fromTick: 3840, toTick: 7680 }));
  });

  it("UTCID11 (A): range that contains no audible note → rejected before rendering (no audible content)", async () => {
    await expect(
      exportAudio(snap({ notes: [note("a", { start: 0 })] }), { range: { fromTick: 3840, toTick: 7680 } }),
    ).rejects.toThrow(NO_AUDIBLE_CONTENT);
    expect(__state.offlineCalls).toHaveLength(0);
  });

  it("UTCID12 (N): includeMuted → a muted track is rendered, stored volume kept", async () => {
    const s = snap({ tracks: [track("t1", { muted: true, volume: 0.4 })] });
    await exportAudio(s, { includeMuted: true });
    expect(__state.offlineCalls).toHaveLength(1);
    const rendered = vi.mocked(triggerNotes).mock.calls[0][0].tracks[0];
    expect(rendered).toMatchObject({ muted: false, volume: 0.4 });
    expect(s.tracks[0].muted).toBe(true);
  });

  it("UTCID13 (N): format mp3 with 320 kbps → encoder gets 320; an unsupported value falls back to 192", async () => {
    await exportAudio(snap(), { format: "mp3", kbps: 320 });
    expect(encodeMp3).toHaveBeenLastCalledWith(__state.renderedBuffer, 320, expect.any(Function));
    await exportAudio(snap(), { format: "mp3", kbps: 100 });
    expect(encodeMp3).toHaveBeenLastCalledWith(__state.renderedBuffer, 192, expect.any(Function));
  });

  it("UTCID14 (A): signal already aborted → export cancelled before rendering", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(exportAudio(snap(), { signal: controller.signal })).rejects.toThrow(EXPORT_ABORTED);
    expect(__state.offlineCalls).toHaveLength(0);
  });

  it("UTCID15 (A): signal aborted during rendering → rejected, nothing returned, progress never reaches 1", async () => {
    const controller = new AbortController();
    vi.mocked(prepareVoices).mockImplementationOnce(async () => {
      controller.abort();
      return new Map();
    });
    const progress: number[] = [];
    await expect(
      exportAudio(snap(), { signal: controller.signal, onProgress: (p) => progress.push(p) }),
    ).rejects.toThrow(EXPORT_ABORTED);
    expect(progress).not.toContain(1);
  });

  it("UTCID20 (A): an audio sketch attached to the project is not rendered into the export", async () => {
    const sketches = { audioSketches: [{ id: "sk1", path: "u/sk1.wav", durationMs: 4000 }] };
    const plain = await exportAudio(snap());
    const withSketch = await exportAudio(snap(sketches as Partial<DraftSnapshot>));
    expect(__state.of("Player")).toHaveLength(0);
    expect(withSketch.size).toBe(plain.size);
    expect(__state.offlineCalls[1].duration).toBeCloseTo(__state.offlineCalls[0].duration, 6);
    expect(vi.mocked(triggerNotes).mock.calls[1][1]).toEqual(vi.mocked(triggerNotes).mock.calls[0][1]);
  });

  it("export helpers: selection range, bar number, estimate and bitrate normalisation", () => {
    const notes = [note("a", { start: 480, duration: 480 }), note("b", { start: 1920, duration: 960 })];
    expect(rangeFromNotes(notes, new Set())).toBeNull();
    expect(rangeFromNotes(notes, new Set(["a", "b"]))).toEqual({ fromTick: 480, toTick: 2880 });
    expect(tickToBar(0, 480, 4)).toBe(1);
    expect(tickToBar(1920, 480, 4)).toBe(2);
    expect(estimateExportSeconds(snap(), { fromTick: 0, toTick: 1920 })).toBeCloseTo(4, 6);
    expect(estimateExportSeconds(snap({ notes: [note("x", { start: 0, duration: 960 * 700 })] }))).toBeGreaterThan(LONG_EXPORT_SECONDS);
    expect(normalizeMp3Kbps(128)).toBe(128);
    expect(normalizeMp3Kbps(undefined)).toBe(192);
    expect(normalizeMp3Kbps(7)).toBe(192);
  });

  it("note ending exactly at bar 4 still uses the 4-bar minimum (10 s)", async () => {
    await exportAudio(snap({ notes: [note("n1", { start: 7200, duration: 480 })] }));
    expect(__state.offlineCalls[0].duration).toBeCloseTo(10, 6);
  });

  it("muted track is still rendered when it is the soloed track", async () => {
    await exportAudio(snap({ tracks: [track("t1", { muted: true, solo: true })] }));
    expect(__state.offlineCalls).toHaveLength(1);
  });

  it("voices prepared and notes triggered from tick 0 through a Limiter on the master bus", async () => {
    const custom = new Map<string, AudioBuffer>();
    const s = snap();
    await exportAudio(s, { customBuffers: custom });
    const limiter = __state.of("Limiter")[0];
    expect(limiter.connections).toContain("destination");
    expect(prepareVoices).toHaveBeenCalledWith(s.notes, s.tracks, 0, null, limiter, expect.any(Map));
    expect(triggerNotes).toHaveBeenCalledWith(
      expect.objectContaining({ ppq: 480, bpm: 120, startTime: 0, fromTick: 0, toTick: null, customBuffers: custom }),
    );
  });

  it("format mp3 → encodeMp3(rendered, 192 kbps) and progress mapped into 0.7..1", async () => {
    const progress: number[] = [];
    const blob = await exportAudio(snap(), { format: "mp3", onProgress: (p) => progress.push(p) });
    expect(encodeMp3).toHaveBeenCalledWith(__state.renderedBuffer, 192, expect.any(Function));
    expect(blob.type).toBe("audio/mpeg");
    expect(progress).toEqual([0.02, 0.1, 0.7, 0.85, 1, 1]);
  });

  it("samples are interleaved L,R and scaled to 16-bit", async () => {
    const v = await blobView(await exportAudio(snap()));
    const samples = Array.from({ length: 6 }, (_, i) => v.getInt16(44 + i * 2, true));
    expect(samples).toEqual([0, 8191, 16383, -8192, -16384, 32767]);
  });

  it("engine fails while preparing voices → export rejects", async () => {
    vi.mocked(prepareVoices).mockRejectedValueOnce(new Error("sample load failed"));
    await expect(exportAudio(snap())).rejects.toThrow("sample load failed");
  });
});

describe("FE-LIB-07 exportAudioPerTrack", () => {
  const three = (mutedB = false) =>
    snap({
      tracks: [track("a"), track("b", { muted: mutedB }), track("c")],
      notes: [note("1", { trackId: "a" }), note("2", { trackId: "b" }), note("3", { trackId: "c" })],
    });
  const soloFlags = () =>
    vi.mocked(prepareVoices).mock.calls.map((c) =>
      (c[1] as DraftTrack[]).filter((t) => t.solo).map((t) => t.id).join(","),
    );

  it("UTCID01 (N): 3 tracks, none muted → 3 results, each render solos only its track", async () => {
    const out = await exportAudioPerTrack(three());
    expect(out.map((r) => r.track.id)).toEqual(["a", "b", "c"]);
    expect(out.every((r) => r.blob.type === "audio/wav")).toBe(true);
    expect(soloFlags()).toEqual(["a", "b", "c"]);
  });

  it("UTCID02 (N): 3 tracks, 1 muted → 2 results (muted track skipped)", async () => {
    const out = await exportAudioPerTrack(three(true));
    expect(out.map((r) => r.track.id)).toEqual(["a", "c"]);
    expect(__state.offlineCalls).toHaveLength(2);
  });

  it("UTCID03 (B): all tracks muted → [] and nothing rendered", async () => {
    const s = snap({
      tracks: [track("a", { muted: true }), track("b", { muted: true })],
      notes: [note("1", { trackId: "a" }), note("2", { trackId: "b" })],
    });
    expect(await exportAudioPerTrack(s)).toEqual([]);
    expect(__state.offlineCalls).toHaveLength(0);
  });

  it("UTCID04 (B): no tracks → [] and nothing rendered", async () => {
    expect(await exportAudioPerTrack(snap({ tracks: [], notes: [] }))).toEqual([]);
    expect(__state.offlineCalls).toHaveLength(0);
  });

  it("UTCID05 (N): 2 tracks → progress scaled (i+p)/2, last value 1.0", async () => {
    const s = snap({
      tracks: [track("a"), track("b")],
      notes: [note("1", { trackId: "a" }), note("2", { trackId: "b" })],
    });
    const progress: number[] = [];
    await exportAudioPerTrack(s, { onProgress: (p) => progress.push(p) });
    const expected = [0.01, 0.05, 0.35, 0.5, 0.51, 0.55, 0.85, 1];
    expect(progress).toHaveLength(expected.length);
    progress.forEach((p, i) => expect(p).toBeCloseTo(expected[i], 9));
  });

  it("UTCID06 (A): render of the 2nd track rejects → error propagated, no partial result", async () => {
    vi.mocked(prepareVoices).mockResolvedValueOnce(new Map()).mockRejectedValueOnce(new Error("boom"));
    await expect(exportAudioPerTrack(three())).rejects.toThrow("boom");
  });

  it("UTCID07 (N): includeMuted → the muted track is exported too (3 results)", async () => {
    const out = await exportAudioPerTrack(three(true), { includeMuted: true });
    expect(out.map((r) => r.track.id)).toEqual(["a", "b", "c"]);
  });

  it("UTCID08 (N): range → only tracks with notes inside the range are exported", async () => {
    const s = snap({
      tracks: [track("a"), track("b")],
      notes: [note("1", { trackId: "a", start: 0 }), note("2", { trackId: "b", start: 4000 })],
    });
    const out = await exportAudioPerTrack(s, { range: { fromTick: 3840, toTick: 7680 } });
    expect(out.map((r) => r.track.id)).toEqual(["b"]);
  });

  it("track without notes is skipped instead of rendering a silent file", async () => {
    const s = snap({ tracks: [track("a"), track("empty")], notes: [note("1", { trackId: "a" })] });
    const out = await exportAudioPerTrack(s);
    expect(out.map((r) => r.track.id)).toEqual(["a"]);
  });

  it("original snapshot (solo flags) is not mutated", async () => {
    const s = three();
    const before = structuredClone(s);
    await exportAudioPerTrack(s);
    expect(s).toEqual(before);
  });

  it("options (sampleRate / format) are forwarded to every per-track export", async () => {
    await exportAudioPerTrack(three(true), { sampleRate: 22050, format: "mp3" });
    expect(__state.offlineCalls.map((c) => c.sampleRate)).toEqual([22050, 22050]);
    expect(encodeMp3).toHaveBeenCalledTimes(2);
  });
});
