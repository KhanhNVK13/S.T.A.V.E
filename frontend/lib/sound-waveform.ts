import { computeWaveformPeaks } from "./wav-encoder";

const MAX_CONCURRENT = 2;
const cache = new Map<string, Promise<number[]>>();
let active = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(() => resolve()));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else active -= 1;
}

async function computePeaks(url: string, bucketCount: number): Promise<number[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Không tải được file âm thanh.");
  const context = new OfflineAudioContext(1, 1, 44100);
  const buffer = await context.decodeAudioData(await res.arrayBuffer());
  const peaks = computeWaveformPeaks(buffer, bucketCount);
  const max = Math.max(...peaks, 0.0001);
  return peaks.map((p) => p / max);
}

export function loadWaveformPeaks(soundId: string, url: string, bucketCount = 48): Promise<number[]> {
  const key = `${soundId}:${bucketCount}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const promise = (async () => {
    await acquire();
    try {
      return await computePeaks(url, bucketCount);
    } finally {
      release();
    }
  })();
  promise.catch(() => cache.delete(key));
  cache.set(key, promise);
  return promise;
}

export function forgetWaveform(soundId: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${soundId}:`)) cache.delete(key);
  }
}
