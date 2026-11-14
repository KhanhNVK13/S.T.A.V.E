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
import { renderHook, act, cleanup } from "@testing-library/react";
import { useAudioRecorder, MAX_RECORDING_SEC } from "./use-audio-recorder";
import { decodeRecording, normalizeForStorage, encodeWav, computeWaveformPeaks, STORAGE_SAMPLE_RATE } from "./wav-encoder";
import { setLang } from "./i18n";
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
afterEach(async () => {
  await act(async () => {
    cleanup();
  });
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
beforeEach(() => setLang("vi"));

describe("FE-LIB-36 useAudioRecorder.start", () => {
  const fakeTimers = () => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  const rejectWith = async (err: unknown) => {
    getUserMedia.mockRejectedValue(err);
    return startRecording();
  };

  it("UTCID01 (N): mic granted, stop() after 5 s with 10 KB → 'recording' then 'recorded', blob 10 KB", async () => {
    fakeTimers();
    nextChunks = [new Blob([new Uint8Array(10 * 1024)])];
    const { result } = await startRecording();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.status).toBe("recording");
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => result.current.stop());
    expect(result.current.status).toBe("recorded");
    expect(result.current.blob?.size).toBe(10 * 1024);
  });

  it("UTCID02 (A): NotAllowedError → idle + permission-denied message", async () => {
    const { result } = await rejectWith(new DOMException("denied", "NotAllowedError"));
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Bạn đã từ chối quyền dùng micro. Không ghi âm được nếu chưa cấp quyền.");
  });

  it("UTCID03 (A): SecurityError → idle + permission-denied message", async () => {
    const { result } = await rejectWith(new DOMException("insecure", "SecurityError"));
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Bạn đã từ chối quyền dùng micro. Không ghi âm được nếu chưa cấp quyền.");
  });

  it("UTCID04 (A): NotFoundError → idle + 'no microphone' message", async () => {
    const { result } = await rejectWith(new DOMException("none", "NotFoundError"));
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Không tìm thấy micro nào trên thiết bị này.");
  });

  it("UTCID05 (A): OverconstrainedError → idle + 'no microphone' message", async () => {
    const { result } = await rejectWith(new DOMException("none", "OverconstrainedError"));
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Không tìm thấy micro nào trên thiết bị này.");
  });

  it("UTCID06 (A): generic Error → idle + 'cannot access microphone'", async () => {
    const { result } = await rejectWith(new Error("weird"));
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Không truy cập được micro.");
  });

  it("UTCID07 (B): elapsed reaches 180 s (default) → auto-stop with the 3-minute warning", async () => {
    expect(MAX_RECORDING_SEC).toBe(180);
    fakeTimers();
    const { result } = await startRecording();
    act(() => {
      vi.advanceTimersByTime(180_000);
    });
    expect(result.current.status).toBe("recorded");
    expect(result.current.warning).toBe("Đã đạt giới hạn 3 phút nên bản ghi tự dừng.");
  });

  it("UTCID08 (B): elapsed 179.9 s → still 'recording', no warning", async () => {
    fakeTimers();
    const { result } = await startRecording();
    act(() => {
      vi.advanceTimersByTime(179_900);
    });
    expect(result.current.status).toBe("recording");
    expect(result.current.warning).toBeNull();
  });

  it.each([
    ["UTCID09 (N)", 120, "Đã đạt giới hạn 2 phút nên bản ghi tự dừng."],
    ["UTCID10 (B)", 90, "Đã đạt giới hạn 90 giây nên bản ghi tự dừng."],
    ["UTCID11 (B)", 30, "Đã đạt giới hạn 30 giây nên bản ghi tự dừng."],
  ])("%s: maxSec %i reached → warning %s", async (_id, maxSec, warning) => {
    fakeTimers();
    const { result } = await startRecording(maxSec);
    act(() => {
      vi.advanceTimersByTime(maxSec * 1000);
    });
    expect(result.current.status).toBe("recorded");
    expect(result.current.warning).toBe(warning);
  });

  it("UTCID12 (A): mic track ended mid-recording → 'recorded', early-stop warning, partial data kept", async () => {
    const { result } = await startRecording();
    await act(async () => {
      stream.tracks[0].endFromDevice();
    });
    expect(result.current.status).toBe("recorded");
    expect(result.current.warning).toBe("Bản ghi kết thúc sớm vì micro bị ngắt. Phần đã ghi vẫn được giữ.");
    expect(result.current.blob?.size).toBe(3);
  });

  it("UTCID13 (A): stop() with no data chunks → idle + empty-recording error", async () => {
    nextChunks = [];
    const { result } = await startRecording();
    act(() => result.current.stop());
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Bản ghi rỗng — không có dữ liệu âm thanh nào được thu.");
  });

  it("UTCID14 (N): recorder.mimeType \"\" → blob.type audio/webm", async () => {
    fakeTimers();
    nextChunks = [new Blob([new Uint8Array(10 * 1024)])];
    const { result } = await startRecording();
    recorder().mimeType = "";
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => result.current.stop());
    expect(result.current.blob?.type).toBe("audio/webm");
    expect(result.current.blob?.size).toBe(10 * 1024);
  });

  it("UTCID15 (B): analyser RMS 0.5 (× 3 = 1.5) → level clamped to 1", async () => {
    analyserLevel = 0.5;
    const { result } = await startRecording();
    act(() => {
      rafCallbacks.shift()!(0);
    });
    expect(result.current.level).toBe(1);
  });

  it("UTCID16 (A): MediaRecorder constructor throws → NotSupportedError propagated; status stays 'requesting'", async () => {
    vi.stubGlobal(
      "MediaRecorder",
      class {
        constructor() {
          throw new DOMException("not supported", "NotSupportedError");
        }
      },
    );
    const { result } = renderHook(() => useAudioRecorder());
    let caught: unknown;
    await act(async () => {
      await result.current.start().catch((e) => (caught = e));
    });
    expect((caught as DOMException).name).toBe("NotSupportedError");
    expect(result.current.status).toBe("requesting");
  });

  it("while the permission prompt is open → status 'requesting'", async () => {
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

  it("live level = 3 × RMS of the analyser signal (0.1 → 0.3)", async () => {
    analyserLevel = 0.1;
    const { result } = await startRecording();
    act(() => {
      rafCallbacks.shift()!(0);
    });
    expect(result.current.level).toBeCloseTo(0.3, 6);
  });

  it("starting again clears the previous error", async () => {
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
  it("UTCID01 (N): recorder 'recording' → recorder.stop() called; status 'recorded'", async () => {
    nextChunks = [new Blob(["ab"]), new Blob(["cde"])];
    const { result } = await startRecording();
    act(() => result.current.stop());
    expect(recorder().stop).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("recorded");
    expect(result.current.blob?.size).toBe(5);
  });

  it("UTCID02 (A): no recorder yet (idle) → no-op, status 'idle'", () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(() => act(() => result.current.stop())).not.toThrow();
    expect(result.current.status).toBe("idle");
  });

  it("UTCID03 (A): recorder 'inactive' → no-op, recorder.stop not called", async () => {
    const { result } = await startRecording();
    recorder().state = "inactive";
    act(() => result.current.stop());
    expect(recorder().stop).not.toHaveBeenCalled();
  });

  it("UTCID04 (A): recorder 'paused' → no-op, recorder.stop not called", async () => {
    const { result } = await startRecording();
    (recorder() as unknown as { state: string }).state = "paused";
    act(() => result.current.stop());
    expect(recorder().stop).not.toHaveBeenCalled();
  });

  it("stop releases the microphone and closes the metering AudioContext", async () => {
    const { result } = await startRecording();
    act(() => result.current.stop());
    expect(stream.tracks[0].stop).toHaveBeenCalled();
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(result.current.level).toBe(0);
  });

  it("zero-size chunks are ignored", async () => {
    nextChunks = [new Blob([]), new Blob(["xy"]), new Blob([])];
    const { result } = await startRecording();
    act(() => result.current.stop());
    expect(result.current.blob?.size).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-38 useAudioRecorder.reset", () => {
  it("UTCID01 (N): status 'recorded' with blob → blob null, elapsed 0, level 0, status 'idle'", async () => {
    const { result } = await startRecording();
    act(() => result.current.stop());
    expect(result.current.blob).not.toBeNull();
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ status: "idle", blob: null, elapsedSec: 0, level: 0 });
  });

  it("UTCID02 (N): status 'recording' → tracks stopped, AudioContext closed, timers cleared", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const { result } = await startRecording();
    act(() => result.current.reset());
    expect(stream.tracks[0].stop).toHaveBeenCalled();
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.elapsedSec).toBe(0);
    expect(result.current.status).toBe("idle");
  });

  it("UTCID03 (A): error and warning set → both null, status 'idle'", async () => {
    const { result } = await startRecording();
    await act(async () => {
      stream.tracks[0].endFromDevice();
    });
    expect(result.current.warning).not.toBeNull();
    getUserMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.error).not.toBeNull();
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ error: null, warning: null, status: "idle" });
  });

  it("UTCID04 (B): idle, nothing allocated → no error thrown, status 'idle'", () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(() => act(() => result.current.reset())).not.toThrow();
    expect(result.current.status).toBe("idle");
  });

  it("reset during recording discards it — no late Blob / 'recorded' status afterwards", async () => {
    const { result } = await startRecording();
    await act(async () => {
      result.current.reset();
    });
    await act(async () => {});
    expect(result.current.status).toBe("idle");
    expect(result.current.blob).toBeNull();
  });

  it("unmounting while recording releases the microphone", async () => {
    const { unmount } = await startRecording();
    unmount();
    expect(stream.tracks[0].stop).toHaveBeenCalled();
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-39 decodeRecording", () => {
  beforeEach(() => {
    if (!Blob.prototype.arrayBuffer) {
      Object.defineProperty(Blob.prototype, "arrayBuffer", {
        configurable: true,
        value(this: Blob) {
          return readBlob(this);
        },
      });
    }
  });
  const failingDecoder = () =>
    vi.stubGlobal(
      "AudioContext",
      class extends FakeAudioContext {
        decodeAudioData = vi.fn(async () => {
          throw new DOMException("Unable to decode", "EncodingError");
        });
      },
    );

  it("UTCID01 (N): audio/webm blob 10 KB → AudioBuffer; context.close() called", async () => {
    const out = await decodeRecording(new Blob([new Uint8Array(10 * 1024)], { type: "audio/webm" }));
    const ctx = FakeAudioContext.instances[0];
    expect((ctx.decodeAudioData.mock.calls[0][0] as ArrayBuffer).byteLength).toBe(10 * 1024);
    expect(out.getChannelData(0)).toEqual(Float32Array.from([0.1, 0.2]));
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });

  it("UTCID02 (N): audio/mp4 blob (Safari) → AudioBuffer; context.close() called", async () => {
    const out = await decodeRecording(new Blob([new Uint8Array(64)], { type: "audio/mp4" }));
    expect(out.numberOfChannels).toBe(1);
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalledTimes(1);
  });

  it("UTCID03 (A): corrupted blob → EncodingError propagated; context closed", async () => {
    failingDecoder();
    const err = await decodeRecording(new Blob(["garbage"])).catch((e) => e);
    expect((err as DOMException).name).toBe("EncodingError");
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalledTimes(1);
  });

  it("UTCID04 (A): empty blob (0 bytes) → EncodingError propagated; context closed", async () => {
    failingDecoder();
    const err = await decodeRecording(new Blob([])).catch((e) => e);
    expect((err as DOMException).name).toBe("EncodingError");
    expect((FakeAudioContext.instances[0].decodeAudioData.mock.calls[0][0] as ArrayBuffer).byteLength).toBe(0);
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalledTimes(1);
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
  const rendered = () => {
    const off = FakeOffline.instances[0];
    return [off.channels, off.rate];
  };

  it("UTCID01 (B): mono 44100 Hz → same buffer, no rendering", async () => {
    const b = buf(1, 44100, 0.5);
    await expect(normalizeForStorage(b)).resolves.toBe(b);
    expect(FakeOffline.instances).toHaveLength(0);
  });

  it("UTCID02 (N): mono 22050 Hz → rendered 1 ch, 44100 Hz", async () => {
    const b = buf(1, 22050, 0.5);
    const out = await normalizeForStorage(b);
    expect(rendered()).toEqual([1, STORAGE_SAMPLE_RATE]);
    expect(out).toBe(FakeOffline.instances[0].rendered);
  });

  it("UTCID03 (B): mono 44101 Hz → rendered 1 ch, 44100 Hz", async () => {
    await normalizeForStorage(buf(1, 44101, 0.5));
    expect(rendered()).toEqual([1, 44100]);
  });

  it("UTCID04 (N): stereo 48000 Hz, 2.5 s → rendered 1 ch, 44100 Hz, 110250 frames", async () => {
    const b = buf(2, 48000, 2.5);
    const out = await normalizeForStorage(b);
    const off = FakeOffline.instances[0];
    expect([off.channels, off.frames, off.rate]).toEqual([1, 110250, 44100]);
    expect(off.source.buffer).toBe(b);
    expect(off.source.connect).toHaveBeenCalledWith(off.destination);
    expect(off.source.start).toHaveBeenCalled();
    expect(out).toBe(off.rendered);
  });

  it("UTCID05 (N): stereo 44100 Hz → rendered 1 ch, 44100 Hz", async () => {
    await normalizeForStorage(buf(2, 44100, 1));
    expect(rendered()).toEqual([1, 44100]);
  });

  it("UTCID06 (B): stereo, duration 0 → rendered with frameCount 1", async () => {
    await normalizeForStorage(makeAudioBuffer([[], []], 48000));
    expect(FakeOffline.instances[0].frames).toBe(1);
  });

  it("UTCID07 (A): startRendering rejects → rendering error propagated", async () => {
    vi.stubGlobal(
      "OfflineAudioContext",
      class extends FakeOffline {
        startRendering = vi.fn(async () => {
          throw new Error("render failed");
        });
      },
    );
    await expect(normalizeForStorage(buf(2, 48000, 2.5))).rejects.toThrow("render failed");
  });

  it("fractional duration → frame count rounded up (no truncated tail)", async () => {
    await normalizeForStorage(makeAudioBuffer([new Float32Array(48001), new Float32Array(48001)], 48000));
    expect(FakeOffline.instances[0].frames).toBe(Math.ceil((48001 / 48000) * 44100));
  });
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-41 encodeWav", () => {
  it("UTCID01 (N): mono 44100 Hz, 1000 frames → audio/wav Blob 2044 B; RIFF/WAVE, PCM, 16-bit", async () => {
    const blob = encodeWav(makeAudioBuffer([new Float32Array(1000)], 44100));
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(2044);
    const v = await blobView(blob);
    expect([readAscii(v, 0, 4), readAscii(v, 8, 4), readAscii(v, 12, 4), readAscii(v, 36, 4)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(v.getUint32(4, true)).toBe(36 + 2000);
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(28, true)).toBe(88200);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(2000);
  });

  it("UTCID02 (N): stereo 48000 Hz, 2 frames → Blob 52 B; L/R interleaved; byteRate 192000", async () => {
    const blob = encodeWav(makeAudioBuffer([[0.5, -0.5], [0.25, -0.25]], 48000));
    expect(blob.size).toBe(52);
    const v = await blobView(blob);
    expect(v.getUint32(28, true)).toBe(192000);
    expect(v.getUint16(32, true)).toBe(4);
    expect([0, 1, 2, 3].map((i) => v.getInt16(44 + i * 2, true))).toEqual([16383, 8191, -16384, -8192]);
  });

  it("UTCID03 (B): mono, 0 frames → Blob 44 B (header only), data size 0", async () => {
    const blob = encodeWav(makeAudioBuffer([[]]));
    expect(blob.size).toBe(44);
    expect((await blobView(blob)).getUint32(40, true)).toBe(0);
  });

  it("UTCID04 (B): samples [1.0, -1.0, 0] → PCM [32767, -32768, 0]", async () => {
    const v = await blobView(encodeWav(makeAudioBuffer([[1, -1, 0]])));
    expect([0, 1, 2].map((i) => v.getInt16(44 + i * 2, true))).toEqual([32767, -32768, 0]);
  });

  it("UTCID05 (A): samples [1.5, -2.0] → PCM clamped [32767, -32768]", async () => {
    const v = await blobView(encodeWav(makeAudioBuffer([[1.5, -2.0]])));
    expect([v.getInt16(44, true), v.getInt16(46, true)]).toEqual([32767, -32768]);
  });

  it("NaN sample (corrupt decode) → written as silence (0), no throw", async () => {
    const v = await blobView(encodeWav(makeAudioBuffer([[Number.NaN, 0.5]])));
    expect(v.getInt16(44, true)).toBe(0);
    expect(v.getInt16(46, true)).toBe(16383);
  });

  it("3-minute mono recording fits the 20 MB limit (~15.9 MB)", () => {
    const blob = encodeWav(makeAudioBuffer([new Float32Array(180 * 44100)]));
    expect(blob.size).toBe(44 + 180 * 44100 * 2);
    expect(blob.size).toBeLessThan(20 * 1024 * 1024);
  });
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-42 computeWaveformPeaks", () => {
  const withPeakInBucket3 = () => {
    const data = new Float32Array(1000).fill(0.1);
    data[350] = 0.8;
    return makeAudioBuffer([data]);
  };

  it("UTCID01 (N): 1000 samples, max 0.8 in bucket 3, 10 buckets → 10 peaks, peaks[3] = 0.8", () => {
    const peaks = computeWaveformPeaks(withPeakInBucket3(), 10);
    expect(peaks).toHaveLength(10);
    expect(peaks[3]).toBeCloseTo(0.8, 6);
    expect(Math.max(...peaks.filter((_, i) => i !== 3))).toBeCloseTo(0.1, 6);
  });

  it("UTCID02 (N): [-0.9, 0.1, 0.2, 0.3], 2 buckets → [0.9, 0.3] (absolute peaks)", () => {
    const peaks = computeWaveformPeaks(makeAudioBuffer([[-0.9, 0.1, 0.2, 0.3]]), 2);
    expect(peaks[0]).toBeCloseTo(0.9, 6);
    expect(peaks[1]).toBeCloseTo(0.3, 6);
  });

  it("UTCID03 (B): 5 samples of 0.5, 10 buckets → [0.5 ×5, 0 ×5]", () => {
    expect(computeWaveformPeaks(makeAudioBuffer([new Float32Array(5).fill(0.5)]), 10)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0, 0]);
  });

  it("UTCID04 (B): bucketCount 0 → []", () => {
    expect(computeWaveformPeaks(withPeakInBucket3(), 0)).toEqual([]);
  });

  it("UTCID05 (A): 10 samples, last = 1.0, 3 buckets → 3 peaks, the trailing spike lands in the last bucket", () => {
    const data = new Float32Array(10);
    data[9] = 1;
    const peaks = computeWaveformPeaks(makeAudioBuffer([data]), 3);
    expect(peaks).toEqual([0, 0, 1]);
  });

  it("UTCID06 (B): 0 samples, 4 buckets → [0, 0, 0, 0]", () => {
    expect(computeWaveformPeaks(makeAudioBuffer([[]]), 4)).toEqual([0, 0, 0, 0]);
  });

  it("only channel 0 is analysed", () => {
    expect(computeWaveformPeaks(makeAudioBuffer([[0, 0], [1, 1]]), 1)).toEqual([0]);
  });
});
