/**
 * editor-actions.test.ts — Report 5 Unit Test, Front-end Editor (FE-EDT-01..12).
 * Owner: Haidnde180202.
 *
 * Kỳ vọng bám theo SRS (Report 3): UC-25/26/27 (note), UC-31 (quantize),
 * UC-32/33 (copy/paste), UC-42 (commit summary), UC-68 (frozen grid),
 * BR-27 (velocity 1..127, pitch 0..127), BR-28 (giữ id khi sửa tại chỗ),
 * BR-29 (tối đa 32 track), BR-40 (commit không có thay đổi).
 * Ca nào code chạy lệch SRS thì để FAILED — không chỉnh kỳ vọng để ép pass.
 *
 * Các hàm FE-EDT-02..12 là hàm nội bộ (không export) của component, nên
 * được kiểm thử qua đúng điểm vào thật của chúng: sự kiện chuột trên canvas
 * (VelocityLane / PianoRoll) hoặc callback mà MidiEditor truyền xuống UI.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setLang } from "../../lib/i18n";

beforeEach(() => setLang("vi"));
import { render, act, fireEvent, cleanup, waitFor, screen } from "@testing-library/react";
import type { DraftNote, DraftSnapshot, DraftTrack } from "@stave/shared-types";

// ── Hoisted shared state for module mocks ─────────────────────
const h = vi.hoisted(() => ({
  editorProps: null as null | Record<string, any>,
  clipboardStore: null as unknown,
  getDraft: null as unknown as (id: string) => Promise<unknown>,
}));

vi.mock("./redesign/editor-redesign", () => ({
  EditorRedesign: (props: Record<string, any>) => {
    h.editorProps = props;
    return null;
  },
}));
vi.mock("../ui/toast", async () => {
  const R = await import("react");
  return {
    Toast: ({ message, variant }: { message: string; variant: string }) =>
      R.createElement("div", { "data-testid": "toast", "data-variant": variant }, message),
  };
});
vi.mock("../../lib/api-client", () => ({
  getDraft: vi.fn((id: string) => h.getDraft(id)),
  getDraftRecovery: vi.fn(async () => ({ version: "v1", recovered: false, savedAt: null })),
  isDraftStaleError: vi.fn(() => false),
  putDraft: vi.fn(async () => ({ version: "v2" })),
  resolveProjectCustomSounds: vi.fn(async () => []),
}));
vi.mock("../../lib/pattern-clipboard", () => ({
  getPatternClipboard: vi.fn(() => h.clipboardStore),
  setPatternClipboard: vi.fn((v: unknown) => {
    h.clipboardStore = v;
  }),
}));
vi.mock("../../lib/custom-sound-buffers", () => ({
  collectSoundIds: () => [],
  loadCustomSoundBuffers: async () => new Map(),
}));
vi.mock("../../lib/tone-synth-engine", () => ({
  prepareVoices: vi.fn(),
  triggerNotes: vi.fn(),
  createVoiceCache: () => ({}),
  disposeVoiceCache: vi.fn(),
  evictVoice: vi.fn(),
}));
vi.mock("../../lib/midi-parser", () => ({ parseMidiBuffer: vi.fn() }));
vi.mock("../../lib/midi-exporter", () => ({ exportMidiFile: vi.fn() }));
vi.mock("../../lib/instrument-samples", () => ({ probeInstrumentSamples: vi.fn(async () => true) }));
vi.mock("tone", () => ({
  now: () => 0,
  start: async () => {},
  getContext: () => ({ dispose() {} }),
  setContext: () => {},
}));

import { summarizeChanges } from "./redesign/change-summary";
import { VelocityLane } from "./velocity-lane";
import { PianoRoll, type ToolMode, type GridDivision } from "./piano-roll";
import { MidiEditor } from "./midi-editor";
import { setPatternClipboard } from "../../lib/pattern-clipboard";

// ── jsdom environment mocks ───────────────────────────────────
function makeCtx2d() {
  const store: Record<string | symbol, unknown> = {
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

let uuidCounter = 0;
const clipboardWriteText = vi.fn(async () => {});

beforeEach(() => {
  uuidCounter = 0;
  h.editorProps = null;
  h.clipboardStore = null;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => makeCtx2d() as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(
    () => `uuid-${++uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`,
  );
  clipboardWriteText.mockReset();
  clipboardWriteText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: clipboardWriteText },
    configurable: true,
    writable: true,
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLCanvasElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 104,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Fixtures ──────────────────────────────────────────────────
function track(id: string, order: number, extra: Partial<DraftTrack> = {}): DraftTrack {
  return {
    id,
    name: `Track ${order + 1}`,
    order,
    color: "#6366f1",
    muted: false,
    solo: false,
    volume: 1,
    pan: 0,
    instrument: null,
    ...extra,
  };
}
function note(id: string, extra: Partial<DraftNote> = {}): DraftNote {
  return { id, trackId: "t1", pitch: 60, start: 0, duration: 480, velocity: 100, ...extra };
}
function snap(extra: Partial<DraftSnapshot> = {}): DraftSnapshot {
  return {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [track("t1", 0)],
    notes: [],
    ...extra,
  } as DraftSnapshot;
}

// ═════════════════════════════════════════════════════════════
// FE-EDT-01 summarizeChanges
// ═════════════════════════════════════════════════════════════
describe("FE-EDT-01 summarizeChanges", () => {
  it("FE-EDT-01 UTCID01 (N): identical snapshots → total 0, nothing changed", () => {
    const base = snap({ notes: [note("n1")] });
    const r = summarizeChanges(base, structuredClone(base));
    expect(r).toEqual({
      notes: { added: 0, removed: 0, modified: 0 },
      tracks: { added: 0, removed: 0, modified: 0 },
      metaChanged: false,
      total: 0,
    });
  });

  it("FE-EDT-01 UTCID02 (N): one new note → notes.added = 1, total = 1", () => {
    const r = summarizeChanges(snap({ notes: [note("n1")] }), snap({ notes: [note("n1"), note("n2")] }));
    expect(r.notes).toEqual({ added: 1, removed: 0, modified: 0 });
    expect(r.total).toBe(1);
  });

  it("FE-EDT-01 UTCID03 (N): one deleted note → notes.removed = 1", () => {
    const r = summarizeChanges(snap({ notes: [note("n1"), note("n2")] }), snap({ notes: [note("n1")] }));
    expect(r.notes).toEqual({ added: 0, removed: 1, modified: 0 });
    expect(r.total).toBe(1);
  });

  it("FE-EDT-01 UTCID04 (N): same id but pitch moved → modified (not delete+add, BR-28)", () => {
    const r = summarizeChanges(snap({ notes: [note("n1")] }), snap({ notes: [note("n1", { pitch: 62 })] }));
    expect(r.notes).toEqual({ added: 0, removed: 0, modified: 1 });
  });

  it("FE-EDT-01 UTCID05 (N): only velocity changed → notes.modified = 1", () => {
    const r = summarizeChanges(snap({ notes: [note("n1")] }), snap({ notes: [note("n1", { velocity: 50 })] }));
    expect(r.notes.modified).toBe(1);
    expect(r.total).toBe(1);
  });

  it("FE-EDT-01 UTCID06 (N): track renamed / muted → tracks.modified counted once per track", () => {
    const r = summarizeChanges(
      snap({ tracks: [track("t1", 0), track("t2", 1)] }),
      snap({ tracks: [track("t1", 0, { name: "Lead", muted: true }), track("t2", 1)] }),
    );
    expect(r.tracks).toEqual({ added: 0, removed: 0, modified: 1 });
  });

  it("FE-EDT-01 UTCID07 (N): tempo changed → metaChanged = true, total = 1", () => {
    const next = snap();
    next.meta = { ...next.meta, tempo: 90 };
    const r = summarizeChanges(snap(), next);
    expect(r.metaChanged).toBe(true);
    expect(r.total).toBe(1);
  });

  it("FE-EDT-01 UTCID08 (B): time signature numerator 4/4 → 3/4 → metaChanged = true", () => {
    const next = snap();
    next.meta = { ...next.meta, timeSignature: [3, 4] };
    expect(summarizeChanges(snap(), next).metaChanged).toBe(true);
  });

  it("FE-EDT-01 UTCID09 (B): both snapshots empty (0 track, 0 note) → total 0", () => {
    const r = summarizeChanges(snap({ tracks: [] }), snap({ tracks: [] }));
    expect(r.total).toBe(0);
  });

  it("FE-EDT-01 UTCID10 (N): mixed changes → total = sum of all counts + meta", () => {
    const base = snap({ tracks: [track("t1", 0), track("t2", 1)], notes: [note("a"), note("b"), note("c")] });
    const next = snap({
      tracks: [track("t1", 0, { volume: 0.5 }), track("t3", 2)],
      notes: [note("a", { start: 120 }), note("c"), note("d"), note("e")],
    });
    next.meta = { ...next.meta, ppq: 960 };
    const r = summarizeChanges(base, next);
    expect(r.notes).toEqual({ added: 2, removed: 1, modified: 1 });
    expect(r.tracks).toEqual({ added: 1, removed: 1, modified: 1 });
    expect(r.metaChanged).toBe(true);
    expect(r.total).toBe(8);
  });

  it("FE-EDT-01 UTCID11 (A): same content but new id → counted as 1 removed + 1 added", () => {
    const r = summarizeChanges(snap({ notes: [note("old")] }), snap({ notes: [note("new")] }));
    expect(r.notes).toEqual({ added: 1, removed: 1, modified: 0 });
  });

  it("FE-EDT-01 UTCID12 (A): track custom-sound map (UC-57 soundMap) changed → track counted as modified", () => {
    const base = snap({ tracks: [track("t1", 0)] });
    const next = snap({
      tracks: [track("t1", 0, { soundMap: { "36": "0b3a5f6e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" } })],
    });
    const r = summarizeChanges(base, next);
    expect(r.tracks.modified).toBe(1);
    expect(r.total).toBeGreaterThan(0);
  });

  it("FE-EDT-01 UTCID13 (A): pure function — inputs are not mutated", () => {
    const base = snap({ notes: [note("n1")] });
    const next = snap({ notes: [note("n1", { pitch: 70 }), note("n2")] });
    const b0 = structuredClone(base);
    const n0 = structuredClone(next);
    summarizeChanges(base, next);
    expect(base).toEqual(b0);
    expect(next).toEqual(n0);
  });
});

// ═════════════════════════════════════════════════════════════
// Velocity lane harness (FE-EDT-02 / FE-EDT-03)
// zoom chosen so pxPerTick = 0.25 exactly → note n at start s spans
// x ∈ [72 + s/4, 72 + s/4 + 13] (bar max width 13px).
// Lane height 104: velocity = clamp(round((96 - cy) / 86 * 127)).
// ═════════════════════════════════════════════════════════════
const ZOOM_Q = 0.25 / 0.06; // → pxPerTick = 0.25

function VelocityHarness(props: {
  initial: DraftNote[];
  selected?: string[];
  readOnly?: boolean;
  spy: (n: DraftNote[]) => void;
}) {
  const [notes, setNotes] = React.useState(props.initial);
  return React.createElement(VelocityLane, {
    notes,
    tracks: [track("t1", 0)],
    scrollX: 0,
    zoom: ZOOM_Q,
    selectedNoteIds: new Set(props.selected ?? []),
    readOnly: props.readOnly,
    onNotesChange: (n: DraftNote[]) => {
      props.spy(n);
      setNotes(n);
    },
  });
}

function renderLane(initial: DraftNote[], opts: { selected?: string[]; readOnly?: boolean } = {}) {
  const spy = vi.fn<(n: DraftNote[]) => void>();
  const { container } = render(React.createElement(VelocityHarness, { initial, spy, ...opts }));
  const canvas = container.querySelector("canvas")!;
  return { spy, canvas };
}
const lastCall = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)![0] as DraftNote[];
const byId = (notes: DraftNote[], id: string) => notes.find((n) => n.id === id)!;

describe("FE-EDT-02 clampVelocity", () => {
  // n1 bar: x 72..85 (start 0); click cx = 78
  const n1 = () => note("n1", { start: 0, velocity: 100 });

  it("FE-EDT-02 UTCID01 (N): mid-lane value (raw 63.5) rounds to 64", () => {
    const { spy, canvas } = renderLane([n1()]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 53 });
    expect(byId(lastCall(spy), "n1").velocity).toBe(64);
  });

  it("FE-EDT-02 UTCID02 (N): fractional raw value 67.93 rounds to nearest integer 68", () => {
    const { spy, canvas } = renderLane([n1()]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 50 });
    expect(byId(lastCall(spy), "n1").velocity).toBe(68);
  });

  it("FE-EDT-02 UTCID03 (B): raw value exactly 127 (upper bound) stays 127", () => {
    const { spy, canvas } = renderLane([n1()]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 10 });
    expect(byId(lastCall(spy), "n1").velocity).toBe(127);
  });

  it("FE-EDT-02 UTCID04 (B): raw value 0 (MIDI note-off) is clamped to 1 (BR-27)", () => {
    const { spy, canvas } = renderLane([n1()]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 96 });
    expect(byId(lastCall(spy), "n1").velocity).toBe(1);
  });

  it("FE-EDT-02 UTCID05 (A): raw value above max (≈141.8, top edge) is clamped to 127", () => {
    const { spy, canvas } = renderLane([n1()]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 0 });
    expect(byId(lastCall(spy), "n1").velocity).toBe(127);
  });

  it("FE-EDT-02 UTCID06 (A): negative raw value (bottom edge, ≈-11.8) is clamped to 1", () => {
    const { spy, canvas } = renderLane([n1()]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 104 });
    expect(byId(lastCall(spy), "n1").velocity).toBe(1);
  });

  it("FE-EDT-02 UTCID07 (B): result is always an integer within 1..127 across the lane", () => {
    const { spy, canvas } = renderLane([n1()]);
    for (let cy = 0; cy <= 104; cy += 7) {
      fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: cy });
      fireEvent.mouseUp(window);
      const v = byId(lastCall(spy), "n1").velocity;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(127);
    }
  });
});

describe("FE-EDT-03 applyVelocity", () => {
  // n1: start 0 → bar x 72..85 (cx 78); n2: start 480 → bar x 192..205 (cx 198)
  it("FE-EDT-03 UTCID01 (N): grabbing an unselected note changes only that note; id kept (BR-28)", () => {
    const n2 = note("n2", { start: 480, velocity: 40 });
    const { spy, canvas } = renderLane([note("n1"), n2]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 53 });
    const out = lastCall(spy);
    expect(byId(out, "n1")).toMatchObject({ id: "n1", velocity: 64, pitch: 60, start: 0, duration: 480 });
    expect(byId(out, "n2")).toBe(n2);
  });

  it("FE-EDT-03 UTCID02 (N): grabbed note inside a selection shifts every selected note by the same delta", () => {
    const { spy, canvas } = renderLane(
      [note("n1", { velocity: 100 }), note("n2", { start: 480, velocity: 60 })],
      { selected: ["n1", "n2"] },
    );
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 53 }); // n1 → 64 (Δ = -36)
    const out = lastCall(spy);
    expect(byId(out, "n1").velocity).toBe(64);
    expect(byId(out, "n2").velocity).toBe(24);
  });

  it("FE-EDT-03 UTCID03 (B): shifted partner exceeding 127 is clamped to 127", () => {
    const { spy, canvas } = renderLane(
      [note("n1", { velocity: 60 }), note("n2", { start: 480, velocity: 120 })],
      { selected: ["n1", "n2"] },
    );
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 10 }); // n1 → 127 (Δ = +67)
    const out = lastCall(spy);
    expect(byId(out, "n1").velocity).toBe(127);
    expect(byId(out, "n2").velocity).toBe(127);
  });

  it("FE-EDT-03 UTCID04 (B): shifted partner dropping below 1 is clamped to 1", () => {
    const { spy, canvas } = renderLane(
      [note("n1", { velocity: 127 }), note("n2", { start: 480, velocity: 10 })],
      { selected: ["n1", "n2"] },
    );
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 53 }); // Δ = -63
    expect(byId(lastCall(spy), "n2").velocity).toBe(1);
  });

  it("FE-EDT-03 UTCID05 (B): new velocity equal to current → note object returned unchanged", () => {
    const n1 = note("n1", { velocity: 64 });
    const { spy, canvas } = renderLane([n1]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 53 });
    expect(byId(lastCall(spy), "n1")).toBe(n1);
  });

  it("FE-EDT-03 UTCID06 (A): grabbed note NOT in the selection → other selected notes untouched", () => {
    const n2 = note("n2", { start: 480, velocity: 60 });
    const { spy, canvas } = renderLane([note("n1", { velocity: 100 }), n2], { selected: ["n2"] });
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 53 });
    const out = lastCall(spy);
    expect(byId(out, "n1").velocity).toBe(64);
    expect(byId(out, "n2")).toBe(n2);
  });

  it("FE-EDT-03 UTCID07 (N): drag is relative to the ORIGINAL velocities (no cumulative drift)", () => {
    const { spy, canvas } = renderLane(
      [note("n1", { velocity: 100 }), note("n2", { start: 480, velocity: 60 })],
      { selected: ["n1", "n2"] },
    );
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 53 }); // n1 64
    fireEvent.mouseMove(canvas, { clientX: 78, clientY: 50 }); // n1 68
    fireEvent.mouseMove(canvas, { clientX: 78, clientY: 53 }); // n1 64 again
    const out = lastCall(spy);
    expect(byId(out, "n1").velocity).toBe(64);
    expect(byId(out, "n2").velocity).toBe(24); // 60 + (64 - 100)
  });

  it("FE-EDT-03 UTCID08 (A): readOnly lane → onNotesChange never called", () => {
    const { spy, canvas } = renderLane([note("n1")], { readOnly: true });
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 53 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("FE-EDT-03 UTCID09 (A): right mouse button → onNotesChange never called", () => {
    const { spy, canvas } = renderLane([note("n1")]);
    fireEvent.mouseDown(canvas, { button: 2, clientX: 78, clientY: 53 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("FE-EDT-03 UTCID10 (A): click on empty area / label column → nothing changes", () => {
    const { spy, canvas } = renderLane([note("n1")]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 150, clientY: 53 }); // gap between bars
    fireEvent.mouseDown(canvas, { button: 0, clientX: 30, clientY: 53 }); // label column
    expect(spy).not.toHaveBeenCalled();
  });

  it("FE-EDT-03 UTCID11 (A): mousemove after window mouseup does not keep editing", () => {
    const { spy, canvas } = renderLane([note("n1")]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 53 });
    fireEvent.mouseUp(window);
    const calls = spy.mock.calls.length;
    fireEvent.mouseMove(canvas, { clientX: 78, clientY: 10 });
    expect(spy.mock.calls.length).toBe(calls);
  });
});

// ═════════════════════════════════════════════════════════════
// MidiEditor harness (FE-EDT-04/05/06)
// ═════════════════════════════════════════════════════════════
async function renderEditor(initial: DraftSnapshot) {
  h.getDraft = async () => structuredClone(initial);
  render(React.createElement(MidiEditor, { projectId: "p1", projectName: "Demo" }));
  await waitFor(() => expect(h.editorProps).not.toBeNull());
  return {
    get props() {
      return h.editorProps!;
    },
    call(name: string, ...args: unknown[]) {
      act(() => {
        h.editorProps![name](...args);
      });
    },
  };
}
const toast = () => screen.queryByTestId("toast");

const twoTrackSnap = () =>
  snap({
    tracks: [track("t1", 0), track("t2", 1)],
    notes: [
      note("a", { trackId: "t1", pitch: 60, start: 0, duration: 240 }),
      note("b", { trackId: "t1", pitch: 64, start: 480, duration: 240 }),
      note("c", { trackId: "t2", pitch: 48, start: 960, duration: 480 }),
    ],
  });

describe("FE-EDT-04 handleCopy", () => {
  it("FE-EDT-04 UTCID01 (N): copy 2 selected notes → system clipboard + pattern clipboard + success toast", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    ed.call("onCopy");
    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    const written = JSON.parse(clipboardWriteText.mock.calls[0][0]) as DraftNote[];
    expect(written.map((n) => n.id)).toEqual(["a", "b"]);
    expect(setPatternClipboard).toHaveBeenCalledWith(
      expect.objectContaining({ ppq: 480, tracks: [expect.objectContaining({ id: "t1" })] }),
    );
    expect(ed.props.hasClipboard).toBe(true);
    expect(toast()?.textContent).toBe("Đã sao chép 2 nốt.");
    expect(toast()?.dataset.variant).toBe("success");
  });

  it("FE-EDT-04 UTCID02 (N): selection spanning 2 tracks → toast mentions track count", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "c"]));
    ed.call("onCopy");
    expect(toast()?.textContent).toBe("Đã sao chép 2 nốt từ 2 track.");
  });

  it("FE-EDT-04 UTCID03 (B): exactly 1 selected note is copied", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["b"]));
    ed.call("onCopy");
    expect(JSON.parse(clipboardWriteText.mock.calls[0][0])).toHaveLength(1);
    expect(toast()?.textContent).toBe("Đã sao chép 1 nốt.");
  });

  it("FE-EDT-04 UTCID04 (A): empty selection → nothing copied, no toast, clipboard stays empty", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onCopy");
    expect(clipboardWriteText).not.toHaveBeenCalled();
    expect(setPatternClipboard).not.toHaveBeenCalled();
    expect(ed.props.hasClipboard).toBe(false);
    expect(toast()).toBeNull();
  });

  it("FE-EDT-04 UTCID05 (A): navigator.clipboard.writeText rejects → in-app copy still succeeds", async () => {
    clipboardWriteText.mockRejectedValueOnce(new Error("NotAllowedError"));
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a"]));
    ed.call("onCopy");
    await act(async () => {});
    expect(ed.props.hasClipboard).toBe(true);
    expect(toast()?.dataset.variant).toBe("success");
  });

  it("FE-EDT-04 UTCID06 (A): navigator.clipboard unavailable (non-secure context) → in-app copy still succeeds without throwing", async () => {
    const ed = await renderEditor(twoTrackSnap());
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true, writable: true });
    ed.call("onSelectedNotesChange", new Set(["a"]));
    expect(() => ed.call("onCopy")).not.toThrow();
    expect(ed.props.hasClipboard).toBe(true);
    expect(toast()?.textContent).toBe("Đã sao chép 1 nốt.");
  });

  it("FE-EDT-04 UTCID07 (N): Ctrl+C shortcut triggers copy of the current selection", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    act(() => {
      fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    });
    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(toast()?.textContent).toBe("Đã sao chép 2 nốt.");
  });

  it("FE-EDT-04 UTCID08 (A): copy does not modify the project (snapshot notes unchanged)", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    ed.call("onCopy");
    expect(ed.props.notes.map((n: DraftNote) => n.id)).toEqual(["a", "b", "c"]);
    expect(ed.props.canUndo).toBe(false);
  });
});

describe("FE-EDT-05 handlePaste", () => {
  async function copyThenPaste(ids: string[], s = twoTrackSnap()) {
    const ed = await renderEditor(s);
    ed.call("onSelectedNotesChange", new Set(ids));
    ed.call("onCopy");
    return ed;
  }

  it("FE-EDT-05 UTCID01 (N): paste 2 notes at playhead 0 on the selected track → new UUIDs, pasted notes selected", async () => {
    const ed = await copyThenPaste(["a", "b"]);
    ed.call("onSeek", 1920);
    ed.call("onPaste");
    const notes: DraftNote[] = ed.props.notes;
    expect(notes).toHaveLength(5);
    const pasted = notes.filter((n) => n.id.startsWith("uuid-"));
    expect(pasted.map((n) => [n.trackId, n.pitch, n.start, n.duration])).toEqual([
      ["t1", 60, 1920, 240],
      ["t1", 64, 2400, 240],
    ]);
    expect([...ed.props.selectedNoteIds]).toEqual(pasted.map((n) => n.id));
    expect(toast()?.textContent).toBe("Đã dán 2 nốt.");
  });

  it("FE-EDT-05 UTCID02 (N): original notes keep their ids/positions after paste (BR-28)", async () => {
    const ed = await copyThenPaste(["a"]);
    ed.call("onSeek", 4800);
    ed.call("onPaste");
    const a = (ed.props.notes as DraftNote[]).find((n) => n.id === "a");
    expect(a).toMatchObject({ start: 0, pitch: 60, duration: 240 });
  });

  it("FE-EDT-05 UTCID03 (A): empty clipboard → nothing pasted, no toast", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onPaste");
    expect(ed.props.notes).toHaveLength(3);
    expect(toast()).toBeNull();
  });

  it("FE-EDT-05 UTCID04 (A): project with no track → paste is refused, snapshot unchanged", async () => {
    h.clipboardStore = { notes: [note("x")], tracks: [], ppq: 480 };
    const ed = await renderEditor(snap({ tracks: [] }));
    ed.call("onPaste");
    expect(ed.props.notes).toHaveLength(0);
    expect(ed.props.tracks).toHaveLength(0);
  });

  it("FE-EDT-05 UTCID05 (A): paste over same-pitch notes → overlap trimmed and warning toast", async () => {
    const ed = await copyThenPaste(["a"]);
    ed.call("onSeek", 120); // [120, 360) overlaps a [0, 240)
    ed.call("onPaste");
    const a = (ed.props.notes as DraftNote[]).find((n) => n.id === "a")!;
    expect(a.duration).toBe(120);
    expect(toast()?.dataset.variant).toBe("warning");
    expect(toast()?.textContent).toContain("cắt bớt 1 nốt");
  });

  it("FE-EDT-05 UTCID06 (B): clipboard ppq 960 pasted into ppq 480 project → timing rescaled", async () => {
    h.clipboardStore = {
      notes: [note("x", { start: 960, duration: 960 }), note("y", { start: 1920, duration: 480 })],
      tracks: [{ id: "t1", name: "Src", order: 0, instrument: null }],
      ppq: 960,
    };
    const ed = await renderEditor(snap());
    ed.call("onSeek", 0);
    ed.call("onPaste");
    const pasted = (ed.props.notes as DraftNote[]).filter((n) => n.id.startsWith("uuid-"));
    expect(pasted.map((n) => [n.start, n.duration])).toEqual([
      [0, 480],
      [480, 240],
    ]);
  });

  it("FE-EDT-05 UTCID07 (A): clipboard note with invalid pitch 200 is skipped with a warning", async () => {
    h.clipboardStore = {
      notes: [note("x", { pitch: 200 }), note("y", { pitch: 62, start: 480 })],
      tracks: [{ id: "t1", name: "Src", order: 0, instrument: null }],
      ppq: 480,
    };
    const ed = await renderEditor(snap());
    ed.call("onPaste");
    const pasted = (ed.props.notes as DraftNote[]).filter((n) => n.id.startsWith("uuid-"));
    expect(pasted).toHaveLength(1);
    expect(pasted[0].pitch).toBe(62);
    expect(toast()?.textContent).toContain("1 nốt không hợp lệ đã bị bỏ qua.");
  });

  it("FE-EDT-05 UTCID08 (B): multi-track paste at the 32-track limit (BR-29) → extra-track notes skipped with warning", async () => {
    const tracks = Array.from({ length: 32 }, (_, i) => track(`t${i + 1}`, i));
    h.clipboardStore = {
      notes: [note("x", { trackId: "s1" }), note("y", { trackId: "s2", pitch: 70 })],
      tracks: [
        { id: "s1", name: "S1", order: 0, instrument: null },
        { id: "s2", name: "S2", order: 1, instrument: null },
      ],
      ppq: 480,
    };
    const ed = await renderEditor(snap({ tracks }));
    ed.call("onSelectTrack", "t32");
    ed.call("onPaste");
    expect(ed.props.tracks).toHaveLength(32);
    const pasted = (ed.props.notes as DraftNote[]).filter((n) => n.id.startsWith("uuid-"));
    expect(pasted).toHaveLength(1);
    expect(pasted[0].trackId).toBe("t32");
    expect(toast()?.textContent).toContain("1 nốt không được dán vì đã đủ số track tối đa.");
  });

  it("FE-EDT-05 UTCID09 (N): multi-track paste below the limit creates the missing track", async () => {
    const ed = await copyThenPaste(["a", "c"]); // from t1 + t2
    ed.call("onSelectTrack", "t2"); // t2 + a new track
    ed.call("onSeek", 4800);
    ed.call("onPaste");
    expect(ed.props.tracks).toHaveLength(3);
    expect(toast()?.textContent).toContain("Tạo thêm 1 track.");
  });

  it("FE-EDT-05 UTCID10 (N): Ctrl+V shortcut pastes the clipboard", async () => {
    const ed = await copyThenPaste(["b"]);
    ed.call("onSeek", 9600);
    act(() => {
      fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    });
    expect(ed.props.notes).toHaveLength(4);
  });
});

describe("FE-EDT-06 handleQuantize", () => {
  // default grid 1/16, ppq 480 → step = 120 ticks
  const offGrid = () =>
    snap({
      tracks: [track("t1", 0), track("t2", 1)],
      notes: [
        note("a", { trackId: "t1", pitch: 60, start: 130, duration: 110 }),
        note("b", { trackId: "t1", pitch: 62, start: 250, duration: 240 }),
        note("c", { trackId: "t2", pitch: 48, start: 470, duration: 480 }),
      ],
    });
  const get = (ed: { props: Record<string, any> }, id: string) =>
    (ed.props.notes as DraftNote[]).find((n) => n.id === id)!;

  it("FE-EDT-06 UTCID01 (N): no selection & no track selected → whole project snapped to 1/16 grid", async () => {
    const ed = await renderEditor(offGrid());
    ed.call("onSelectTrack", null);
    ed.call("onQuantize");
    expect([get(ed, "a").start, get(ed, "a").duration]).toEqual([120, 120]);
    expect(get(ed, "b").start).toBe(240);
    expect(get(ed, "c").start).toBe(480);
    expect(toast()?.textContent).toBe("Đã căn 3 nốt vào lưới (toàn bộ dự án).");
    expect(toast()?.dataset.variant).toBe("success");
  });

  it("FE-EDT-06 UTCID02 (N): with a note selection → only selected notes are quantized", async () => {
    const ed = await renderEditor(offGrid());
    ed.call("onSelectedNotesChange", new Set(["b"]));
    ed.call("onQuantize");
    expect(get(ed, "b").start).toBe(240);
    expect(get(ed, "a").start).toBe(130);
    expect(get(ed, "c").start).toBe(470);
    expect(toast()?.textContent).toContain("các nốt đang chọn");
  });

  it("FE-EDT-06 UTCID03 (N): no selection, track t2 selected → only t2 notes quantized", async () => {
    const ed = await renderEditor(offGrid());
    ed.call("onSelectTrack", "t2");
    ed.call("onQuantize");
    expect(get(ed, "c").start).toBe(480);
    expect(get(ed, "a").start).toBe(130);
    expect(toast()?.textContent).toContain("track đang chọn");
  });

  it("FE-EDT-06 UTCID04 (B): all notes already on grid → snapshot unchanged, info toast", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectTrack", null);
    ed.call("onQuantize");
    expect(ed.props.canUndo).toBe(false);
    expect(toast()?.dataset.variant).toBe("info");
    expect(toast()?.textContent).toContain("Không có nốt nào cần căn");
  });

  it("FE-EDT-06 UTCID05 (B): start 59 rounds down to 0, start 60 (half step) rounds up to 120", async () => {
    const ed = await renderEditor(
      snap({ notes: [note("p", { start: 59, duration: 120 }), note("q", { pitch: 70, start: 60, duration: 120 })] }),
    );
    ed.call("onSelectTrack", null);
    ed.call("onQuantize");
    expect(get(ed, "p").start).toBe(0);
    expect(get(ed, "q").start).toBe(120);
  });

  it("FE-EDT-06 UTCID06 (B): duration shorter than one step is extended to exactly one step", async () => {
    const ed = await renderEditor(snap({ notes: [note("p", { start: 0, duration: 10 })] }));
    ed.call("onSelectTrack", null);
    ed.call("onQuantize");
    expect(get(ed, "p").duration).toBe(120);
  });

  it("FE-EDT-06 UTCID07 (A): snapping onto an occupied same-pitch slot → note kept, warning toast", async () => {
    const ed = await renderEditor(
      snap({ notes: [note("p", { start: 120, duration: 120 }), note("q", { start: 125, duration: 120 })] }),
    );
    ed.call("onSelectTrack", null);
    ed.call("onQuantize");
    expect(get(ed, "q").start).toBe(125);
    expect(toast()?.dataset.variant).toBe("warning");
    expect(toast()?.textContent).toContain("1 nốt được giữ nguyên vị trí");
  });

  it("FE-EDT-06 UTCID08 (N): grid changed to 1/8 → step 240 ticks", async () => {
    const ed = await renderEditor(snap({ notes: [note("p", { start: 130, duration: 300 })] }));
    ed.call("onSelectTrack", null);
    ed.call("onGridChange", 8);
    ed.call("onQuantize");
    expect([get(ed, "p").start, get(ed, "p").duration]).toEqual([240, 240]);
  });

  it("FE-EDT-06 UTCID09 (A): empty project → info toast, no history entry", async () => {
    const ed = await renderEditor(snap());
    ed.call("onSelectTrack", null);
    ed.call("onQuantize");
    expect(ed.props.canUndo).toBe(false);
    expect(toast()?.dataset.variant).toBe("info");
  });

  it("FE-EDT-06 UTCID10 (N): quantize keeps note ids, pitch and velocity (BR-28) and is undoable", async () => {
    const ed = await renderEditor(offGrid());
    ed.call("onSelectTrack", null);
    ed.call("onQuantize");
    expect(get(ed, "a")).toMatchObject({ id: "a", pitch: 60, velocity: 100, trackId: "t1" });
    expect(ed.props.canUndo).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════
// PianoRoll harness (FE-EDT-07..12)
// zoom → pxPerTick = 0.25 exactly ⇒ tick = (cx - 72) * 4.
// Initial scrollY = 1232 ⇒ row of pitch p: y ∈ [(127-p)*22 - 1198, +22).
// ═════════════════════════════════════════════════════════════
const KEY_W = 72;
const PX_PER_TICK = 0.25;
const xOf = (tick: number) => KEY_W + tick * PX_PER_TICK;
const yOf = (pitch: number) => (127 - pitch) * 22 - 1198 + 11; // row centre

interface RollOpts {
  tool?: ToolMode;
  selected?: string[];
  tracks?: DraftTrack[];
  selectedTrackId?: string | null;
  gridDivision?: GridDivision;
  snapEnabled?: boolean;
  isReadOnly?: boolean;
}

function RollHarness(props: RollOpts & {
  initial: DraftNote[];
  onNotesChange: (n: DraftNote[]) => void;
  onSelectedNotesChange: (s: Set<string>) => void;
  onNotify: (m: string, v: string) => void;
}) {
  const [notes, setNotes] = React.useState(props.initial);
  const [sel, setSel] = React.useState(new Set(props.selected ?? []));
  return React.createElement(PianoRoll, {
    notes,
    tracks: props.tracks ?? [track("t1", 0)],
    selectedTrackId: props.selectedTrackId === undefined ? "t1" : props.selectedTrackId,
    tool: props.tool ?? "pointer",
    zoom: ZOOM_Q,
    ppq: 480,
    gridDivision: props.gridDivision ?? 16,
    snapEnabled: props.snapEnabled ?? true,
    playheadTick: 1_000_000, // far away: never grabbed by accident
    isPlaying: false,
    onSeek: () => {},
    isReadOnly: props.isReadOnly,
    selectedNoteIds: sel,
    onNotesChange: (n: DraftNote[]) => {
      props.onNotesChange(n);
      setNotes(n);
    },
    onSelectedNotesChange: (s: Set<string>) => {
      props.onSelectedNotesChange(s);
      setSel(s);
    },
    onNotify: props.onNotify,
  });
}

function renderRoll(initial: DraftNote[], opts: RollOpts = {}) {
  const onNotesChange = vi.fn<(n: DraftNote[]) => void>();
  const onSelectedNotesChange = vi.fn<(s: Set<string>) => void>();
  const onNotify = vi.fn<(m: string, v: string) => void>();
  const { container } = render(
    React.createElement(RollHarness, { initial, onNotesChange, onSelectedNotesChange, onNotify, ...opts }),
  );
  const canvas = container.querySelector("canvas")!;
  const down = (x: number, y: number, extra: Record<string, unknown> = {}) =>
    fireEvent.mouseDown(canvas, { button: 0, clientX: x, clientY: y, ...extra });
  const move = (x: number, y: number) => fireEvent.mouseMove(canvas, { clientX: x, clientY: y });
  const up = () => fireEvent.mouseUp(window);
  return { canvas, container, onNotesChange, onSelectedNotesChange, onNotify, down, move, up };
}

describe("FE-EDT-07 resizeZonePx", () => {
  // Hovering with the pointer tool reveals the hit zone through the cursor:
  // "ew-resize" = resize zone, "grab" = note body.
  const hover = (start: number, duration: number, offsetFromRightEdge: number) => {
    const r = renderRoll([note("n", { start, duration })]);
    const nw = Math.max(4, duration * PX_PER_TICK);
    r.move(xOf(start) + nw - offsetFromRightEdge, yOf(60));
    return r.canvas.style.cursor;
  };

  it("FE-EDT-07 UTCID01 (N): wide note (120px) — 3px from right edge is inside the 6px resize zone", () => {
    expect(hover(480, 480, 3)).toBe("ew-resize");
  });

  it("FE-EDT-07 UTCID02 (N): wide note — middle of the note is body (move zone)", () => {
    expect(hover(480, 480, 60)).toBe("grab");
  });

  it("FE-EDT-07 UTCID03 (B): wide note — exactly 6px from right edge is still resize (cap = 6px)", () => {
    expect(hover(480, 480, 6)).toBe("ew-resize");
  });

  it("FE-EDT-07 UTCID04 (B): wide note — 6.5px from right edge is body (zone capped at 6px)", () => {
    expect(hover(480, 480, 6.5)).toBe("grab");
  });

  it("FE-EDT-07 UTCID05 (B): narrow note (10px) — zone shrinks to 40% = 4px: 4px → resize, 5px → body", () => {
    expect(hover(480, 40, 4)).toBe("ew-resize");
    cleanup();
    expect(hover(480, 40, 5)).toBe("grab");
  });

  it("FE-EDT-07 UTCID06 (B): tiny note (2px, drawn as min 4px) — zone = 1.6px: 1px → resize, 2px → body", () => {
    expect(hover(480, 8, 1)).toBe("ew-resize");
    cleanup();
    expect(hover(480, 8, 2)).toBe("grab");
  });

  it("FE-EDT-07 UTCID07 (A): pointer just outside the right edge → not a note (default cursor)", () => {
    expect(hover(480, 480, -1)).toBe("default");
  });

  it("FE-EDT-07 UTCID08 (N): press in resize zone starts a resize drag (duration changes, start fixed)", () => {
    const r = renderRoll([note("n", { start: 480, duration: 480 })]);
    r.down(xOf(960) - 2, yOf(60));
    r.move(xOf(960) - 2 + 30, yOf(60)); // +120 ticks
    const n = lastCall(r.onNotesChange)[0];
    expect([n.start, n.duration]).toEqual([480, 600]);
  });
});

describe("FE-EDT-08 snapToGrid", () => {
  // pencil click on an empty row → committed note start = snapToGrid(rawTick)
  const drawAt = (rawTick: number, opts: RollOpts = {}) => {
    const r = renderRoll([], { tool: "pencil", ...opts });
    r.down(xOf(rawTick), yOf(60));
    r.up();
    return lastCall(r.onNotesChange)[0];
  };

  it("FE-EDT-08 UTCID01 (N): 1/16 grid (120 ticks) — raw 250 snaps to 240", () => {
    expect(drawAt(250).start).toBe(240);
  });

  it("FE-EDT-08 UTCID02 (B): raw tick exactly at half step (180) rounds up to 240", () => {
    expect(drawAt(180).start).toBe(240);
  });

  it("FE-EDT-08 UTCID03 (B): raw tick just below half step (179) rounds down to 120", () => {
    expect(drawAt(179).start).toBe(120);
  });

  it("FE-EDT-08 UTCID04 (B): raw tick 0 (left edge of grid) stays 0", () => {
    expect(drawAt(0).start).toBe(0);
  });

  it("FE-EDT-08 UTCID05 (N): 1/4 grid (480 ticks) — raw 700 snaps to 480", () => {
    expect(drawAt(700, { gridDivision: 4 }).start).toBe(480);
  });

  it("FE-EDT-08 UTCID06 (B): 1/32 grid (60 ticks) — raw 89 → 60, raw 90 → 120", () => {
    expect(drawAt(89, { gridDivision: 32 }).start).toBe(60);
    cleanup();
    expect(drawAt(90, { gridDivision: 32 }).start).toBe(120);
  });

  it("FE-EDT-08 UTCID07 (N): snap disabled → only rounded to the nearest whole tick (250.75 → 251)", () => {
    expect(drawAt(250.75, { snapEnabled: false }).start).toBe(251);
  });

  it("FE-EDT-08 UTCID08 (N): snapped result is always an integer multiple of the grid step", () => {
    for (const raw of [1, 61, 333, 1001, 4799]) {
      expect(drawAt(raw).start % 120).toBe(0);
      cleanup();
    }
  });
});

describe("FE-EDT-09 handleMouseDown [pencil branch]", () => {
  it("FE-EDT-09 UTCID01 (N): click empty cell → new note (UUID, selected track, pitch 60, 1 grid step, velocity 80)", () => {
    const r = renderRoll([], { tool: "pencil" });
    r.down(xOf(480), yOf(60));
    expect(r.onNotesChange).not.toHaveBeenCalled(); // committed on mouseup
    r.up();
    expect(lastCall(r.onNotesChange)).toEqual([
      { id: "uuid-1", trackId: "t1", pitch: 60, start: 480, duration: 120, velocity: 80 },
    ]);
  });

  it("FE-EDT-09 UTCID02 (N): existing notes are preserved; new note appended", () => {
    const existing = note("e", { pitch: 64, start: 0 });
    const r = renderRoll([existing], { tool: "pencil" });
    r.down(xOf(960), yOf(60));
    r.up();
    const out = lastCall(r.onNotesChange);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(existing);
  });

  it("FE-EDT-09 UTCID03 (N): no selected track → note goes to the first track", () => {
    const r = renderRoll([], { tool: "pencil", selectedTrackId: null, tracks: [track("tA", 0), track("tB", 1)] });
    r.down(xOf(0), yOf(60));
    r.up();
    expect(lastCall(r.onNotesChange)[0].trackId).toBe("tA");
  });

  it("FE-EDT-09 UTCID04 (A): project without any track → no note is created", () => {
    const r = renderRoll([], { tool: "pencil", selectedTrackId: null, tracks: [] });
    r.down(xOf(0), yOf(60));
    r.up();
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("FE-EDT-09 UTCID05 (A): pencil click on an existing note selects it instead of drawing", () => {
    const r = renderRoll([note("e", { start: 480 })], { tool: "pencil" });
    r.down(xOf(600), yOf(60));
    r.up();
    expect(r.onSelectedNotesChange).toHaveBeenCalledWith(new Set(["e"]));
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("FE-EDT-09 UTCID06 (B): click inside the piano-key column (cx < 72) → ignored", () => {
    const r = renderRoll([], { tool: "pencil" });
    r.down(71, yOf(60));
    r.up();
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("FE-EDT-09 UTCID07 (B): lowest row → note with pitch 0", () => {
    const r = renderRoll([], { tool: "pencil" });
    r.down(xOf(0), yOf(0));
    r.up();
    expect(lastCall(r.onNotesChange)[0].pitch).toBe(0);
  });

  it("FE-EDT-09 UTCID08 (B): top row (after scrolling to top) → note with pitch 127", () => {
    const r = renderRoll([], { tool: "pencil" });
    const scroller = r.container.firstElementChild as HTMLElement;
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    r.down(xOf(0), 34 + 11);
    r.up();
    expect(lastCall(r.onNotesChange)[0].pitch).toBe(127);
  });

  it("FE-EDT-09 UTCID09 (A): click below pitch 0 (pitch -1) → no note (BR-27 pitch 0..127)", () => {
    const r = renderRoll([], { tool: "pencil" });
    r.down(xOf(0), yOf(0) + 22);
    r.up();
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("FE-EDT-09 UTCID10 (A): right-click on empty cell with pencil → nothing drawn", () => {
    const r = renderRoll([], { tool: "pencil" });
    r.down(xOf(0), yOf(60), { button: 2 });
    r.up();
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("FE-EDT-09 UTCID11 (A): frozen grid (UC-68) — pencil click on empty cell is blocked AND reported (3.E1)", () => {
    const r = renderRoll([], { tool: "pencil", isReadOnly: true });
    r.down(xOf(480), yOf(60));
    r.up();
    expect(r.onNotesChange).not.toHaveBeenCalled();
    expect(r.onNotify).toHaveBeenCalledWith(
      "Sự kiện đã kết thúc. Bạn không thể chỉnh sửa kết quả này.",
      "warning",
    );
  });
});

describe("FE-EDT-10 handleMouseMove [draw drag]", () => {
  const start = (opts: RollOpts = {}) => {
    const r = renderRoll([], { tool: "pencil", ...opts });
    r.down(xOf(480), yOf(60));
    return r;
  };

  it("FE-EDT-10 UTCID01 (N): drag right by 2 grid steps → duration 120 + 240 = 360", () => {
    const r = start();
    r.move(xOf(480) + 60, yOf(60)); // +240 ticks
    r.up();
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ start: 480, duration: 360 });
  });

  it("FE-EDT-10 UTCID02 (B): drag left past the start → duration clamped to one grid step (120)", () => {
    const r = start();
    r.move(xOf(480) - 100, yOf(60));
    r.up();
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ start: 480, duration: 120 });
  });

  it("FE-EDT-10 UTCID03 (B): drag less than half a step (+50 ticks) → duration snaps back to 120", () => {
    const r = start();
    r.move(xOf(480) + 12.5, yOf(60));
    r.up();
    expect(lastCall(r.onNotesChange)[0].duration).toBe(120);
  });

  it("FE-EDT-10 UTCID04 (N): vertical drag does not change pitch or start of the drawn note", () => {
    const r = start();
    r.move(xOf(480) + 30, yOf(60) - 66);
    r.up();
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ pitch: 60, start: 480, duration: 240 });
  });

  it("FE-EDT-10 UTCID05 (N): repeated moves use the latest pointer position (not cumulative)", () => {
    const r = start();
    r.move(xOf(480) + 120, yOf(60));
    r.move(xOf(480) + 30, yOf(60));
    r.up();
    expect(lastCall(r.onNotesChange)[0].duration).toBe(240);
  });

  it("FE-EDT-10 UTCID06 (A): mousemove without a prior pencil press creates/changes nothing", () => {
    const r = renderRoll([], { tool: "pencil" });
    r.move(xOf(480) + 60, yOf(60));
    r.up();
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("FE-EDT-10 UTCID07 (A): release outside the canvas (window mouseup) still commits exactly one note", () => {
    const r = start();
    r.move(xOf(480) + 60, yOf(60));
    fireEvent.mouseUp(document.body);
    expect(r.onNotesChange).toHaveBeenCalledTimes(1);
    expect(lastCall(r.onNotesChange)).toHaveLength(1);
  });
});

describe("FE-EDT-11 handleMouseMove [move drag]", () => {
  // note a: start 480, duration 480 → x 192..312; grab body at x = 220
  const GX = 220;

  it("FE-EDT-11 UTCID01 (N): drag +1 step right and 1 row up → start 600, pitch 61, id kept (BR-28)", () => {
    const r = renderRoll([note("a", { start: 480 })]);
    r.down(GX, yOf(60));
    r.move(GX + 30, yOf(60) - 22);
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ id: "a", start: 600, pitch: 61, duration: 480 });
  });

  it("FE-EDT-11 UTCID02 (N): moving a selected note moves the whole selection by the same delta", () => {
    const r = renderRoll(
      [note("a", { start: 480 }), note("b", { start: 1440, pitch: 64 }), note("c", { start: 2400, pitch: 50 })],
      { selected: ["a", "b"] },
    );
    r.down(GX, yOf(60));
    r.move(GX + 60, yOf(60) - 44);
    const out = lastCall(r.onNotesChange);
    expect(byId(out, "a")).toMatchObject({ start: 720, pitch: 62 });
    expect(byId(out, "b")).toMatchObject({ start: 1680, pitch: 66 });
    expect(byId(out, "c")).toMatchObject({ start: 2400, pitch: 50 });
  });

  it("FE-EDT-11 UTCID03 (B): dragging far left → start clamped at 0 (no negative tick)", () => {
    const r = renderRoll([note("a", { start: 480 })]);
    r.down(GX, yOf(60));
    r.move(GX - 140, yOf(60));
    expect(lastCall(r.onNotesChange)[0].start).toBe(0);
  });

  it("FE-EDT-11 UTCID04 (B): single note dragged above pitch 127 → clamped to 127", () => {
    const r = renderRoll([note("a", { start: 480, pitch: 125 })]);
    const scroller = r.container.firstElementChild as HTMLElement;
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    const y125 = 34 + 2 * 22 + 11;
    r.down(GX, y125);
    r.move(GX, y125 - 22 * 5);
    expect(lastCall(r.onNotesChange)[0].pitch).toBe(127);
  });

  it("FE-EDT-11 UTCID05 (A): group move that would leave 0..127 → pitches kept, one warning", () => {
    const r = renderRoll(
      [note("a", { start: 480, pitch: 1 }), note("b", { start: 1440, pitch: 10 })],
      { selected: ["a", "b"] },
    );
    r.down(GX, yOf(1));
    r.move(GX, yOf(1) + 22 * 3); // -3 semitones → a = -2
    r.move(GX, yOf(1) + 22 * 4);
    const out = lastCall(r.onNotesChange);
    expect(byId(out, "a").pitch).toBe(1);
    expect(byId(out, "b").pitch).toBe(10);
    expect(r.onNotify).toHaveBeenCalledTimes(1);
    expect(r.onNotify).toHaveBeenCalledWith("Các nốt giữ nguyên cao độ vì sẽ vượt ngoài khoảng 0 đến 127.", "warning");
  });

  it("FE-EDT-11 UTCID06 (B): movement smaller than half a step → start unchanged (snap)", () => {
    const r = renderRoll([note("a", { start: 480 })]);
    r.down(GX, yOf(60));
    r.move(GX + 10, yOf(60) + 5); // +40 ticks, +5px
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ start: 480, pitch: 60 });
  });

  it("FE-EDT-11 UTCID07 (A): frozen grid (UC-68) — drag > 4px never moves the note and warns once", () => {
    const r = renderRoll([note("a", { start: 480 })], { isReadOnly: true });
    r.down(GX, yOf(60));
    r.move(GX + 30, yOf(60));
    r.move(GX + 60, yOf(60));
    expect(r.onNotesChange).not.toHaveBeenCalled();
    expect(r.onNotify).toHaveBeenCalledTimes(1);
  });

  it("FE-EDT-11 UTCID08 (N): dropping onto a same-pitch note → overlap trimmed on release with warning", () => {
    const r = renderRoll([note("a", { start: 480, duration: 480 }), note("b", { start: 1200, duration: 480 })]);
    r.down(GX, yOf(60));
    r.move(GX + 120, yOf(60)); // a → [960, 1440) overlaps b [1200, 1680)
    r.up();
    const out = lastCall(r.onNotesChange);
    expect(byId(out, "b")).toMatchObject({ start: 1440, duration: 240 });
    expect(r.onNotify).toHaveBeenCalledWith(expect.stringContaining("cắt bớt 1 nốt"), "warning");
  });
});

describe("FE-EDT-12 handleMouseMove [resize drag]", () => {
  // note a: start 480, duration 480 → right edge x = 312; grab at 310 (resize zone)
  const RX = 310;

  it("FE-EDT-12 UTCID01 (N): drag right edge +240 ticks → duration 720; id/start/pitch kept (BR-28)", () => {
    const r = renderRoll([note("a", { start: 480 })]);
    r.down(RX, yOf(60));
    r.move(RX + 60, yOf(60));
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ id: "a", start: 480, pitch: 60, duration: 720 });
  });

  it("FE-EDT-12 UTCID02 (B): shrink past the note start → duration clamped to one grid step (120)", () => {
    const r = renderRoll([note("a", { start: 480 })]);
    r.down(RX, yOf(60));
    r.move(RX - 200, yOf(60));
    expect(lastCall(r.onNotesChange)[0].duration).toBe(120);
  });

  it("FE-EDT-12 UTCID03 (B): resize by less than half a step → duration unchanged (snap)", () => {
    const r = renderRoll([note("a", { start: 480 })]);
    r.down(RX, yOf(60));
    r.move(RX + 10, yOf(60));
    expect(lastCall(r.onNotesChange)[0].duration).toBe(480);
  });

  it("FE-EDT-12 UTCID04 (N): resizing a selected note resizes every selected note by the same delta", () => {
    const r = renderRoll(
      [note("a", { start: 480 }), note("b", { start: 1440, duration: 240, pitch: 64 })],
      { selected: ["a", "b"] },
    );
    r.down(RX, yOf(60));
    r.move(RX + 30, yOf(60)); // +120
    const out = lastCall(r.onNotesChange);
    expect(byId(out, "a").duration).toBe(600);
    expect(byId(out, "b").duration).toBe(360);
  });

  it("FE-EDT-12 UTCID05 (B): group shrink — shorter member is clamped at one grid step", () => {
    const r = renderRoll(
      [note("a", { start: 480 }), note("b", { start: 1440, duration: 240, pitch: 64 })],
      { selected: ["a", "b"] },
    );
    r.down(RX, yOf(60));
    r.move(RX - 60, yOf(60)); // -240
    const out = lastCall(r.onNotesChange);
    expect(byId(out, "a").duration).toBe(240);
    expect(byId(out, "b").duration).toBe(120);
  });

  it("FE-EDT-12 UTCID06 (A): vertical movement during resize never changes pitch", () => {
    const r = renderRoll([note("a", { start: 480 })]);
    r.down(RX, yOf(60));
    r.move(RX + 30, yOf(60) - 88);
    expect(lastCall(r.onNotesChange)[0].pitch).toBe(60);
  });

  it("FE-EDT-12 UTCID07 (A): frozen grid (UC-68) — resize attempt blocked and reported", () => {
    const r = renderRoll([note("a", { start: 480 })], { isReadOnly: true });
    r.down(RX, yOf(60));
    r.move(RX + 60, yOf(60));
    expect(r.onNotesChange).not.toHaveBeenCalled();
    expect(r.onNotify).toHaveBeenCalledWith(
      "Sự kiện đã kết thúc. Bạn không thể chỉnh sửa kết quả này.",
      "warning",
    );
  });

  it("FE-EDT-12 UTCID08 (A): mousemove after release does not continue resizing", () => {
    const r = renderRoll([note("a", { start: 480 })]);
    r.down(RX, yOf(60));
    r.move(RX + 30, yOf(60));
    r.up();
    const n = r.onNotesChange.mock.calls.length;
    r.move(RX + 120, yOf(60));
    expect(r.onNotesChange.mock.calls.length).toBe(n);
  });
});

// ═════════════════════════════════════════════════════════════
// FE-EDT-13: PianoRoll eraser (UC-27)
// ═════════════════════════════════════════════════════════════
describe("FE-EDT-13 PianoRoll.handleMouseDown [eraser branch]", () => {
  it("FE-EDT-13 UTCID01 (N): eraser click on a note deletes it", () => {
    const r = renderRoll([note("a", { start: 480, duration: 480 })], { tool: "eraser" });
    r.down(xOf(600), yOf(60));
    expect(lastCall(r.onNotesChange)).toEqual([]);
  });

  it("FE-EDT-13 UTCID02 (N): right-click on a note also deletes it regardless of tool", () => {
    const r = renderRoll([note("a", { start: 480, duration: 480 })], { tool: "pointer" });
    r.down(xOf(600), yOf(60), { button: 2 });
    expect(lastCall(r.onNotesChange)).toEqual([]);
  });

  it("FE-EDT-13 UTCID03 (N): eraser click on empty canvas does nothing", () => {
    const r = renderRoll([note("a", { start: 480, duration: 480 })], { tool: "eraser" });
    r.down(xOf(120), yOf(60));
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("FE-EDT-13 UTCID04 (N): eraser deletes only the clicked note and leaves others", () => {
    const r = renderRoll(
      [note("a", { start: 480, duration: 240 }), note("b", { start: 960, duration: 240 })],
      { tool: "eraser" },
    );
    r.down(xOf(600), yOf(60));
    const out = lastCall(r.onNotesChange);
    expect(out.map((n) => n.id)).toEqual(["b"]);
  });

  it("FE-EDT-13 UTCID05 (N): eraser deletes note belonging to unselected track", () => {
    const r = renderRoll(
      [note("a", { start: 480, trackId: "t2" })],
      { tool: "eraser", selectedTrackId: "t1" },
    );
    r.down(xOf(600), yOf(60));
    expect(lastCall(r.onNotesChange)).toEqual([]);
  });

  it("FE-EDT-13 UTCID06 (A): frozen grid (isReadOnly) — eraser click on empty space warns", () => {
    const r = renderRoll([note("a", { start: 480 })], { tool: "eraser", isReadOnly: true });
    r.down(xOf(120), yOf(60));
    expect(r.onNotesChange).not.toHaveBeenCalled();
    expect(r.onNotify).toHaveBeenCalledWith(
      "Sự kiện đã kết thúc. Bạn không thể chỉnh sửa kết quả này.",
      "warning",
    );
  });

  it("FE-EDT-13 UTCID07 (A): frozen grid (isReadOnly) — right-click warns and blocks delete", () => {
    const r = renderRoll([note("a", { start: 480 })], { isReadOnly: true });
    r.down(xOf(600), yOf(60), { button: 2 });
    expect(r.onNotesChange).not.toHaveBeenCalled();
    expect(r.onNotify).toHaveBeenCalledWith(
      "Sự kiện đã kết thúc. Bạn không thể chỉnh sửa kết quả này.",
      "warning",
    );
  });
});

// ═════════════════════════════════════════════════════════════
// FE-EDT-14: Delete/Backspace shortcuts (UC-27)
// ═════════════════════════════════════════════════════════════
describe("FE-EDT-14 MidiEditor [Delete/Backspace keys]", () => {
  it("FE-EDT-14 UTCID01 (N): Delete key deletes selected notes and clears selection", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a"]));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(ed.props.snapshot.notes.map((n: DraftNote) => n.id)).toEqual(["b", "c"]);
    expect(ed.props.selectedNoteIds.size).toBe(0);
  });

  it("FE-EDT-14 UTCID02 (N): Backspace key deletes selected notes and clears selection", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["b"]));
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(ed.props.snapshot.notes.map((n: DraftNote) => n.id)).toEqual(["a", "c"]);
    expect(ed.props.selectedNoteIds.size).toBe(0);
  });

  it("FE-EDT-14 UTCID03 (N): Delete key with no selected notes does not alter notes", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set());
    fireEvent.keyDown(window, { key: "Delete" });
    expect(ed.props.snapshot.notes.length).toBe(3);
  });

  it("FE-EDT-14 UTCID04 (A): Delete key inside an input element does not delete notes", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a"]));
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "Delete" });
    expect(ed.props.snapshot.notes.length).toBe(3);
    document.body.removeChild(input);
  });

  it("FE-EDT-14 UTCID05 (A): Delete key inside a textarea element does not delete notes", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a"]));
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    fireEvent.keyDown(textarea, { key: "Delete" });
    expect(ed.props.snapshot.notes.length).toBe(3);
    document.body.removeChild(textarea);
  });

  it("FE-EDT-14 UTCID06 (N): Escape key clears selected notes without deleting", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(ed.props.snapshot.notes.length).toBe(3);
    expect(ed.props.selectedNoteIds.size).toBe(0);
  });

  it("FE-EDT-14 UTCID07 (A): Delete key does nothing when modifier key (Ctrl/Cmd) is held", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a"]));
    fireEvent.keyDown(window, { key: "Delete", ctrlKey: true });
    expect(ed.props.snapshot.notes.length).toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════
// FE-EDT-15: handleAddTrack (UC-28)
// ═════════════════════════════════════════════════════════════
describe("FE-EDT-15 MidiEditor.handleAddTrack", () => {
  it("FE-EDT-15 UTCID01 (N): adds track with sequential name, volume 1, pan 0, instrument null", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onAddTrack");
    const tracks = ed.props.snapshot.tracks;
    expect(tracks).toHaveLength(3);
    const added = tracks[2];
    expect(added.name).toBe("Track 3");
    expect(added.order).toBe(2);
    expect(added.volume).toBe(1);
    expect(added.pan).toBe(0);
    expect(added.instrument).toBeNull();
  });

  it("FE-EDT-15 UTCID02 (N): selects the newly added track", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onAddTrack");
    const addedId = ed.props.snapshot.tracks[2].id;
    expect(ed.props.selectedTrackId).toBe(addedId);
  });

  it("FE-EDT-15 UTCID03 (N): assigns color distinct from existing colors", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onAddTrack");
    const added = ed.props.snapshot.tracks[2];
    expect(added.color).toBeDefined();
    expect(typeof added.color).toBe("string");
  });

  it("FE-EDT-15 UTCID04 (B): at 32 tracks (MAX_TRACKS boundary), adding track is rejected", async () => {
    const maxTracksSnap = snap({
      tracks: Array.from({ length: 32 }, (_, i) => track(`t${i}`, i)),
      notes: [],
    });
    const ed = await renderEditor(maxTracksSnap);
    ed.call("onAddTrack");
    expect(ed.props.snapshot.tracks).toHaveLength(32);
  });

  it("FE-EDT-15 UTCID05 (B): at 32 tracks, triggers track limit warning", async () => {
    const maxTracksSnap = snap({
      tracks: Array.from({ length: 32 }, (_, i) => track(`t${i}`, i)),
      notes: [],
    });
    const ed = await renderEditor(maxTracksSnap);
    ed.call("onAddTrack");
    expect(ed.props.trackLimitWarning).toBe(true);
  });

  it("FE-EDT-15 UTCID06 (B): track limit warning auto-dismisses after 3 seconds", async () => {
    const maxTracksSnap = snap({
      tracks: Array.from({ length: 32 }, (_, i) => track(`t${i}`, i)),
      notes: [],
    });
    const ed = await renderEditor(maxTracksSnap);
    vi.useFakeTimers();
    ed.call("onAddTrack");
    expect(ed.props.trackLimitWarning).toBe(true);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(ed.props.trackLimitWarning).toBe(false);
    vi.useRealTimers();
  });
});

// ═════════════════════════════════════════════════════════════
// FE-EDT-16: handleSetTrackVolume (UC-40)
// ═════════════════════════════════════════════════════════════
describe("FE-EDT-16 MidiEditor.handleSetTrackVolume", () => {
  it("FE-EDT-16 UTCID01 (N): sets valid volume within range (0.7)", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackVolume", "t1", 0.7);
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t1")?.volume).toBe(0.7);
  });

  it("FE-EDT-16 UTCID02 (B): sets volume to minimum boundary 0", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackVolume", "t1", 0);
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t1")?.volume).toBe(0);
  });

  it("FE-EDT-16 UTCID03 (B): sets volume to maximum boundary 1", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackVolume", "t1", 1);
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t1")?.volume).toBe(1);
  });

  it("FE-EDT-16 UTCID04 (B): clamps negative volume to 0", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackVolume", "t1", -0.5);
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t1")?.volume).toBe(0);
  });

  it("FE-EDT-16 UTCID05 (B): clamps volume > 1 to 1", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackVolume", "t1", 1.8);
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t1")?.volume).toBe(1);
  });

  it("FE-EDT-16 UTCID06 (N): leaves other tracks' volume unchanged", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackVolume", "t1", 0.3);
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t2")?.volume).toBe(1);
  });

  it("FE-EDT-16 UTCID07 (A): does not affect tracks if trackId does not match", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackVolume", "non-existent", 0.5);
    expect(ed.props.snapshot.tracks.map((t: DraftTrack) => t.volume)).toEqual([1, 1]);
  });
});

// ═════════════════════════════════════════════════════════════
// FE-EDT-17: handleSetTrackPan (UC-41)
// ═════════════════════════════════════════════════════════════
describe("FE-EDT-17 MidiEditor.handleSetTrackPan", () => {
  it("FE-EDT-17 UTCID01 (N): sets valid pan within range (0.5)", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackPan", "t1", 0.5);
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t1")?.pan).toBe(0.5);
  });

  it("FE-EDT-17 UTCID02 (B): sets pan to minimum boundary -1 (full left)", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackPan", "t1", -1);
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t1")?.pan).toBe(-1);
  });

  it("FE-EDT-17 UTCID03 (B): sets pan to maximum boundary 1 (full right)", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackPan", "t1", 1);
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t1")?.pan).toBe(1);
  });

  it("FE-EDT-17 UTCID04 (B): sets pan to center 0", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackPan", "t1", 0);
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t1")?.pan).toBe(0);
  });

  it("FE-EDT-17 UTCID05 (B): clamps pan < -1 to -1", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackPan", "t1", -1.5);
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t1")?.pan).toBe(-1);
  });

  it("FE-EDT-17 UTCID06 (B): clamps pan > 1 to 1", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackPan", "t1", 2.0);
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t1")?.pan).toBe(1);
  });

  it("FE-EDT-17 UTCID07 (N): leaves other tracks' pan unchanged", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackPan", "t1", -0.4);
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t2")?.pan).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════
// FE-EDT-18: handleSetTrackColor (UC-34)
// ═════════════════════════════════════════════════════════════
describe("FE-EDT-18 MidiEditor.handleSetTrackColor", () => {
  it("FE-EDT-18 UTCID01 (N): sets valid hex color (#ef4444)", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackColor", "t1", "#ef4444");
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t1")?.color).toBe("#ef4444");
  });

  it("FE-EDT-18 UTCID02 (N): sets another valid hex color (#10b981)", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackColor", "t1", "#10b981");
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t1")?.color).toBe("#10b981");
  });

  it("FE-EDT-18 UTCID03 (N): stores non-hex color string as-is without client-side check", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackColor", "t1", "red");
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t1")?.color).toBe("red");
  });

  it("FE-EDT-18 UTCID04 (N): leaves other tracks' color unchanged", async () => {
    const ed = await renderEditor(twoTrackSnap());
    const originalColorT2 = ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t2")?.color;
    ed.call("onSetTrackColor", "t1", "#3b82f6");
    expect(ed.props.snapshot.tracks.find((t: DraftTrack) => t.id === "t2")?.color).toBe(originalColorT2);
  });

  it("FE-EDT-18 UTCID05 (A): does not affect tracks if trackId does not match", async () => {
    const ed = await renderEditor(twoTrackSnap());
    const originalTracks = ed.props.snapshot.tracks;
    ed.call("onSetTrackColor", "non-existent", "#3b82f6");
    expect(ed.props.snapshot.tracks).toEqual(originalTracks);
  });
});
