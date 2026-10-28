import type { DraftSnapshot } from "@stave/shared-types";
import { exportAudio } from "./audio-exporter";
import { exportMidiFile } from "./midi-exporter";
import { collectSoundIds } from "./custom-sound-buffers";
import { resolveProjectCustomSounds } from "./api-client";
import { createZipBlob, type ZipEntry } from "./zip-store";

export interface BundleOptions {
  sampleRate?: number;
  onProgress?: (p: number) => void;
}

export interface BundleResult {
  blob: Blob;
  skippedSounds: string[];
  hasAudio: boolean;
}

function safeName(value: string): string {
  const plain = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
  return plain.replace(/[^a-z0-9_\-. ]/gi, "_").trim() || "untitled";
}

export async function buildProjectBundle(
  projectId: string,
  projectName: string,
  snapshot: DraftSnapshot,
  options: BundleOptions = {},
): Promise<BundleResult> {
  const { sampleRate = 44100, onProgress } = options;
  const base = safeName(projectName);
  const entries: ZipEntry[] = [];
  const now = new Date();

  entries.push({ name: `${base}.mid`, data: exportMidiFile(snapshot), modified: now });
  onProgress?.(0.05);

  const soundIds = collectSoundIds(snapshot);
  const skippedSounds: string[] = [];
  const soundManifest: { file: string; name: string | null; id: string }[] = [];
  const customBuffers = new Map<string, AudioBuffer>();
  const usedNames = new Set<string>();
  let resolved: Awaited<ReturnType<typeof resolveProjectCustomSounds>> = [];
  if (soundIds.length > 0) {
    try {
      resolved = await resolveProjectCustomSounds(projectId, soundIds);
    } catch {
      skippedSounds.push(...soundIds.map((id) => `âm thanh ${id.slice(0, 8)}`));
    }
  }
  const decoder = new OfflineAudioContext(1, 1, 44100);
  for (const sound of resolved) {
    if (!sound.playable || !sound.playbackUrl) {
      skippedSounds.push(sound.name ?? sound.id);
      continue;
    }
    try {
      const res = await fetch(sound.playbackUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = await res.arrayBuffer();
      let file = `${safeName(sound.name ?? sound.id)}.wav`;
      for (let i = 2; usedNames.has(file.toLowerCase()); i++) {
        file = `${safeName(sound.name ?? sound.id)} (${i}).wav`;
      }
      usedNames.add(file.toLowerCase());
      entries.push({ name: `custom-sounds/${file}`, data: new Uint8Array(bytes), modified: now });
      soundManifest.push({ file: `custom-sounds/${file}`, name: sound.name, id: sound.id });
      try {
        customBuffers.set(sound.id, await decoder.decodeAudioData(bytes.slice(0)));
      } catch {
      }
    } catch {
      skippedSounds.push(sound.name ?? sound.id);
    }
  }
  onProgress?.(0.15);

  const anySolo = snapshot.tracks.some((t) => t.solo);
  const audibleTrackIds = new Set(
    snapshot.tracks.filter((t) => (anySolo ? t.solo : !t.muted)).map((t) => t.id),
  );
  const hasAudio = snapshot.notes.some((n) => audibleTrackIds.has(n.trackId));
  if (hasAudio) {
    const wav = await exportAudio(snapshot, {
      sampleRate,
      customBuffers,
      onProgress: (p) => onProgress?.(0.15 + p * 0.8),
    });
    entries.push({ name: `${base}.wav`, data: new Uint8Array(await wav.arrayBuffer()), modified: now });
  }

  const manifest = {
    project: projectName,
    exportedAt: now.toISOString(),
    tempo: snapshot.meta.tempo,
    timeSignature: snapshot.meta.timeSignature,
    ppq: snapshot.meta.ppq,
    tracks: snapshot.tracks.length,
    notes: snapshot.notes.length,
    files: entries.map((e) => e.name),
    customSounds: soundManifest,
    skippedCustomSounds: skippedSounds,
    audioIncluded: hasAudio,
  };
  entries.push({
    name: "manifest.json",
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    modified: now,
  });

  onProgress?.(1);
  return { blob: createZipBlob(entries), skippedSounds, hasAudio };
}
