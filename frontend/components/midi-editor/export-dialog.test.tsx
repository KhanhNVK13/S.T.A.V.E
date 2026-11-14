import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { DraftSnapshot } from "@stave/shared-types";
import { setLang } from "../../lib/i18n/store";

const exportAudioMock = vi.fn();
vi.mock("../../lib/audio-exporter", async () => {
  const actual = await vi.importActual<typeof import("../../lib/audio-exporter")>("../../lib/audio-exporter");
  return { ...actual, exportAudio: (...args: unknown[]) => exportAudioMock(...args), exportAudioPerTrack: vi.fn() };
});
vi.mock("../../lib/custom-sound-buffers", () => ({
  resolveAndLoadCustomSounds: vi.fn(async () => new Map()),
}));
vi.mock("../../lib/project-bundle", () => ({ buildProjectBundle: vi.fn() }));

import { ExportDialog } from "./export-dialog";

const snapshot = {
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [
    { id: "t1", name: "Lead", order: 0, color: "#fff", muted: false, solo: false, volume: 1, pan: 0, instrument: null },
    { id: "t2", name: "Bass", order: 1, color: "#fff", muted: true, solo: false, volume: 1, pan: 0, instrument: null },
  ],
  notes: [
    { id: "n1", trackId: "t1", pitch: 60, start: 0, duration: 480, velocity: 100 },
    { id: "n2", trackId: "t1", pitch: 62, start: 3840, duration: 480, velocity: 100 },
    { id: "n3", trackId: "t2", pitch: 40, start: 0, duration: 480, velocity: 100 },
  ],
} as unknown as DraftSnapshot;

const onlyMutedSnapshot = {
  ...snapshot,
  notes: [snapshot.notes[2]],
} as DraftSnapshot;

