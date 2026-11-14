import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setLang } from "../../lib/i18n";
import * as api from "../../lib/api-client";
import { SoundLibraryPanel } from "./sound-library-panel";

vi.mock("../../lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api-client")>()),
  listCustomSounds: vi.fn(),
  createCustomSoundUploadUrl: vi.fn(),
  confirmCustomSoundUpload: vi.fn(),
  getCustomSoundUsage: vi.fn(),
  deleteCustomSound: vi.fn(),
}));
const storage = vi.hoisted(() => ({ error: null as Error | null }));
vi.mock("../../lib/supabase-browser", () => ({
  supabase: { storage: { from: () => ({ uploadToSignedUrl: vi.fn(async () => ({ error: storage.error })) }) } },
}));
vi.mock("../../lib/wav-encoder", () => ({
  encodeWav: vi.fn(() => ({ size: 2048 })),
  normalizeForStorage: vi.fn(async () => ({})),
}));
vi.mock("../../lib/sound-waveform", () => ({ loadWaveformPeaks: vi.fn(async () => []) }));
vi.mock("../../lib/use-audio-recorder", () => ({
  useAudioRecorder: () => ({
    status: "idle", blob: null, elapsedSec: 0, level: 0, error: null, warning: null,
    start: vi.fn(), stop: vi.fn(), reset: vi.fn(),
  }),
}));

let durations: Record<string, number>;

class FakeAudioContext {
  async decodeAudioData(buf: ArrayBuffer) {
    const key = new TextDecoder().decode(buf);
    if (!(key in durations)) throw new Error("bad");
    return { duration: durations[key] };
  }
  close() {
    return Promise.resolve();
  }
}

function makeFile(name: string, body: string, size?: number) {
  const file = new File([body], name);
  const bytes = new TextEncoder().encode(body);
  Object.defineProperty(file, "arrayBuffer", { value: () => Promise.resolve(bytes.buffer) });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
}

