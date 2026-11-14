import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftSnapshot } from "@stave/shared-types";
import { setLang } from "./i18n";
import { buildProjectBundle } from "./project-bundle";
import * as api from "./api-client";
import * as exporter from "./audio-exporter";
import * as midi from "./midi-exporter";

vi.mock("./api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api-client")>()),
  resolveProjectCustomSounds: vi.fn(),
}));
vi.mock("./audio-exporter", () => ({ exportAudio: vi.fn() }));
vi.mock("./midi-exporter", () => ({ exportMidiFile: vi.fn() }));

const snap = (soundMap?: Record<string, string>): DraftSnapshot =>
  ({
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [{ id: "t1", name: "Lead", order: 0, color: "#6366f1", muted: false, solo: false, volume: 1, pan: 0, instrument: null, soundMap }],
    notes: [{ id: "n1", trackId: "t1", pitch: 60, start: 0, duration: 480, velocity: 100 }],
  }) as DraftSnapshot;

class FakeOfflineContext {
  decodeAudioData() {
    return Promise.resolve({});
  }
}

function zipText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new TextDecoder("latin1").decode(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

beforeEach(() => {
  setLang("en");
  vi.stubGlobal("OfflineAudioContext", FakeOfflineContext);
  vi.mocked(midi.exportMidiFile).mockReset().mockReturnValue(new Uint8Array([1, 2, 3]));
  vi.mocked(exporter.exportAudio).mockReset().mockResolvedValue({ arrayBuffer: async () => new Uint8Array([9]).buffer } as unknown as Blob);
  vi.mocked(api.resolveProjectCustomSounds).mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("FE-LIB-48 buildProjectBundle", () => {
  it("UTCID04 with no custom sound mapped the archive still holds the MIDI file and an empty mapping file", async () => {
    const result = await buildProjectBundle("p1", "My Song", snap());
    const text = await zipText(result.blob);
    expect(text).toContain("My Song.mid");
    expect(text).toContain("My Song.wav");
    expect(text).toContain("sound-mapping.json");
    expect(text).toContain("[]");
    expect(text).toContain("manifest.json");
    expect(text).not.toContain("custom-sounds/");
    expect(result.hasMappedSounds).toBe(false);
    expect(api.resolveProjectCustomSounds).not.toHaveBeenCalled();
  });

  it("UTCID05 a mapped custom sound is packaged and listed by track and pitch", async () => {
    vi.mocked(api.resolveProjectCustomSounds).mockResolvedValue([
      { id: "s1", name: "Kick", playable: true, playbackUrl: "http://x/kick.wav" },
    ] as never);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([5, 6]).buffer })));
    const result = await buildProjectBundle("p1", "Song", snap({ "36": "s1" }));
    const text = await zipText(result.blob);
    expect(text).toContain("custom-sounds/Kick.wav");
    expect(text).toContain('"pitch": 36');
    expect(text).toContain('"track": "Lead"');
    expect(text).toContain('"soundId": "s1"');
    expect(result.hasMappedSounds).toBe(true);
    expect(result.skippedSounds).toEqual([]);
  });

  it("UTCID06 a sound that is no longer playable is reported as skipped and left out of the archive", async () => {
    vi.mocked(api.resolveProjectCustomSounds).mockResolvedValue([
      { id: "s1", name: "Gone", playable: false, playbackUrl: null },
    ] as never);
    const result = await buildProjectBundle("p1", "Song", snap({ "36": "s1" }));
    expect(result.skippedSounds).toEqual(["Gone"]);
    expect(await zipText(result.blob)).not.toContain("custom-sounds/");
  });

  it("UTCID07 when packaging fails nothing is returned", async () => {
    vi.mocked(midi.exportMidiFile).mockImplementation(() => {
      throw new Error("write failed");
    });
    await expect(buildProjectBundle("p1", "Song", snap())).rejects.toThrow("write failed");
  });
});
