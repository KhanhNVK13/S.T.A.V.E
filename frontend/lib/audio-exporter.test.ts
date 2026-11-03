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

import { exportAudio, exportAudioPerTrack } from "./audio-exporter";
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
  it("FE-LIB-06 UTCID01 (N): default export → WAV Blob with valid RIFF/WAVE PCM 16-bit header", async () => {
    const blob = await exportAudio(snap());
    expect(blob.type).toBe("audio/wav");
    const v = await blobView(blob);
    expect(readAscii(v, 0, 4)).toBe("RIFF");
    expect(readAscii(v, 8, 4)).toBe("WAVE");
    expect(readAscii(v, 12, 4)).toBe("fmt ");
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(2); // channels
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint16(34, true)).toBe(16);
    expect(readAscii(v, 36, 4)).toBe("data");
    expect(v.getUint32(40, true)).toBe(3 * 2 * 2);
    expect(blob.size).toBe(44 + 12);
  });

  it("FE-LIB-06 UTCID02 (N): render length = last note end + 1 bar tail", async () => {
    await exportAudio(snap({ notes: [note("n1", { start: 9000, duration: 600 })] })); // ends at 9600 ticks = 10 s
    expect(__state.offlineCalls[0].duration).toBeCloseTo(12, 6);
  });

  it("FE-LIB-06 UTCID03 (B): empty project → minimum 4 bars + 1 bar tail (10 s)", async () => {
    await exportAudio(snap({ notes: [] }));
    expect(__state.offlineCalls[0].duration).toBeCloseTo(10, 6);
  });

  it("FE-LIB-06 UTCID04 (B): note ending exactly at bar 4 → still the 4-bar minimum (10 s)", async () => {
    await exportAudio(snap({ notes: [note("n1", { start: 7200, duration: 480 })] }));
    expect(__state.offlineCalls[0].duration).toBeCloseTo(10, 6);
  });

  it("FE-LIB-06 UTCID05 (N): custom sample longer than the 1-bar tail extends the tail to its length", async () => {
    const custom = new Map([["s1", { duration: 5 } as AudioBuffer]]);
    await exportAudio(snap({ notes: [] }), { customBuffers: custom });
    expect(__state.offlineCalls[0].duration).toBeCloseTo(13, 6);
  });

  it("FE-LIB-06 UTCID06 (N): onProgress reports 0.02 → 0.1 → 0.7 → 1.0 in order", async () => {
    const progress: number[] = [];
    await exportAudio(snap(), { onProgress: (p) => progress.push(p) });
    expect(progress).toEqual([0.02, 0.1, 0.7, 1.0]);
  });

  it("FE-LIB-06 UTCID07 (N): custom sampleRate 48000 → passed to Tone.Offline (stereo)", async () => {
    await exportAudio(snap(), { sampleRate: 48000 });
    expect(__state.offlineCalls[0]).toMatchObject({ channels: 2, sampleRate: 48000 });
  });

  it("FE-LIB-06 UTCID08 (N): voices prepared & notes triggered from tick 0 through a Limiter on the master bus", async () => {
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

  it("FE-LIB-06 UTCID09 (N): format mp3 → encodeMp3(rendered, 192 kbps) and progress mapped into 0.7..1", async () => {
    const progress: number[] = [];
    const blob = await exportAudio(snap(), { format: "mp3", onProgress: (p) => progress.push(p) });
    expect(encodeMp3).toHaveBeenCalledWith(__state.renderedBuffer, 192, expect.any(Function));
    expect(blob.type).toBe("audio/mpeg");
    expect(progress).toEqual([0.02, 0.1, 0.7, 0.85, 1, 1]);
  });

  it("FE-LIB-06 UTCID10 (N): samples are interleaved L,R and scaled to 16-bit", async () => {
    const v = await blobView(await exportAudio(snap()));
    const samples = Array.from({ length: 6 }, (_, i) => v.getInt16(44 + i * 2, true));
    expect(samples).toEqual([0, 8191, 16383, -8192, -16384, 32767]);
  });

  it("FE-LIB-06 UTCID11 (B): out-of-range samples (±1.5) are clipped to 32767 / -32768", async () => {
    __state.renderedBuffer = makeAudioBuffer([[1.5, -1.5, 1, -1]]);
    const v = await blobView(await exportAudio(snap()));
    expect([0, 1, 2, 3].map((i) => v.getInt16(44 + i * 2, true))).toEqual([32767, -32768, 32767, -32768]);
  });

  it("FE-LIB-06 UTCID12 (A): Tone.Offline render failure → promise rejects, progress never reaches 1", async () => {
    const spy = vi.spyOn(Tone, "Offline").mockRejectedValueOnce(new Error("render failed"));
    const progress: number[] = [];
    await expect(exportAudio(snap(), { onProgress: (p) => progress.push(p) })).rejects.toThrow("render failed");
    expect(progress).not.toContain(1);
    spy.mockRestore();
  });

  it("FE-LIB-06 UTCID13 (A): engine fails while preparing voices → export rejects", async () => {
    vi.mocked(prepareVoices).mockRejectedValueOnce(new Error("sample load failed"));
    await expect(exportAudio(snap())).rejects.toThrow("sample load failed");
  });
});

