import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BASIC_PITCH_MODEL_URL,
  BASIC_PITCH_SAMPLE_RATE,
  MAX_TRANSCRIBE_SEC,
  computeTranscribeRange,
  extractMidiNotesFromFrames,
  fetchAndDecodeAudio,
  resampleAudioForBasicPitch,
  runBasicPitchInference,
  type RawBasicPitchFrames,
} from "./audio-to-midi";

const evaluateModelMock = vi.fn();
const basicPitchCtorMock = vi.fn();

vi.mock("@spotify/basic-pitch", () => ({
  BasicPitch: class MockBasicPitch {
    model = Promise.resolve({});
    constructor(modelUrl: string) {
      basicPitchCtorMock(modelUrl);
    }
    evaluateModel(
      buffer: AudioBuffer,
      onComplete: (f: number[][], o: number[][], c: number[][]) => void,
      onPercent: (p: number) => void,
    ) {
      return evaluateModelMock(buffer, onComplete, onPercent);
    }
  },
}));

function makeEmptyMatrix(rows: number, cols = 88): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

function makeRawSingleNote({
  pitchMidi = 60,
  startFrame = 10,
  endFrame = 25,
  onsetVal = 0.7,
  frameVal = 0.6,
  totalFrames = 40,
}: {
  pitchMidi?: number;
  startFrame?: number;
  endFrame?: number;
  onsetVal?: number;
  frameVal?: number;
  totalFrames?: number;
} = {}): RawBasicPitchFrames {
  const frames = makeEmptyMatrix(totalFrames, 88);
  const onsets = makeEmptyMatrix(totalFrames, 88);
  const contours = makeEmptyMatrix(totalFrames, 264);
  const freqIdx = pitchMidi - 21;
  onsets[startFrame][freqIdx] = onsetVal;
  for (let f = startFrame; f < endFrame; f += 1) {
    frames[f][freqIdx] = frameVal;
  }
  return { frames, onsets, contours };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  evaluateModelMock.mockReset();
  basicPitchCtorMock.mockReset();
});

describe("computeTranscribeRange", () => {
  it("clamps trim window and caps analyzed duration at MAX_TRANSCRIBE_SEC", () => {
    expect(MAX_TRANSCRIBE_SEC).toBe(45);
    expect(computeTranscribeRange(120, 10, 80)).toEqual({
      startSec: 10,
      endSec: 55,
      durationSec: 45,
      wasCapped: true,
    });
    expect(computeTranscribeRange(12, -2, 20)).toEqual({
      startSec: 0,
      endSec: 12,
      durationSec: 12,
      wasCapped: false,
    });
  });
});

describe("resampleAudioForBasicPitch", () => {
  it("slices trimmed audio, caps at 45s, and renders mono 22050 Hz via OfflineAudioContext", async () => {
    const startSpy = vi.fn();
    const connectSpy = vi.fn();
    const rendered = { sampleRate: 22050, numberOfChannels: 1, length: 220500 } as AudioBuffer;
    const ctorArgs: unknown[] = [];

    class FakeOfflineAudioContext {
      destination = {};
      constructor(channels: number, length: number, sampleRate: number) {
        ctorArgs.push([channels, length, sampleRate]);
      }
      createBufferSource() {
        return { buffer: null, connect: connectSpy, start: startSpy };
      }
      startRendering = vi.fn(async () => rendered);
    }

    vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);

    const input = { duration: 90, sampleRate: 48000, numberOfChannels: 2, length: 90 * 48000 } as AudioBuffer;
    const out = await resampleAudioForBasicPitch(input, 5, 70);

    expect(out).toBe(rendered);
    expect(ctorArgs[0]).toEqual([1, 45 * BASIC_PITCH_SAMPLE_RATE, BASIC_PITCH_SAMPLE_RATE]);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledWith(0, 5, 45);
  });

  it("throws when the trimmed duration is zero", async () => {
    const input = { duration: 10, sampleRate: 44100, numberOfChannels: 1, length: 441000 } as AudioBuffer;
    await expect(resampleAudioForBasicPitch(input, 5, 5)).rejects.toThrow(/empty/i);
  });
});

