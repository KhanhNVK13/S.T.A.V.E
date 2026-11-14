import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setLang } from "../../lib/i18n";
import { AudioSketchPanel } from "./audio-sketch-panel";
import * as api from "../../lib/api-client";
import * as wav from "../../lib/wav-encoder";
import { supabase } from "../../lib/supabase-browser";

vi.mock("../../lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api-client")>()),
  attachAudioSketch: vi.fn(),
  createSketchUploadUrl: vi.fn(),
  deleteAudioSketch: vi.fn(),
  listAudioSketches: vi.fn(async () => []),
}));
vi.mock("../../lib/supabase-browser", () => ({
  supabase: { storage: { from: () => ({ uploadToSignedUrl: vi.fn() }) } },
}));
vi.mock("../../lib/wav-encoder", () => ({
  computeWaveformPeaks: () => [0.5, 0.5, 0.5, 0.5],
  decodeRecording: vi.fn(async () => ({ duration: 10 })),
  encodeWav: vi.fn(),
  normalizeForStorage: vi.fn(),
}));
const recorder = vi.hoisted(() => ({ reset: vi.fn(), blob: new Blob(["x"]) }));
vi.mock("../../lib/use-audio-recorder", () => ({
  MAX_RECORDING_SEC: 180,
  useAudioRecorder: () => ({
    status: "recorded",
    blob: recorder.blob,
    elapsedSec: 10,
    level: 0,
    error: null,
    warning: null,
    start: vi.fn(),
    stop: vi.fn(),
    reset: recorder.reset,
  }),
}));