function pick(files: File[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

beforeEach(() => {
  setLang("en");
  durations = { ok1: 2, ok2: 3, long: 31 };
  storage.error = null;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.mocked(api.listCustomSounds).mockReset().mockResolvedValue({ items: [], usedBytes: 0, quotaBytes: 50 * 1024 * 1024 });
  vi.mocked(api.createCustomSoundUploadUrl).mockReset().mockResolvedValue({ soundId: "s", path: "p", token: "t" });
  vi.mocked(api.confirmCustomSoundUpload).mockReset().mockResolvedValue({} as never);
  vi.mocked(api.getCustomSoundUsage)
    .mockReset()
    .mockResolvedValue({ externalProjectCount: 0, externalProjects: [], privateProjectCount: 0 });
  vi.mocked(api.deleteCustomSound).mockReset().mockResolvedValue({ removed: true, affectedProjects: 0 });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function ready(props: React.ComponentProps<typeof SoundLibraryPanel> = {}) {
  render(<SoundLibraryPanel {...props} />);
  await waitFor(() => expect(api.listCustomSounds).toHaveBeenCalled());
}

function sound(over: Partial<api.CustomSound> = {}): api.CustomSound {
  return {
    id: "s1",
    name: "Kick",
    durationSec: 2,
    sizeBytes: 2048,
    source: "uploaded",
    createdAt: "2026-11-01T00:00:00Z",
    playbackUrl: "blob:kick",
    ...over,
  };
}

function libraryWith(...items: api.CustomSound[]) {
  vi.mocked(api.listCustomSounds).mockResolvedValue({ items, usedBytes: 4096, quotaBytes: 50 * 1024 * 1024 });
}

async function openDelete(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: `Options for ${name}` }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
}

describe("FE-SND-01 SoundLibraryPanel (upload, list, delete, mapping)", () => {
  it("UTCID01 file picker accepts several files at once", async () => {
    await ready();
    expect(document.querySelector('input[type="file"]')?.hasAttribute("multiple")).toBe(true);
  });

  it("UTCID02 rejects a file that is not WAV or MP3", async () => {
    await ready();
    pick([makeFile("a.ogg", "ok1")]);
    expect(await screen.findByText("Only WAV or MP3 files are accepted.")).toBeTruthy();
    expect(api.createCustomSoundUploadUrl).not.toHaveBeenCalled();
  });

  it("UTCID03 rejects a file over 10 MB", async () => {
    await ready();
    pick([makeFile("a.wav", "ok1", 11 * 1024 * 1024)]);
    expect((await screen.findByRole("alert")).textContent).toMatch(/over the 10 MB limit/);
    expect(api.createCustomSoundUploadUrl).not.toHaveBeenCalled();
  });

  it("UTCID04 rejects a sound longer than 30 seconds", async () => {
    await ready();
    pick([makeFile("a.wav", "long")]);
    expect((await screen.findByRole("alert")).textContent).toMatch(/30/);
    expect(api.createCustomSoundUploadUrl).not.toHaveBeenCalled();
  });

  it("UTCID05 with several files, the valid ones are saved and each rejected one is reported by name", async () => {
    await ready();
    pick([makeFile("one.wav", "ok1"), makeFile("two.ogg", "ok2"), makeFile("three.mp3", "long"), makeFile("four.wav", "ok2")]);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("two.ogg");
    expect(alert.textContent).toContain("three.mp3");
    expect(alert.textContent).not.toContain("one.wav");
    expect(alert.textContent).not.toContain("four.wav");
    expect(api.confirmCustomSoundUpload).toHaveBeenCalledTimes(2);
    expect(api.confirmCustomSoundUpload).toHaveBeenCalledWith(expect.objectContaining({ name: "one" }));
    expect(api.confirmCustomSoundUpload).toHaveBeenCalledWith(expect.objectContaining({ name: "four" }));
  });

  it("UTCID06 a file that cannot be decoded as audio is rejected", async () => {
    await ready();
    pick([makeFile("broken.wav", "garbage")]);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't read the audio file/);
    expect(api.createCustomSoundUploadUrl).not.toHaveBeenCalled();
  });

  it("UTCID07 when the upload to storage fails, the sound is not confirmed so no entry is created", async () => {
    storage.error = new Error("net");
    await ready();
    pick([makeFile("a.wav", "ok1")]);
    expect((await screen.findByRole("alert")).textContent).toMatch(/The upload failed/);
    expect(api.confirmCustomSoundUpload).not.toHaveBeenCalled();
  });

  it("UTCID08 a library with no sounds shows the empty state with the upload action", async () => {
    await ready();
    expect(await screen.findByText("No sounds yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload" })).toBeTruthy();
  });

  it("UTCID09 a failed load shows a retry message instead of an empty list and Try again reloads", async () => {
    vi.mocked(api.listCustomSounds).mockRejectedValueOnce(new Error("down"));
    render(<SoundLibraryPanel />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't load the sound library/);
    expect(screen.queryByText("No sounds yet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No sounds yet")).toBeTruthy();
    expect(api.listCustomSounds).toHaveBeenCalledTimes(2);
  });

  it("UTCID10 lists each sound with its name, duration, size and source", async () => {
    libraryWith(sound({ name: "Kick", durationSec: 65, sizeBytes: 2 * 1024 * 1024 }));
    await ready();
    expect(await screen.findByText("Kick")).toBeTruthy();
    expect(screen.getByText("01:05")).toBeTruthy();
    expect(screen.getByText(/2\.0 MB/)).toBeTruthy();
    expect(screen.getByText(/Uploaded/)).toBeTruthy();
  });

  it("UTCID11 opened from a project, mapped sounds are marked Assigned and the others Unassigned", async () => {
    libraryWith(sound({ id: "s1", name: "Kick" }), sound({ id: "s2", name: "Snare" }));
    await ready({ mappedIds: new Set(["s1"]) });
    await screen.findByText("Kick");
    expect(screen.getAllByText("Assigned")).toHaveLength(1);
    expect(screen.getAllByText("Unassigned")).toHaveLength(1);
  });

  it("UTCID12 renders the per-row mapping action supplied by the editor", async () => {
    libraryWith(sound({ id: "s1", name: "Kick" }));
    await ready({ renderRowAction: (s) => <button type="button">Map {s.name}</button> });
    expect(await screen.findByRole("button", { name: "Map Kick" })).toBeTruthy();
  });

  it("UTCID13 a sound whose file is missing is flagged as unavailable and cannot be previewed", async () => {
    libraryWith(sound({ playbackUrl: null }));
    await ready();
    expect(await screen.findByText(/Unavailable: the sound file wasn't found/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Preview Kick" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("UTCID14 deleting a sound nobody else uses deletes it completely", async () => {
    libraryWith(sound());
    await ready();
    await openDelete("Kick");
    await screen.findByText(/No one else's project uses this sound/);
    expect(screen.queryByRole("button", { name: "Remove from my library" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteCustomSound).toHaveBeenCalledWith("s1", "hard"));
  });

  it("UTCID15 deleting a sound used by other people offers removing it for myself or deleting it completely", async () => {
    libraryWith(sound());
    vi.mocked(api.getCustomSoundUsage).mockResolvedValue({
      externalProjectCount: 2,
      externalProjects: [{ id: "x", name: "Other song" }],
      privateProjectCount: 1,
    });
    await ready();
    await openDelete("Kick");
    expect(await screen.findByText("Other song")).toBeTruthy();
    expect(screen.getByText(/1 private projects/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete completely" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove from my library" }));
    await waitFor(() => expect(api.deleteCustomSound).toHaveBeenCalledWith("s1", "self"));
  });

  it("UTCID16 Cancel in the delete dialog deletes nothing", async () => {
    libraryWith(sound());
    await ready();
    await openDelete("Kick");
    await screen.findByText(/No one else's project uses this sound/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.deleteCustomSound).not.toHaveBeenCalled();
    expect(screen.queryByText(/No one else's project uses this sound/)).toBeNull();
  });

  it("UTCID17 a failed delete shows the error inside the dialog and keeps the sound", async () => {
    libraryWith(sound());
    vi.mocked(api.deleteCustomSound).mockRejectedValue(new Error("boom"));
    await ready();
    await openDelete("Kick");
    await screen.findByText(/No one else's project uses this sound/);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Couldn't delete the sound.")).toBeTruthy();
    expect(screen.getAllByText("Kick").length).toBeGreaterThan(0);
  });
});