describe("FE-EXP-01 ExportDialog (audio export options)", () => {
  beforeEach(() => {
    setLang("en");
    exportAudioMock.mockReset();
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });
  afterEach(() => cleanup());

  it("UTCID01 selected-range option is disabled until notes are selected, then passes the selection range to the export", async () => {
    exportAudioMock.mockResolvedValue(new Blob(["x"], { type: "audio/wav" }));
    const { rerender } = render(
      <ExportDialog projectId="p" snapshot={snapshot} projectName="Song" selectedNoteIds={new Set()} onClose={() => {}} />,
    );
    expect((screen.getByLabelText(/Export selected range only/) as HTMLInputElement).disabled).toBe(true);
    rerender(
      <ExportDialog projectId="p" snapshot={snapshot} projectName="Song" selectedNoteIds={new Set(["n2"])} onClose={() => {}} />,
    );
    const box = screen.getByLabelText(/bars 3–3/) as HTMLInputElement;
    expect(box.disabled).toBe(false);
    fireEvent.click(box);
    fireEvent.click(screen.getByText("↓ Export WAV"));
    await waitFor(() => expect(exportAudioMock).toHaveBeenCalled());
    expect(exportAudioMock.mock.calls[0][1]).toMatchObject({ range: { fromTick: 3840, toTick: 4320 }, includeMuted: false });
  });

  it("UTCID03 a muted-only project is blocked until include muted tracks is ticked", () => {
    render(<ExportDialog projectId="p" snapshot={onlyMutedSnapshot} projectName="Song" onClose={() => {}} />);
    const exportBtn = screen.getByText("↓ Export WAV").closest("button") as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Include muted tracks/));
    expect(exportBtn.disabled).toBe(false);
  });

  it("UTCID05 MP3 shows the bitrate choices and sends the chosen bitrate", async () => {
    exportAudioMock.mockResolvedValue(new Blob(["x"], { type: "audio/mpeg" }));
    render(<ExportDialog projectId="p" snapshot={snapshot} projectName="Song" onClose={() => {}} />);
    fireEvent.click(screen.getByText(/^MP3/));
    fireEvent.click(screen.getByText("320 kbps"));
    fireEvent.click(screen.getByText("↓ Export MP3"));
    await waitFor(() => expect(exportAudioMock).toHaveBeenCalled());
    expect(exportAudioMock.mock.calls[0][1]).toMatchObject({ format: "mp3", kbps: 320 });
  });

  it("UTCID07 closing the dialog while rendering aborts the export and downloads nothing", async () => {
    let signal: AbortSignal | undefined;
    exportAudioMock.mockImplementation((_s, opts: { signal: AbortSignal }) => {
      signal = opts.signal;
      return new Promise<Blob>((resolve) => {
        opts.signal.addEventListener("abort", () => resolve(new Blob(["partial"])));
      });
    });
    const onClose = vi.fn();
    render(<ExportDialog projectId="p" snapshot={snapshot} projectName="Song" onClose={onClose} />);
    fireEvent.click(screen.getByText("↓ Export WAV"));
    await waitFor(() => expect(signal).toBeDefined());
    fireEvent.click(screen.getByLabelText("Close"));
    expect(signal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalled();
    await Promise.resolve();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("UTCID09 a failed render suggests exporting a shorter range when a selection exists", async () => {
    exportAudioMock.mockRejectedValue(new Error("out of memory"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ExportDialog projectId="p" snapshot={snapshot} projectName="Song" selectedNoteIds={new Set(["n2"])} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByText("↓ Export WAV"));
    await waitFor(() => expect(screen.getByText(/shorter range/)).toBeTruthy());
  });
  it("UTCID02 with no selection the range option stays disabled and the whole project is exported", async () => {
    exportAudioMock.mockResolvedValue(new Blob(["x"], { type: "audio/wav" }));
    render(<ExportDialog projectId="p" snapshot={snapshot} projectName="Song" selectedNoteIds={new Set()} onClose={() => {}} />);
    expect((screen.getByLabelText(/Export selected range only/) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("↓ Export WAV"));
    await waitFor(() => expect(exportAudioMock).toHaveBeenCalled());
    expect(exportAudioMock.mock.calls[0][1].range).toBeNull();
    expect(exportAudioMock.mock.calls[0][1]).toMatchObject({ format: "wav", sampleRate: 44100 });
  });

  it("UTCID04 ticking include muted tracks sends includeMuted to the export", async () => {
    exportAudioMock.mockResolvedValue(new Blob(["x"], { type: "audio/wav" }));
    render(<ExportDialog projectId="p" snapshot={snapshot} projectName="Song" onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText(/Include muted tracks/));
    fireEvent.click(screen.getByText("↓ Export WAV"));
    await waitFor(() => expect(exportAudioMock).toHaveBeenCalled());
    expect(exportAudioMock.mock.calls[0][1]).toMatchObject({ includeMuted: true });
  });

  it("UTCID06 a finished export downloads the rendered file and reports completion", async () => {
    exportAudioMock.mockResolvedValue(new Blob(["x"], { type: "audio/wav" }));
    render(<ExportDialog projectId="p" snapshot={snapshot} projectName="Song" onClose={() => {}} />);
    fireEvent.click(screen.getByText("↓ Export WAV"));
    expect(await screen.findByText(/Export complete/)).toBeTruthy();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("UTCID08 Cancel export while rendering stops the export and says nothing was downloaded", async () => {
    let signal: AbortSignal | undefined;
    exportAudioMock.mockImplementation((_s, opts: { signal: AbortSignal }) => {
      signal = opts.signal;
      return new Promise<Blob>(() => {});
    });
    render(<ExportDialog projectId="p" snapshot={snapshot} projectName="Song" onClose={() => {}} />);
    fireEvent.click(screen.getByText("↓ Export WAV"));
    await waitFor(() => expect(signal).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
    expect(signal?.aborted).toBe(true);
    expect(await screen.findByText(/Export cancelled. Nothing was downloaded./)).toBeTruthy();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("UTCID10 a failed render without a selection reports the failure without the shorter-range hint", async () => {
    exportAudioMock.mockRejectedValue(new Error("out of memory"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ExportDialog projectId="p" snapshot={snapshot} projectName="Song" onClose={() => {}} />);
    fireEvent.click(screen.getByText("↓ Export WAV"));
    expect(await screen.findByText(/Couldn't export the audio file and nothing was downloaded/)).toBeTruthy();
    expect(screen.queryByText(/shorter range/)).toBeNull();
  });

  it("UTCID11 a project without notes warns and blocks the export before rendering", () => {
    const empty = { ...snapshot, notes: [] } as unknown as DraftSnapshot;
    render(<ExportDialog projectId="p" snapshot={empty} projectName="Song" onClose={() => {}} />);
    expect(screen.getByText(/The project has no notes/)).toBeTruthy();
    expect((screen.getByText("↓ Export WAV").closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect(exportAudioMock).not.toHaveBeenCalled();
  });
});
