import type { DraftSnapshot } from "@stave/shared-types";
import { resolveProjectCustomSounds, type ResolvedCustomSound } from "./api-client";

const bufferCache = new Map<string, Promise<AudioBuffer>>();

export function collectSoundIds(snapshot: Pick<DraftSnapshot, "tracks">): string[] {
  const ids = new Set<string>();
  for (const track of snapshot.tracks) {
    for (const id of Object.values(track.soundMap ?? {})) ids.add(id);
  }
  return Array.from(ids).sort();
}

async function fetchAndDecode(url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.arrayBuffer();
  return new OfflineAudioContext(1, 1, 44100).decodeAudioData(data);
}

export async function loadCustomSoundBuffers(
  sounds: Iterable<ResolvedCustomSound>,
): Promise<Map<string, AudioBuffer>> {
  const out = new Map<string, AudioBuffer>();
  const jobs: Promise<void>[] = [];
  for (const sound of sounds) {
    if (!sound.playable || !sound.playbackUrl) continue;
    let pending = bufferCache.get(sound.id);
    if (!pending) {
      pending = fetchAndDecode(sound.playbackUrl);
      bufferCache.set(sound.id, pending);
      pending.catch(() => bufferCache.delete(sound.id));
    }
    jobs.push(
      pending.then(
        (buffer) => void out.set(sound.id, buffer),
        (err) => console.warn(`Failed to load custom sound ${sound.id}:`, err),
      ),
    );
  }
  await Promise.all(jobs);
  return out;
}

export async function resolveAndLoadCustomSounds(
  projectId: string,
  snapshot: Pick<DraftSnapshot, "tracks">,
): Promise<Map<string, AudioBuffer>> {
  const ids = collectSoundIds(snapshot);
  if (ids.length === 0) return new Map();
  return loadCustomSoundBuffers(await resolveProjectCustomSounds(projectId, ids));
}
