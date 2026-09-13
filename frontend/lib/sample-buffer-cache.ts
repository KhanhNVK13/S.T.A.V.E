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

const MAX_CONCURRENT_FETCHES = 6;

const bufferCache = new Map<string, Promise<AudioBuffer>>();
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

/** Returns a shared, cached promise for this URL's decoded buffer — only ever fetched once regardless of how many callers ask for it. */
export function loadSampleBuffer(url: string): Promise<AudioBuffer> {
  let cached = bufferCache.get(url);
  if (!cached) {
    cached = fetchAndDecode(url);
    bufferCache.set(url, cached);
  }
  return cached;
}
