import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Midi } from "@tonejs/midi";
import { setLang } from "../../lib/i18n";
import * as api from "../../lib/api-client";
import { ImportMidiDialog } from "./import-midi-dialog";

vi.mock("../../lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api-client")>()),
  listProjectBranches: vi.fn(),
  getDraft: vi.fn(),
  putDraft: vi.fn(),
  createCommit: vi.fn(),
}));

const draft = { schemaVersion: 3, meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 }, tracks: [], notes: [] } as never;

function midiBytes(opts: { notes?: boolean; bend?: boolean; cc?: boolean; tracks?: number } = {}) {
  const midi = new Midi();
  for (let i = 1; i < (opts.tracks ?? 1); i++) {
    midi.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 });
  }
  const track = midi.addTrack();
  if (opts.notes !== false) track.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 });
  if (opts.bend) track.addPitchBend({ ticks: 0, value: 0.5 });
  if (opts.cc) track.addCC({ number: 7, ticks: 0, value: 0.5 });
  const raw = midi.toArray();
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}

function makeFile(name: string, content: ArrayBuffer | string, size?: number) {
  const file = new File([content], name);
  const buf = typeof content === "string" ? new TextEncoder().encode(content).buffer : content;
  Object.defineProperty(file, "arrayBuffer", { value: () => Promise.resolve(buf) });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
}

function pick(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  setLang("en");
  vi.mocked(api.listProjectBranches).mockReset().mockResolvedValue([
    { id: "b1", is_default: true, is_active: true, head_commit_id: null },
  ] as never);
  vi.mocked(api.getDraft).mockReset().mockResolvedValue(draft);
  vi.mocked(api.putDraft).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(api.createCommit).mockReset().mockResolvedValue({} as never);
});

afterEach(() => cleanup());

function renderDialog() {
  const onClose = vi.fn();
  const onImported = vi.fn();
  render(<ImportMidiDialog projectId="p1" onClose={onClose} onImported={onImported} />);
  return { onClose, onImported };
}

const importButton = () => screen.getByRole("button", { name: /^Import and commit$|^Import anyway$/ }) as HTMLButtonElement;