describe("runBasicPitchInference", () => {
  it("loads BasicPitch with self-hosted model path, collects batches, and reports progress 0..100", async () => {
    const progress: number[] = [];
    evaluateModelMock.mockImplementation(async (_buf, onComplete, onPercent) => {
      onPercent(0);
      onComplete([[0.1]], [[0.2]], [[0.3]]);
      onPercent(0.5);
      onComplete([[0.4]], [[0.5]], [[0.6]]);
      onPercent(1);
    });

    const mono22k = { sampleRate: 22050, numberOfChannels: 1, length: 22050 } as AudioBuffer;
    const raw = await runBasicPitchInference(mono22k, (pct) => progress.push(pct));

    expect(basicPitchCtorMock).toHaveBeenCalledWith(BASIC_PITCH_MODEL_URL);
    expect(raw).toEqual({
      frames: [[0.1], [0.4]],
      onsets: [[0.2], [0.5]],
      contours: [[0.3], [0.6]],
    });
    expect(progress).toEqual([0, 50, 100]);
  });
});

describe("extractMidiNotesFromFrames", () => {
  it("converts Basic Pitch frames to integer STAVE ticks with pitch and velocity clamped", () => {
    const raw = makeRawSingleNote({ pitchMidi: 60, startFrame: 20, endFrame: 35, onsetVal: 0.75, frameVal: 0.65 });
    const notes = extractMidiNotesFromFrames(raw, {
      tempo: 120,
      ppq: 480,
      onsetThreshold: 0.5,
      frameThreshold: 0.3,
      quantizeDivision: null,
    });

    expect(notes).toHaveLength(1);
    expect(notes[0].pitch).toBe(60);
    expect(notes[0].start).toBeGreaterThan(0);
    expect(notes[0].duration).toBeGreaterThanOrEqual(1);
    expect(notes[0].velocity).toBeGreaterThanOrEqual(1);
    expect(notes[0].velocity).toBeLessThanOrEqual(127);
    expect(notes[0].id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("applies onsetThreshold and frameThreshold without mutating cached raw frames", () => {
    const raw = makeRawSingleNote({ pitchMidi: 64, startFrame: 10, endFrame: 24, onsetVal: 0.55, frameVal: 0.45 });
    const snapshotBefore = JSON.stringify(raw);

    const detected = extractMidiNotesFromFrames(raw, {
      tempo: 120,
      ppq: 480,
      onsetThreshold: 0.4,
      frameThreshold: 0.3,
      minFreqHz: 100,
      maxFreqHz: 1000,
    });
    expect(detected).toHaveLength(1);
    expect(JSON.stringify(raw)).toBe(snapshotBefore);

    const suppressed = extractMidiNotesFromFrames(raw, {
      tempo: 120,
      ppq: 480,
      onsetThreshold: 0.8,
      frameThreshold: 0.6,
    });
    expect(suppressed).toHaveLength(0);
  });

  it("quantizes start and duration to the requested grid division", () => {
    const raw = makeRawSingleNote({ pitchMidi: 67, startFrame: 11, endFrame: 23, onsetVal: 0.8, frameVal: 0.7 });
    const ppq = 480;
    const step16 = Math.round((ppq * 4) / 16); // 120 ticks
    const step8 = Math.round((ppq * 4) / 8); // 240 ticks

    const q16 = extractMidiNotesFromFrames(raw, {
      tempo: 120,
      ppq,
      quantizeDivision: 16,
    });
    expect(q16).toHaveLength(1);
    expect(q16[0].start % step16).toBe(0);
    expect(q16[0].duration % step16).toBe(0);
    expect(q16[0].duration).toBeGreaterThanOrEqual(step16);

    const q8 = extractMidiNotesFromFrames(raw, {
      tempo: 120,
      ppq,
      quantizeDivision: 8,
    });
    expect(q8).toHaveLength(1);
    expect(q8[0].start % step8).toBe(0);
    expect(q8[0].duration % step8).toBe(0);
  });

  it("returns empty array for empty raw matrices", () => {
    expect(
      extractMidiNotesFromFrames(
        { frames: [], onsets: [], contours: [] },
        { tempo: 120, ppq: 480 },
      ),
    ).toEqual([]);
  });
});

describe("fetchAndDecodeAudio", () => {
  it("fetches audio bytes, decodes via AudioContext, and closes context", async () => {
    const decoded = { duration: 4, sampleRate: 44100, numberOfChannels: 1 } as AudioBuffer;
    const closeSpy = vi.fn(async () => {});
    const decodeSpy = vi.fn(async () => decoded);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(16),
      })),
    );
    vi.stubGlobal(
      "AudioContext",
      class FakeAudioContext {
        decodeAudioData = decodeSpy;
        close = closeSpy;
      },
    );

    const result = await fetchAndDecodeAudio("https://example.test/sketch.wav");
    expect(result).toBe(decoded);
    expect(decodeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("throws when fetch fails with non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    await expect(fetchAndDecodeAudio("https://example.test/missing.wav")).rejects.toThrow(/404/);
  });
});