beforeEach(() => {
  setLang("en");
  recorder.reset.mockReset();
  vi.mocked(api.listAudioSketches).mockReset().mockResolvedValue([]);
  vi.mocked(api.attachAudioSketch).mockReset().mockResolvedValue({} as never);
  vi.mocked(api.deleteAudioSketch).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(api.createSketchUploadUrl).mockReset();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, right: 100, bottom: 10, width: 100, height: 10, x: 0, y: 0, toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function reviewing() {
  render(<AudioSketchPanel projectId="p1" />);
  await screen.findByText("Keeping 00:10 / 00:10");
}

function dragHandle(handle: "Start point" | "End point", clientX: number) {
  fireEvent.pointerDown(screen.getByRole("button", { name: handle }));
  act(() => {
    window.dispatchEvent(new MouseEvent("pointermove", { clientX }));
    window.dispatchEvent(new MouseEvent("pointerup"));
  });
}

function stubUpload(ok = true) {
  vi.mocked(wav.normalizeForStorage).mockResolvedValue({} as never);
  vi.mocked(wav.encodeWav).mockReturnValue({ size: 1024 } as never);
  vi.mocked(api.createSketchUploadUrl).mockResolvedValue({ sketchId: "s1", path: "p", token: "t" } as never);
  vi.spyOn(supabase.storage, "from").mockReturnValue({
    uploadToSignedUrl: vi.fn(async () => ({ error: ok ? null : new Error("net") })),
  } as never);
}

function savedSketch(over: Partial<api.AudioSketch> = {}): api.AudioSketch {
  return {
    id: "k1",
    project_id: "p1",
    created_by: "u1",
    name: "Hum idea",
    file_url: "p1/k1.wav",
    duration_sec: 8,
    size_bytes: 1024 * 1024,
    trim_start_sec: 0,
    trim_end_sec: null,
    created_at: "2026-11-01T00:00:00Z",
    playbackUrl: "blob:k1",
    ...over,
  };
}

describe("FE-SKT-01 AudioSketchPanel (trim, attach, discard, list)", () => {
  it("UTCID01 dragging the start handle past the end stops at a minimum region", async () => {
    await reviewing();
    dragHandle("Start point", 100);
    expect(screen.getByText("Keeping 00:00 / 00:10")).toBeTruthy();
    expect(screen.getByText(/shorter than one second/)).toBeTruthy();
  });

  it("UTCID02 a kept region under one second warns but a longer one does not", async () => {
    await reviewing();
    expect(screen.queryByText(/shorter than one second/)).toBeNull();
    dragHandle("Start point", 95);
    expect(screen.getByText(/shorter than one second/)).toBeTruthy();
  });

  it("UTCID03 Reset trim restores the full recording", async () => {
    await reviewing();
    dragHandle("Start point", 95);
    fireEvent.click(screen.getByRole("button", { name: "Reset trim" }));
    expect(screen.getByText("Keeping 00:10 / 00:10")).toBeTruthy();
    expect(screen.queryByText(/shorter than one second/)).toBeNull();
  });

  it("UTCID04 dragging the end handle shortens the kept region", async () => {
    await reviewing();
    dragHandle("End point", 50);
    expect(screen.getByText("Keeping 00:05 / 00:10")).toBeTruthy();
  });

  it("UTCID05 Discard recording asks first; Cancel keeps the recording, Discard throws it away", async () => {
    await reviewing();
    fireEvent.click(screen.getByRole("button", { name: /Discard recording/ }));
    expect(screen.getByText("Discard this recording?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(recorder.reset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Discard recording/ }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(recorder.reset).toHaveBeenCalledTimes(1));
  });

  it("UTCID06 a recording over the size limit is refused, nothing is uploaded and the recording stays available", async () => {
    vi.mocked(wav.normalizeForStorage).mockResolvedValue({} as never);
    vi.mocked(wav.encodeWav).mockReturnValue({ size: 25 * 1024 * 1024 } as never);
    await reviewing();
    fireEvent.click(screen.getByRole("button", { name: "Attach to the project" }));
    expect((await screen.findByText(/over the 20MB limit/)).textContent).toMatch(/25\.0MB/);
    expect(api.createSketchUploadUrl).not.toHaveBeenCalled();
    expect(screen.getByText("Keeping 00:10 / 00:10")).toBeTruthy();
  });

  it("UTCID07 an upload failure keeps the recording in the recorder so the user can retry", async () => {
    stubUpload(false);
    await reviewing();
    fireEvent.click(screen.getByRole("button", { name: "Attach to the project" }));
    expect(await screen.findByText("Couldn't attach the audio sketch.")).toBeTruthy();
    expect(api.attachAudioSketch).not.toHaveBeenCalled();
    expect(recorder.reset).not.toHaveBeenCalled();
    expect(screen.getByText("Keeping 00:10 / 00:10")).toBeTruthy();
  });

  it("UTCID08 attaching an untrimmed recording stores it with its name and no end trim, then clears the recorder", async () => {
    stubUpload();
    await reviewing();
    fireEvent.change(screen.getByRole("textbox", { name: "Sketch name" }), { target: { value: "Hum idea" } });
    fireEvent.click(screen.getByRole("button", { name: "Attach to the project" }));
    await waitFor(() => expect(api.attachAudioSketch).toHaveBeenCalledTimes(1));
    expect(api.attachAudioSketch).toHaveBeenCalledWith("p1", {
      sketchId: "s1",
      name: "Hum idea",
      durationSec: 10,
      sizeBytes: 1024,
      trimStartSec: 0,
      trimEndSec: undefined,
    });
    await waitFor(() => expect(recorder.reset).toHaveBeenCalledTimes(1));
  });

  it("UTCID09 attaching a trimmed recording stores the start and end points", async () => {
    stubUpload();
    await reviewing();
    dragHandle("End point", 50);
    dragHandle("Start point", 20);
    fireEvent.click(screen.getByRole("button", { name: "Attach to the project" }));
    await waitFor(() => expect(api.attachAudioSketch).toHaveBeenCalledTimes(1));
    expect(api.attachAudioSketch).toHaveBeenCalledWith("p1", expect.objectContaining({ trimStartSec: 2, trimEndSec: 5 }));
  });

  it("UTCID10 leaving the name empty attaches the sketch under a default name", async () => {
    stubUpload();
    await reviewing();
    fireEvent.change(screen.getByRole("textbox", { name: "Sketch name" }), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Attach to the project" }));
    await waitFor(() => expect(api.attachAudioSketch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.attachAudioSketch).mock.calls[0][1].name).toMatch(/^Sketch /);
  });

  it("UTCID11 a project without sketches shows the empty state", async () => {
    await reviewing();
    expect(screen.getByText("No audio sketches yet.")).toBeTruthy();
  });

  it("UTCID12 an attached sketch is listed and deleting it asks for confirmation first", async () => {
    vi.mocked(api.listAudioSketches).mockResolvedValue([savedSketch({ trim_start_sec: 1 })]);
    await reviewing();
    expect(await screen.findByText("Hum idea")).toBeTruthy();
    expect(screen.getByText("Trimmed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete the audio sketch Hum idea" }));
    expect(api.deleteAudioSketch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(api.deleteAudioSketch).toHaveBeenCalledWith("p1", "k1"));
    await waitFor(() => expect(screen.queryByText("Hum idea")).toBeNull());
  });

  it("UTCID13 a failed delete keeps the sketch in the list", async () => {
    vi.mocked(api.listAudioSketches).mockResolvedValue([savedSketch()]);
    vi.mocked(api.deleteAudioSketch).mockRejectedValue(new Error("boom"));
    await reviewing();
    fireEvent.click(await screen.findByRole("button", { name: "Delete the audio sketch Hum idea" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(api.deleteAudioSketch).toHaveBeenCalled());
    expect(screen.getAllByText("Hum idea").length).toBeGreaterThan(0);
  });
});
