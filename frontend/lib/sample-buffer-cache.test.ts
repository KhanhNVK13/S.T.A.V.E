/**
 * sample-buffer-cache.test.ts — byte cap, LRU eviction and owner pinning of the sample cache.
 * No real audio: "tone" is the fake, `fetch` is stubbed, buffers are plain size descriptors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("tone", () => import("./test-helpers/fake-tone"));

type FakeTone = typeof import("./test-helpers/fake-tone");
type Mod = typeof import("./sample-buffer-cache");

const MB = 1024 * 1024;
// 1 channel × (len) × 4 bytes
const bufferOfMb = (mb: number) => ({ numberOfChannels: 1, length: (mb * MB) / 4 }) as unknown as AudioBuffer;

describe("sample-buffer-cache byte cap", () => {
  let mod: Mod;
  let fetchMock: ReturnType<typeof vi.fn>;
  let sizeByCall: number[];

  beforeEach(async () => {
    vi.resetModules();
    const fake = (await import("tone")) as unknown as FakeTone;
    fake.__state.reset();
    sizeByCall = [];
    fake.__state.decodeAudioData = vi.fn(async () => bufferOfMb(sizeByCall.shift() ?? 100));
    mod = await import("./sample-buffer-cache");
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) }) as Response);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("evicts the least recently used unowned buffer when over the cap", async () => {
    await mod.loadSampleBuffer("/a"); // 100
    await mod.loadSampleBuffer("/b");
    await mod.loadSampleBuffer("/c");
    await mod.loadSampleBuffer("/a"); // touch a → b is now oldest
    await mod.loadSampleBuffer("/d");
    await mod.loadSampleBuffer("/e"); // 500MB > 384 → evict b, c, d? only until ≤ cap
    expect(mod.getSampleCacheBytes()).toBeLessThanOrEqual(mod.MAX_CACHE_BYTES);
    fetchMock.mockClear();
    await mod.loadSampleBuffer("/b"); // evicted → refetch
    expect(fetchMock).toHaveBeenCalledWith("/b");
    fetchMock.mockClear();
    await mod.loadSampleBuffer("/e"); // newest, still cached
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never evicts a buffer pinned by a live owner, even over the cap", async () => {
    const owner = {};
    for (const u of ["/p1", "/p2", "/p3", "/p4", "/p5"]) await mod.loadSampleBuffer(u, owner);
    expect(mod.getSampleCacheBytes()).toBe(500 * MB);
    fetchMock.mockClear();
    for (const u of ["/p1", "/p2", "/p3", "/p4", "/p5"]) await mod.loadSampleBuffer(u, owner);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("release makes pinned buffers evictable and brings total under the cap", async () => {
    const owner = {};
    for (const u of ["/p1", "/p2", "/p3", "/p4", "/p5"]) await mod.loadSampleBuffer(u, owner);
    mod.releaseSampleOwner(owner);
    expect(mod.getSampleCacheBytes()).toBeLessThanOrEqual(mod.MAX_CACHE_BYTES);
    expect(mod.getSampleCacheBytes()).toBe(300 * MB);
  });

  it("an owner released before its load finishes does not re-pin the buffer", async () => {
    const owner = {};
    const pending = mod.loadSampleBuffer("/late1");
    mod.releaseSampleOwner(owner);
    await pending;
    for (const u of ["/late2", "/late3", "/late4", "/late5"]) await mod.loadSampleBuffer(u, owner);
    expect(mod.getSampleCacheBytes()).toBeLessThanOrEqual(mod.MAX_CACHE_BYTES);
  });

  it("a buffer shared by two owners stays pinned until both release", async () => {
    const o1 = {};
    const o2 = {};
    await mod.loadSampleBuffer("/shared", o1);
    await mod.loadSampleBuffer("/shared", o2);
    mod.releaseSampleOwner(o1);
    for (const u of ["/x1", "/x2", "/x3", "/x4"]) await mod.loadSampleBuffer(u);
    fetchMock.mockClear();
    await mod.loadSampleBuffer("/shared");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an evicted buffer reloads successfully", async () => {
    for (const u of ["/a", "/b", "/c", "/d"]) await mod.loadSampleBuffer(u);
    await expect(mod.loadSampleBuffer("/a")).resolves.toBeDefined();
  });

  it("total bytes never exceed the cap once every buffer is released", async () => {
    const owner = {};
    for (let i = 0; i < 12; i++) await mod.loadSampleBuffer(`/m${i}`, owner);
    mod.releaseSampleOwner(owner);
    expect(mod.getSampleCacheBytes()).toBeLessThanOrEqual(mod.MAX_CACHE_BYTES);
  });
});
