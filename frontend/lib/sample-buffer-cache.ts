/**
 * sample-buffer-cache.ts
 * Concurrency-limited, cross-track fetch+decode cache for instrument sample
 * files (see instrument-samples.ts / tone-synth-engine.ts).
 *
 * Two real bugs this fixes, found by actually driving the app with
 * Playwright against a 23-track/17-instrument project:
 *
 * 1. Tone.Sampler's own `{ urls, baseUrl }` constructor fetches every URL
 *    given to it immediately, with no concurrency cap. A project using 17
 *    distinct instruments (88 files each) fired ~1500 concurrent requests
 *    the instant Play was pressed — well past Chrome's per-origin
 *    connection limit, so a large fraction failed with
 *    net::ERR_INSUFFICIENT_RESOURCES. A Sampler with a failed buffer then
 *    threw synchronously when triggered ("buffer is either not set or not
 *    loaded"), which (before this fix) aborted the entire remaining
 *    schedule — one flaky sample meant total silence for the whole song.
 * 2. Multiple tracks assigned the *same* instrument (e.g. several "String
 *    Ensemble 1" tracks) each built their own Tone.Sampler and independently
 *    re-fetched the same 88 files — multiplying the request burst above by
 *    however many tracks shared that instrument.
 *
 * This module fetches+decodes each sample URL at most once (shared across
 * every track and Play session, keyed by URL) and never more than
 * MAX_CONCURRENT_FETCHES at a time, regardless of how many tracks/instruments
 * ask for buffers at once.
 */
import * as Tone from "tone";

const MAX_CONCURRENT_FETCHES = 16;
export const MAX_CACHE_BYTES = 384 * 1024 * 1024;

interface CacheEntry {
  promise: Promise<AudioBuffer>;
  bytes: number;
  settled: boolean;
  lastUsed: number;
  owners: Set<object>;
}

const bufferCache = new Map<string, CacheEntry>();
const releasedOwners = new WeakSet<object>();
let totalBytes = 0;
let useClock = 0;
let active = 0;
const queue: (() => void)[] = [];

function runNext() {
  if (active >= MAX_CONCURRENT_FETCHES || queue.length === 0) return;
  active++;
  const job = queue.shift()!;
  job();
}

function fetchAndDecode(url: string): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    queue.push(() => {
      (async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        return Tone.getContext().rawContext.decodeAudioData(arrayBuffer);
      })()
        .then(resolve, reject)
        .finally(() => {
          active--;
          runNext();
        });
    });
    runNext();
  });
}

function bufferBytes(buffer: AudioBuffer): number {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  if (!Number.isFinite(channels) || !Number.isFinite(length)) return 0;
  return channels * length * 4;
}

function evictOverCap() {
  if (totalBytes <= MAX_CACHE_BYTES) return;
  const candidates = [...bufferCache.entries()]
    .filter(([, e]) => e.settled && e.owners.size === 0)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [url, entry] of candidates) {
    if (totalBytes <= MAX_CACHE_BYTES) break;
    bufferCache.delete(url);
    totalBytes -= entry.bytes;
  }
}

/**
 * Returns a shared, cached promise for this URL's decoded buffer — only ever
 * fetched once while cached. Pass `owner` (the object that will hold the
 * buffer) to pin it against eviction until releaseSampleOwner(owner).
 */
export function loadSampleBuffer(url: string, owner?: object): Promise<AudioBuffer> {
  let entry = bufferCache.get(url);
  if (!entry) {
    const pending = fetchAndDecode(url);
    const created: CacheEntry = { promise: pending, bytes: 0, settled: false, lastUsed: 0, owners: new Set() };
    entry = created;
    bufferCache.set(url, created);
    pending.then(
      (buffer) => {
        if (bufferCache.get(url) !== created) return;
        created.settled = true;
        created.bytes = bufferBytes(buffer);
        totalBytes += created.bytes;
        evictOverCap();
      },
      () => {
        if (bufferCache.get(url) === created) bufferCache.delete(url);
      },
    );
  }
  entry.lastUsed = ++useClock;
  if (owner && !releasedOwners.has(owner)) entry.owners.add(owner);
  return entry.promise;
}

export function releaseSampleOwner(owner: object): void {
  releasedOwners.add(owner);
  for (const entry of bufferCache.values()) entry.owners.delete(owner);
  evictOverCap();
}

export function getSampleCacheBytes(): number {
  return totalBytes;
}