describe("FE-IMP-01 ImportMidiDialog.handleFile", () => {
  it("UTCID01 shows the track and note counts and states that nothing is discarded", async () => {
    renderDialog();
    pick(makeFile("ok.mid", midiBytes()));
    await screen.findByText("Nothing in this file will be discarded.");
    expect(importButton().disabled).toBe(false);
    expect(screen.getByText("Tracks").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText("Notes").nextElementSibling?.textContent).toBe("1");
  });

  it("UTCID02 rejects a file name without a .mid or .midi extension and keeps Import disabled", async () => {
    renderDialog();
    pick(makeFile("song.mp3", "x"));
    expect((await screen.findByRole("alert")).textContent).toBe("Only .mid or .midi files are accepted.");
    expect(importButton().disabled).toBe(true);
  });

  it("UTCID03 rejects a file over 5 MB before parsing it", async () => {
    renderDialog();
    pick(makeFile("big.mid", "x", 5 * 1024 * 1024 + 1));
    expect((await screen.findByRole("alert")).textContent).toMatch(/larger than 5 MB/);
    expect(importButton().disabled).toBe(true);
  });

  it("UTCID04 accepts a file of exactly 5 MB", async () => {
    renderDialog();
    pick(makeFile("edge.mid", midiBytes(), 5 * 1024 * 1024));
    await screen.findByText("Nothing in this file will be discarded.");
    expect(screen.queryByText(/larger than 5 MB/)).toBeNull();
    expect(importButton().disabled).toBe(false);
  });

  it("UTCID05 reports a corrupt file as unreadable and imports nothing", async () => {
    renderDialog();
    pick(makeFile("bad.mid", "not a midi file"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't read this MIDI file/);
    expect(importButton().disabled).toBe(true);
  });

  it("UTCID06 rejects a file with more than 32 tracks", async () => {
    renderDialog();
    pick(makeFile("many.mid", midiBytes({ tracks: 33 })));
    expect((await screen.findByRole("alert")).textContent).toMatch(/past 32 tracks/);
    expect(importButton().disabled).toBe(true);
  });

  it("UTCID07 lists the discarded pitch bend and control change events before the user confirms", async () => {
    renderDialog();
    pick(makeFile("rich.mid", midiBytes({ bend: true, cc: true })));
    const report = await screen.findByTestId("discard-report");
    expect(report.textContent).toContain("Pitch bend events: 1");
    expect(report.textContent).toContain("Control change events: 1");
    expect(api.putDraft).not.toHaveBeenCalled();
  });

  it("UTCID08 warns about a file without notes and relabels the button Import anyway", async () => {
    renderDialog();
    pick(makeFile("empty.mid", midiBytes({ notes: false })));
    expect((await screen.findByRole("alert")).textContent).toMatch(/no notes/);
    expect(importButton().textContent).toBe("Import anyway");
    expect(api.putDraft).not.toHaveBeenCalled();
  });

  it("UTCID09 choosing a rejected file after a valid one clears the earlier summary", async () => {
    renderDialog();
    pick(makeFile("ok.mid", midiBytes()));
    await screen.findByText("Nothing in this file will be discarded.");
    pick(makeFile("song.mp3", "x"));
    await screen.findByRole("alert");
    expect(screen.queryByTestId("discard-report")).toBeNull();
    expect(importButton().disabled).toBe(true);
  });
});

describe("FE-IMP-02 ImportMidiDialog.handleImport", () => {
  it("UTCID01 imports into the draft and commits on the open branch after the user confirms", async () => {
    const { onImported } = renderDialog();
    pick(makeFile("ok.mid", midiBytes()));
    await screen.findByText("Nothing in this file will be discarded.");
    fireEvent.click(importButton());
    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(api.putDraft).toHaveBeenCalledTimes(1);
    expect(api.createCommit).toHaveBeenCalledWith(expect.objectContaining({ branch_id: "b1" }));
    expect(onImported).toHaveBeenCalledWith("Imported \"ok.mid\" as the project's first commit.");
  });

  it("UTCID02 on a branch that already has commits, the commit carries the known head and is not a first commit", async () => {
    vi.mocked(api.listProjectBranches).mockResolvedValue([
      { id: "b1", is_default: true, is_active: true, head_commit_id: "c0" },
    ] as never);
    const { onImported } = renderDialog();
    pick(makeFile("ok.mid", midiBytes()));
    await screen.findByText("Nothing in this file will be discarded.");
    fireEvent.click(importButton());
    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(api.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ branch_id: "b1", expectedHeadCommitId: "c0", message: 'Import MIDI "ok"' }),
    );
  });

  it("UTCID03 a file without notes is imported only after the user confirms with Import anyway", async () => {
    const { onImported } = renderDialog();
    pick(makeFile("empty.mid", midiBytes({ notes: false })));
    await screen.findByRole("alert");
    expect(api.putDraft).not.toHaveBeenCalled();
    fireEvent.click(importButton());
    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(api.createCommit).toHaveBeenCalledTimes(1);
  });

  it("UTCID04 Cancel closes the dialog and imports nothing", async () => {
    const { onClose } = renderDialog();
    pick(makeFile("ok.mid", midiBytes()));
    await screen.findByText("Nothing in this file will be discarded.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(api.putDraft).not.toHaveBeenCalled();
    expect(api.createCommit).not.toHaveBeenCalled();
  });

  it("UTCID05 restores the previous draft and shows an error when the commit fails", async () => {
    vi.mocked(api.createCommit).mockRejectedValue(new Error("boom"));
    renderDialog();
    pick(makeFile("ok.mid", midiBytes()));
    await screen.findByText("Nothing in this file will be discarded.");
    fireEvent.click(importButton());
    await waitFor(() => expect(api.putDraft).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.putDraft).mock.calls[1][1]).toBe(draft);
    expect((await screen.findByRole("alert")).textContent).toMatch(/No commit was created/);
  });

  it("UTCID06 when the draft cannot be written, nothing is committed and no restore is attempted", async () => {
    vi.mocked(api.putDraft).mockRejectedValue(new Error("boom"));
    renderDialog();
    pick(makeFile("ok.mid", midiBytes()));
    await screen.findByText("Nothing in this file will be discarded.");
    fireEvent.click(importButton());
    expect((await screen.findByRole("alert")).textContent).toMatch(/No commit was created/);
    expect(api.putDraft).toHaveBeenCalledTimes(1);
    expect(api.createCommit).not.toHaveBeenCalled();
  });

  it("UTCID07 a project without a branch fails before touching the draft", async () => {
    vi.mocked(api.listProjectBranches).mockResolvedValue([] as never);
    renderDialog();
    pick(makeFile("ok.mid", midiBytes()));
    await screen.findByText("Nothing in this file will be discarded.");
    fireEvent.click(importButton());
    expect((await screen.findByRole("alert")).textContent).toMatch(/No commit was created/);
    expect(api.putDraft).not.toHaveBeenCalled();
    expect(api.createCommit).not.toHaveBeenCalled();
  });
});
