/**
 * wav-recorder.test.ts — Report 5, voice recording (UC-53/54/55, BR-56).
 *   FE-LIB-36..38 useAudioRecorder: start / stop / reset
 *   FE-LIB-39 decodeRecording   FE-LIB-40 normalizeForStorage
 *   FE-LIB-41 encodeWav         FE-LIB-42 computeWaveformPeaks
 * Owner: Haidnde180202.
 *
 * jsdom has no MediaRecorder / AudioContext / OfflineAudioContext /
 * navigator.mediaDevices — all are faked below. The fake MediaRecorder
 * follows the MediaStream Recording spec: when every track of the recorded
 * stream ends (e.g. track.stop()), the recorder stops on its own and fires
 * dataavailable + stop.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAudioRecorder, MAX_RECORDING_SEC } from "./use-audio-recorder";
import { decodeRecording, normalizeForStorage, encodeWav, computeWaveformPeaks, STORAGE_SAMPLE_RATE } from "./wav-encoder";
import { makeAudioBuffer, blobView, readAscii, readBlob } from "./test-helpers/fake-audio";

// ── Browser API fakes ─────────────────────────────────────────
class FakeTrack {
  readyState = "live";
  onended: (() => void) | null = null;
  constructor(private stream: FakeStream) {}
  stop = vi.fn(() => {
    if (this.readyState === "ended") return;
    this.readyState = "ended"; // local stop() does NOT fire `ended` on the track (spec)
    this.stream.trackEnded();
  });
  /** Device unplugged / taken by another app: fires `ended`. */
  endFromDevice() {
    this.readyState = "ended";
    this.onended?.();
    this.stream.trackEnded();
  }
}
class FakeStream {
  tracks = [new FakeTrack(this)];
  recorders: FakeMediaRecorder[] = [];
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
  trackEnded() {
    if (this.tracks.every((t) => t.readyState === "ended")) {
      this.recorders.forEach((r) => queueMicrotask(() => r.state === "recording" && r.stop()));
    }
  }
}
let nextChunks: Blob[] = [];
class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    if (this.state !== "recording") return;
    this.state = "inactive";
    for (const data of nextChunks) this.ondataavailable?.({ data });
    this.onstop?.();
  });
  constructor(public stream: FakeStream) {
    stream.recorders.push(this);
    FakeMediaRecorder.instances.push(this);
  }
}
let analyserLevel = 0;
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  close = vi.fn(async () => {});
  decodeAudioData = vi.fn(async (_: ArrayBuffer) => makeAudioBuffer([[0.1, 0.2]]));
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createAnalyser() {
    return {
      fftSize: 0,
      getFloatTimeDomainData: (arr: Float32Array) => arr.fill(analyserLevel),
    };
  }
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
}

let stream: FakeStream;
let getUserMedia: ReturnType<typeof vi.fn>;
let rafCallbacks: FrameRequestCallback[];