describe("FE-LIB-07 exportAudioPerTrack", () => {
  const three = () =>
    snap({
      tracks: [track("a"), track("b", { muted: true }), track("c", { solo: true })],
      notes: [note("1", { trackId: "a" }), note("2", { trackId: "b" }), note("3", { trackId: "c" })],
    });

  it("FE-LIB-07 UTCID01 (N): one WAV per unmuted track, in track order", async () => {
    const out = await exportAudioPerTrack(three());
    expect(out.map((r) => r.track.id)).toEqual(["a", "c"]);
    expect(out.every((r) => r.blob.type === "audio/wav")).toBe(true);
    expect(__state.offlineCalls).toHaveLength(2);
  });

  it("FE-LIB-07 UTCID02 (N): each render solos exactly the exported track (others un-soloed)", async () => {
    await exportAudioPerTrack(three());
    const soloFlags = vi.mocked(prepareVoices).mock.calls.map((c) =>
      (c[1] as DraftTrack[]).map((t) => `${t.id}:${t.solo}`).join(","),
    );
    expect(soloFlags).toEqual(["a:true,b:false,c:false", "a:false,b:false,c:true"]);
  });

  it("FE-LIB-07 UTCID03 (N): overall progress is monotonic across tracks and ends at 1", async () => {
    const progress: number[] = [];
    await exportAudioPerTrack(three(), { onProgress: (p) => progress.push(p) });
    expect(progress[0]).toBeCloseTo(0.01, 6);
    expect(progress.at(-1)).toBe(1);
    for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    expect(progress).toContain(0.5); // track 1 done = 1/2
  });

  it("FE-LIB-07 UTCID04 (B): every track muted → empty result, nothing rendered", async () => {
    const out = await exportAudioPerTrack(snap({ tracks: [track("a", { muted: true })] }));
    expect(out).toEqual([]);
    expect(__state.offlineCalls).toHaveLength(0);
  });

  it("FE-LIB-07 UTCID05 (B): project with zero tracks → empty result", async () => {
    expect(await exportAudioPerTrack(snap({ tracks: [], notes: [] }))).toEqual([]);
  });

  it("FE-LIB-07 UTCID06 (B): single track → exactly one file", async () => {
    const out = await exportAudioPerTrack(snap());
    expect(out).toHaveLength(1);
    expect(out[0].track.id).toBe("t1");
  });

  it("FE-LIB-07 UTCID07 (A): original snapshot (solo flags) is not mutated", async () => {
    const s = three();
    const before = structuredClone(s);
    await exportAudioPerTrack(s);
    expect(s).toEqual(before);
  });

  it("FE-LIB-07 UTCID08 (A): a failing track render rejects the whole batch", async () => {
    vi.mocked(prepareVoices).mockResolvedValueOnce(new Map()).mockRejectedValueOnce(new Error("boom"));
    await expect(exportAudioPerTrack(three())).rejects.toThrow("boom");
  });

  it("FE-LIB-07 UTCID09 (N): options (sampleRate / format) are forwarded to every per-track export", async () => {
    await exportAudioPerTrack(three(), { sampleRate: 22050, format: "mp3" });
    expect(__state.offlineCalls.map((c) => c.sampleRate)).toEqual([22050, 22050]);
    expect(encodeMp3).toHaveBeenCalledTimes(2);
  });
});