beforeEach(() => {
  FakeMediaRecorder.instances = [];
  FakeAudioContext.instances = [];
  nextChunks = [new Blob(["abc"], { type: "audio/webm" })];
  analyserLevel = 0;
  rafCallbacks = [];
  stream = new FakeStream();
  getUserMedia = vi.fn(async () => stream);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true, writable: true });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("requestAnimationFrame", vi.fn((cb: FrameRequestCallback) => rafCallbacks.push(cb)));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function startRecording(maxSec?: number) {
  const hook = renderHook(() => useAudioRecorder(maxSec));
  await act(async () => {
    await hook.result.current.start();
  });
  return hook;
}
const recorder = () => FakeMediaRecorder.instances.at(-1)!;

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-36 useAudioRecorder.start", () => {
  it("FE-LIB-36 UTCID01 (N): microphone granted → status 'recording', MediaRecorder started", async () => {
    const { result } = await startRecording();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(recorder().start).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("recording");
    expect(result.current.error).toBeNull();
  });

  it("FE-LIB-36 UTCID02 (N): while the permission prompt is open → status 'requesting'", async () => {
    let grant!: (s: FakeStream) => void;
    getUserMedia.mockImplementation(() => new Promise((r) => (grant = r)));
    const { result } = renderHook(() => useAudioRecorder());
    let p!: Promise<void>;
    act(() => {
      p = result.current.start();
    });
    expect(result.current.status).toBe("requesting");
    await act(async () => {
      grant(stream);
      await p;
    });
    expect(result.current.status).toBe("recording");
  });

  it("FE-LIB-36 UTCID03 (A): permission denied (NotAllowedError) → idle + exception 2.E1 message", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const { result } = await startRecording();
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Bạn đã từ chối quyền dùng micro. Không ghi âm được nếu chưa cấp quyền.");
  });

  it("FE-LIB-36 UTCID04 (A): SecurityError (insecure context) → same 2.E1 message", async () => {
    getUserMedia.mockRejectedValue(new DOMException("insecure", "SecurityError"));
    const { result } = await startRecording();
    expect(result.current.error).toContain("từ chối quyền dùng micro");
  });

  it("FE-LIB-36 UTCID05 (A): no microphone (NotFoundError / OverconstrainedError) → exception 2.E2 message", async () => {
    for (const name of ["NotFoundError", "OverconstrainedError"]) {
      getUserMedia.mockRejectedValueOnce(new DOMException("none", name));
      const { result } = await startRecording();
      expect(result.current.error).toBe("Không tìm thấy micro nào trên thiết bị này.");
    }
  });

  it("FE-LIB-36 UTCID06 (A): any other failure → generic 'cannot access microphone' message", async () => {
    getUserMedia.mockRejectedValue(new Error("weird"));
    const { result } = await startRecording();
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Không truy cập được micro.");
  });

  it("FE-LIB-36 UTCID07 (N): elapsed time ticks ~10×/s while recording", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const { result } = await startRecording();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.elapsedSec).toBeCloseTo(1.5, 1);
  });

  it("FE-LIB-36 UTCID08 (B): reaching the limit (BR-56, custom 2 s) auto-stops with a warning; recording kept", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const { result } = await startRecording(2);
    act(() => {
      vi.advanceTimersByTime(1900);
    });
    expect(result.current.status).toBe("recording");
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.status).toBe("recorded");
    expect(result.current.warning).toBe("Đã đạt giới hạn 2 giây nên bản ghi tự dừng.");
  });

  it("FE-LIB-36 UTCID09 (B): default limit is 3 minutes (180 s) and is worded in minutes", async () => {
    expect(MAX_RECORDING_SEC).toBe(180);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const { result } = await startRecording();
    act(() => {
      vi.advanceTimersByTime(180_000);
    });
    expect(result.current.warning).toBe("Đã đạt giới hạn 3 phút nên bản ghi tự dừng.");
  });

  it("FE-LIB-36 UTCID10 (A): microphone disconnected mid-recording (4.E1) → warning, partial recording kept", async () => {
    const { result } = await startRecording();
    await act(async () => {
      stream.tracks[0].endFromDevice();
    });
    expect(result.current.warning).toBe("Bản ghi kết thúc sớm vì micro bị ngắt. Phần đã ghi vẫn được giữ.");
    expect(result.current.status).toBe("recorded");
    expect(result.current.blob?.size).toBe(3);
  });

  it("FE-LIB-36 UTCID11 (N): live level = 3 × RMS of the analyser signal (0.1 → 0.3)", async () => {
    analyserLevel = 0.1;
    const { result } = await startRecording();
    act(() => {
      rafCallbacks.shift()!(0);
    });
    expect(result.current.level).toBeCloseTo(0.3, 6);
  });

  it("FE-LIB-36 UTCID12 (B): loud signal level is capped at 1", async () => {
    analyserLevel = 0.9;
    const { result } = await startRecording();
    act(() => {
      rafCallbacks.shift()!(0);
    });
    expect(result.current.level).toBe(1);
  });

  it("FE-LIB-36 UTCID13 (N): starting again clears the previous error / blob", async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    const { result } = await startRecording();
    expect(result.current.error).not.toBeNull();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("recording");
  });
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-37 useAudioRecorder.stop", () => {
  it("FE-LIB-37 UTCID01 (N): stop while recording → Blob of recorded chunks, status 'recorded'", async () => {
    nextChunks = [new Blob(["ab"]), new Blob(["cde"])];
    const { result } = await startRecording();
    act(() => result.current.stop());
    expect(result.current.status).toBe("recorded");
    expect(result.current.blob?.size).toBe(5);
    expect(result.current.blob?.type).toBe("audio/webm;codecs=opus");
  });

  it("FE-LIB-37 UTCID02 (N): stop releases the microphone and closes the metering AudioContext", async () => {
    const { result } = await startRecording();
    act(() => result.current.stop());
    expect(stream.tracks[0].stop).toHaveBeenCalled();
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(result.current.level).toBe(0);
  });

  it("FE-LIB-37 UTCID03 (B): stop before ever starting → no-op, no throw", () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(() => act(() => result.current.stop())).not.toThrow();
    expect(result.current.status).toBe("idle");
  });

  it("FE-LIB-37 UTCID04 (A): nothing captured (0 bytes) → idle + 'empty recording' error", async () => {
    nextChunks = [];
    const { result } = await startRecording();
    act(() => result.current.stop());
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Bản ghi rỗng — không có dữ liệu âm thanh nào được thu.");
  });

  it("FE-LIB-37 UTCID05 (B): recorder reports no mimeType → Blob typed audio/webm", async () => {
    const { result } = await startRecording();
    recorder().mimeType = "";
    act(() => result.current.stop());
    expect(result.current.blob?.type).toBe("audio/webm");
  });

  it("FE-LIB-37 UTCID06 (A): calling stop twice → recorder stopped once", async () => {
    const { result } = await startRecording();
    act(() => {
      result.current.stop();
      result.current.stop();
    });
    expect(recorder().stop).toHaveBeenCalledTimes(1);
  });

  it("FE-LIB-37 UTCID07 (B): zero-size chunks are ignored", async () => {
    nextChunks = [new Blob([]), new Blob(["xy"]), new Blob([])];
    const { result } = await startRecording();
    act(() => result.current.stop());
    expect(result.current.blob?.size).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-38 useAudioRecorder.reset", () => {
  it("FE-LIB-38 UTCID01 (N): after a recording → everything back to the initial state", async () => {
    const { result } = await startRecording();
    act(() => result.current.stop());
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ status: "idle", blob: null, elapsedSec: 0, level: 0, error: null, warning: null });
  });

  it("FE-LIB-38 UTCID02 (A): reset after an error → error cleared", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const { result } = await startRecording();
    act(() => result.current.reset());
    expect(result.current.error).toBeNull();
  });

  it("FE-LIB-38 UTCID03 (B): reset while idle → stays idle, no throw", () => {
    const { result } = renderHook(() => useAudioRecorder());
    act(() => result.current.reset());
    expect(result.current.status).toBe("idle");
  });

  it("FE-LIB-38 UTCID04 (N): reset during recording releases the microphone and stops the timer", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const { result } = await startRecording();
    act(() => result.current.reset());
    expect(stream.tracks[0].stop).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.elapsedSec).toBe(0);
  });

  it("FE-LIB-38 UTCID05 (A): reset during recording discards it — no late Blob / 'recorded' status afterwards", async () => {
    const { result } = await startRecording();
    await act(async () => {
      result.current.reset();
    });
    await act(async () => {}); // let the recorder's own stop event fire
    expect(result.current.status).toBe("idle");
    expect(result.current.blob).toBeNull();
  });

  it("FE-LIB-38 UTCID06 (N): unmounting while recording releases the microphone", async () => {
    const { unmount } = await startRecording();
    unmount();
    expect(stream.tracks[0].stop).toHaveBeenCalled();
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-39 decodeRecording", () => {
  beforeEach(() => {
    // jsdom's Blob lacks arrayBuffer(); browsers have it.
    if (!Blob.prototype.arrayBuffer) {
      Object.defineProperty(Blob.prototype, "arrayBuffer", {
        configurable: true,
        value(this: Blob) {
          return readBlob(this);
        },
      });
    }
  });

  it("FE-LIB-39 UTCID01 (N): decodes the blob bytes with the browser decoder and returns the AudioBuffer", async () => {
    const out = await decodeRecording(new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" }));
    const ctx = FakeAudioContext.instances[0];
    expect((ctx.decodeAudioData.mock.calls[0][0] as ArrayBuffer).byteLength).toBe(4);
    expect(out.getChannelData(0)).toEqual(Float32Array.from([0.1, 0.2]));
  });

  it("FE-LIB-39 UTCID02 (N): the temporary AudioContext is closed after decoding", async () => {
    await decodeRecording(new Blob(["x"]));
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalledTimes(1);
  });

  it("FE-LIB-39 UTCID03 (A): undecodable data → rejects, and the AudioContext is still closed", async () => {
    vi.stubGlobal(
      "AudioContext",
      class extends FakeAudioContext {
        decodeAudioData = vi.fn(async () => {
          throw new DOMException("Unable to decode", "EncodingError");
        });
      },
    );
    await expect(decodeRecording(new Blob(["garbage"]))).rejects.toThrow("Unable to decode");
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalledTimes(1);
  });

  it("FE-LIB-39 UTCID04 (B): empty blob → an empty ArrayBuffer is handed to the decoder", async () => {
    await decodeRecording(new Blob([]));
    expect((FakeAudioContext.instances[0].decodeAudioData.mock.calls[0][0] as ArrayBuffer).byteLength).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-40 normalizeForStorage", () => {
  class FakeOffline {
    static instances: FakeOffline[] = [];
    destination = { kind: "destination" };
    source = { buffer: null as AudioBuffer | null, connect: vi.fn(), start: vi.fn() };
    rendered = makeAudioBuffer([[0]], 44100);
    startRendering = vi.fn(async () => this.rendered);
    constructor(public channels: number, public frames: number, public rate: number) {
      FakeOffline.instances.push(this);
    }
    createBufferSource() {
      return this.source;
    }
  }
  beforeEach(() => {
    FakeOffline.instances = [];
    vi.stubGlobal("OfflineAudioContext", FakeOffline);
  });
  const buf = (channels: number, rate: number, seconds: number) =>
    makeAudioBuffer(Array.from({ length: channels }, () => new Float32Array(Math.round(rate * seconds))), rate);

  it("FE-LIB-40 UTCID01 (B): already mono 44.1 kHz → returned as-is, no rendering", async () => {
    const b = buf(1, 44100, 0.5);
    await expect(normalizeForStorage(b)).resolves.toBe(b);
    expect(FakeOffline.instances).toHaveLength(0);
  });

  it("FE-LIB-40 UTCID02 (B): mono below 44.1 kHz (22.05 kHz) → returned as-is (no upsampling)", async () => {
    const b = buf(1, 22050, 0.5);
    await expect(normalizeForStorage(b)).resolves.toBe(b);
  });

  it("FE-LIB-40 UTCID03 (N): stereo 48 kHz → rendered to 1 channel at 44.1 kHz", async () => {
    const b = buf(2, 48000, 2);
    const out = await normalizeForStorage(b);
    const off = FakeOffline.instances[0];
    expect([off.channels, off.frames, off.rate]).toEqual([1, 88200, STORAGE_SAMPLE_RATE]);
    expect(off.source.buffer).toBe(b);
    expect(off.source.connect).toHaveBeenCalledWith(off.destination);
    expect(off.source.start).toHaveBeenCalled();
    expect(out).toBe(off.rendered);
  });

  it("FE-LIB-40 UTCID04 (N): mono 48 kHz → resampled to 44.1 kHz", async () => {
    await normalizeForStorage(buf(1, 48000, 1));
    expect(FakeOffline.instances[0].rate).toBe(44100);
  });

  it("FE-LIB-40 UTCID05 (N): stereo 44.1 kHz → down-mixed to mono", async () => {
    await normalizeForStorage(buf(2, 44100, 1));
    expect(FakeOffline.instances[0].channels).toBe(1);
  });

  it("FE-LIB-40 UTCID06 (B): zero-length recording → frame count floored at 1", async () => {
    await normalizeForStorage(makeAudioBuffer([[], []], 48000));
    expect(FakeOffline.instances[0].frames).toBe(1);
  });

  it("FE-LIB-40 UTCID07 (B): fractional duration → frame count rounded up (no truncated tail)", async () => {
    await normalizeForStorage(makeAudioBuffer([new Float32Array(1), new Float32Array(1)], 48000)); // 1/48000 s
    expect(FakeOffline.instances[0].frames).toBe(1);
    await normalizeForStorage(makeAudioBuffer([new Float32Array(48001), new Float32Array(48001)], 48000));
    expect(FakeOffline.instances[1].frames).toBe(Math.ceil((48001 / 48000) * 44100));
  });

  it("FE-LIB-40 UTCID08 (A): offline rendering fails → promise rejects", async () => {
    vi.stubGlobal(
      "OfflineAudioContext",
      class extends FakeOffline {
        startRendering = vi.fn(async () => {
          throw new Error("render failed");
        });
      },
    );
    await expect(normalizeForStorage(buf(2, 48000, 1))).rejects.toThrow("render failed");
  });
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-41 encodeWav", () => {
  it("FE-LIB-41 UTCID01 (N): mono 44.1 kHz → RIFF/WAVE PCM header with correct sizes and rates", async () => {
    const blob = encodeWav(makeAudioBuffer([[0, 0, 0, 0]], 44100));
    expect(blob.type).toBe("audio/wav");
    const v = await blobView(blob);
    expect([readAscii(v, 0, 4), readAscii(v, 8, 4), readAscii(v, 12, 4), readAscii(v, 36, 4)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(v.getUint32(4, true)).toBe(36 + 8);
    expect(v.getUint32(16, true)).toBe(16);
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(28, true)).toBe(88200);
    expect(v.getUint16(32, true)).toBe(2);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8);
    expect(blob.size).toBe(52);
  });

  it("FE-LIB-41 UTCID02 (N): stereo → samples interleaved L,R,L,R; block align 4", async () => {
    const v = await blobView(encodeWav(makeAudioBuffer([[0.5, -0.5], [0.25, -0.25]], 48000)));
    expect(v.getUint16(32, true)).toBe(4);
    expect([0, 1, 2, 3].map((i) => v.getInt16(44 + i * 2, true))).toEqual([16383, 8191, -16384, -8192]);
  });

  it("FE-LIB-41 UTCID03 (B): full-scale ±1 and 0 → 32767 / -32768 / 0", async () => {
    const v = await blobView(encodeWav(makeAudioBuffer([[1, -1, 0]])));
    expect([0, 1, 2].map((i) => v.getInt16(44 + i * 2, true))).toEqual([32767, -32768, 0]);
  });

  it("FE-LIB-41 UTCID04 (B): out-of-range samples (±1.5) are clipped instead of wrapping around", async () => {
    const v = await blobView(encodeWav(makeAudioBuffer([[1.5, -1.5]])));
    expect([v.getInt16(44, true), v.getInt16(46, true)]).toEqual([32767, -32768]);
  });

  it("FE-LIB-41 UTCID05 (B): empty buffer → 44-byte header only, data size 0", async () => {
    const blob = encodeWav(makeAudioBuffer([[]]));
    expect(blob.size).toBe(44);
    expect((await blobView(blob)).getUint32(40, true)).toBe(0);
  });

  it("FE-LIB-41 UTCID06 (A): NaN sample (corrupt decode) → written as silence (0), no throw", async () => {
    const v = await blobView(encodeWav(makeAudioBuffer([[Number.NaN, 0.5]])));
    expect(v.getInt16(44, true)).toBe(0);
    expect(v.getInt16(46, true)).toBe(16383);
  });

  it("FE-LIB-41 UTCID07 (N): 3-minute mono recording (BR-56) fits the 20 MB limit (~15.9 MB)", () => {
    const blob = encodeWav(makeAudioBuffer([new Float32Array(180 * 44100)]));
    expect(blob.size).toBe(44 + 180 * 44100 * 2);
    expect(blob.size).toBeLessThan(20 * 1024 * 1024);
  });
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-42 computeWaveformPeaks", () => {
  it("FE-LIB-42 UTCID01 (N): max absolute amplitude per bucket", () => {
    expect(computeWaveformPeaks(makeAudioBuffer([[0.1, -0.5, 0.3, 0.2]]), 2)).toEqual([0.5, 0.30000001192092896]);
  });

  it("FE-LIB-42 UTCID02 (N): negative peaks are reported as positive magnitudes", () => {
    expect(computeWaveformPeaks(makeAudioBuffer([[-1, -0.25]]), 1)).toEqual([1]);
  });

  it("FE-LIB-42 UTCID03 (B): bucketCount equal to sample count → one sample per bucket", () => {
    expect(computeWaveformPeaks(makeAudioBuffer([[0.5, -0.25, 0]]), 3)).toEqual([0.5, 0.25, 0]);
  });

  it("FE-LIB-42 UTCID04 (B): more buckets than samples → exactly bucketCount values, extra buckets 0", () => {
    const peaks = computeWaveformPeaks(makeAudioBuffer([[0.5, 0.25]]), 4);
    expect(peaks).toEqual([0.5, 0.25, 0, 0]);
  });

  it("FE-LIB-42 UTCID05 (B): bucketCount 0 → empty array", () => {
    expect(computeWaveformPeaks(makeAudioBuffer([[0.5]]), 0)).toEqual([]);
  });

  it("FE-LIB-42 UTCID06 (B): silent recording → all peaks 0", () => {
    expect(computeWaveformPeaks(makeAudioBuffer([new Float32Array(100)]), 10)).toEqual(new Array(10).fill(0));
  });

  it("FE-LIB-42 UTCID07 (N): only channel 0 is analysed", () => {
    expect(computeWaveformPeaks(makeAudioBuffer([[0, 0], [1, 1]]), 1)).toEqual([0]);
  });

  it("FE-LIB-42 UTCID08 (A): length not divisible by bucketCount → a spike in the trailing samples must still show up", () => {
    const data = new Float32Array(10);
    data[9] = 1; // loud click at the very end (UC-54: user must see it to trim it)
    const peaks = computeWaveformPeaks(makeAudioBuffer([data]), 3);
    expect(Math.max(...peaks)).toBe(1);
  });
});
