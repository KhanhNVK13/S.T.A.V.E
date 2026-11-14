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
import { VelocityLane, applyVelocity, clampVelocity } from "./velocity-lane";
import { PianoRoll, resizeZonePx, snapTickToGrid, type ToolMode, type GridDivision } from "./piano-roll";
import { MidiEditor } from "./midi-editor";
import { setPatternClipboard } from "../../lib/pattern-clipboard";
import { probeInstrumentSamples } from "../../lib/instrument-samples";
import { TRACK_COLOR_PALETTE } from "../../lib/track-colors";
import { Dialog } from "../ui/dialog";

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
  const base = () =>
    snap({
      tracks: [track("t1", 0), track("t2", 1)],
      notes: [note("a"), note("b", { start: 480 }), note("c", { trackId: "t2", pitch: 64 })],
    });
  const withMeta = (s: DraftSnapshot, meta: Partial<DraftSnapshot["meta"]>) => ({ ...s, meta: { ...s.meta, ...meta } });
  const ZERO = { added: 0, removed: 0, modified: 0 };

  it("UTCID01 (B): both snapshots without notes/tracks → total 0, all counts 0, metaChanged false", () => {
    const r = summarizeChanges(snap({ tracks: [], notes: [] }), snap({ tracks: [], notes: [] }));
    expect(r).toEqual({ notes: ZERO, tracks: ZERO, metaChanged: false, total: 0 });
  });

  it("UTCID02 (N): 3 notes, 2 tracks, identical → total 0, all counts 0, metaChanged false", () => {
    const r = summarizeChanges(base(), structuredClone(base()));
    expect(r).toEqual({ notes: ZERO, tracks: ZERO, metaChanged: false, total: 0 });
  });

  it("UTCID03 (N): 1 note added → notes.added 1, total 1", () => {
    const next = base();
    next.notes.push(note("d", { start: 960 }));
    const r = summarizeChanges(base(), next);
    expect(r.notes).toEqual({ added: 1, removed: 0, modified: 0 });
    expect(r.total).toBe(1);
  });

  it("UTCID04 (N): 1 note removed → notes.removed 1, total 1", () => {
    const next = base();
    next.notes.pop();
    const r = summarizeChanges(base(), next);
    expect(r.notes).toEqual({ added: 0, removed: 1, modified: 0 });
    expect(r.total).toBe(1);
  });

  it("UTCID05 (N): 1 note velocity changed → notes.modified 1, total 1", () => {
    const next = base();
    next.notes[0] = { ...next.notes[0], velocity: 50 };
    const r = summarizeChanges(base(), next);
    expect(r.notes).toEqual({ added: 0, removed: 0, modified: 1 });
    expect(r.total).toBe(1);
  });

  it("UTCID06 (N): 1 note trackId changed → notes.modified 1, total 1", () => {
    const next = base();
    next.notes[0] = { ...next.notes[0], trackId: "t2" };
    const r = summarizeChanges(base(), next);
    expect(r.notes).toEqual({ added: 0, removed: 0, modified: 1 });
    expect(r.total).toBe(1);
  });

  it("UTCID07 (A): 1 note id changed, same content → added 1 + removed 1, total 2", () => {
    const next = base();
    next.notes[0] = { ...next.notes[0], id: "a-new" };
    const r = summarizeChanges(base(), next);
    expect(r.notes).toEqual({ added: 1, removed: 1, modified: 0 });
    expect(r.total).toBe(2);
  });

  it("UTCID08 (N): 1 track added → tracks.added 1, total 1", () => {
    const next = base();
    next.tracks.push(track("t3", 2));
    const r = summarizeChanges(base(), next);
    expect(r.tracks).toEqual({ added: 1, removed: 0, modified: 0 });
    expect(r.total).toBe(1);
  });

  it("UTCID09 (N): 1 track removed → tracks.removed 1, total 1", () => {
    const next = base();
    next.tracks.pop();
    const r = summarizeChanges(base(), next);
    expect(r.tracks).toEqual({ added: 0, removed: 1, modified: 0 });
    expect(r.total).toBe(1);
  });

  it("UTCID10 (N): 1 track name changed → tracks.modified 1, total 1", () => {
    const next = base();
    next.tracks[0] = { ...next.tracks[0], name: "Lead" };
    const r = summarizeChanges(base(), next);
    expect(r.tracks).toEqual({ added: 0, removed: 0, modified: 1 });
    expect(r.total).toBe(1);
  });

  it("UTCID11 (A): only soundMap changed → tracks.modified 1, total 1", () => {
    const next = base();
    next.tracks[0] = { ...next.tracks[0], soundMap: { "36": "0b3a5f6e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" } };
    const r = summarizeChanges(base(), next);
    expect(r.tracks).toEqual({ added: 0, removed: 0, modified: 1 });
    expect(r.total).toBe(1);
  });

  it("UTCID12 (N): tempo 120 → 140 → metaChanged true, total 1", () => {
    const r = summarizeChanges(base(), withMeta(base(), { tempo: 140 }));
    expect(r.metaChanged).toBe(true);
    expect(r.total).toBe(1);
  });

  it("UTCID13 (N): timeSignature [4,4] → [3,4] → metaChanged true, total 1", () => {
    const r = summarizeChanges(base(), withMeta(base(), { timeSignature: [3, 4] }));
    expect(r.metaChanged).toBe(true);
    expect(r.total).toBe(1);
  });

  it("UTCID14 (N): ppq 480 → 960 → metaChanged true, total 1", () => {
    const r = summarizeChanges(base(), withMeta(base(), { ppq: 960 }));
    expect(r.metaChanged).toBe(true);
    expect(r.total).toBe(1);
  });

  it("mixed changes → total = sum of all counts + meta", () => {
    const b = snap({ tracks: [track("t1", 0), track("t2", 1)], notes: [note("a"), note("b"), note("c")] });
    const next = snap({
      tracks: [track("t1", 0, { volume: 0.5 }), track("t3", 2)],
      notes: [note("a", { start: 120 }), note("c"), note("d"), note("e")],
    });
    next.meta = { ...next.meta, ppq: 960 };
    const r = summarizeChanges(b, next);
    expect(r.notes).toEqual({ added: 2, removed: 1, modified: 1 });
    expect(r.tracks).toEqual({ added: 1, removed: 1, modified: 1 });
    expect(r.metaChanged).toBe(true);
    expect(r.total).toBe(8);
  });

  it("pure function — inputs are not mutated", () => {
    const b = snap({ notes: [note("n1")] });
    const next = snap({ notes: [note("n1", { pitch: 70 }), note("n2")] });
    const b0 = structuredClone(b);
    const n0 = structuredClone(next);
    summarizeChanges(b, next);
    expect(b).toEqual(b0);
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
  it.each([
    ["UTCID01 (N)", 64, 64],
    ["UTCID02 (N)", 63.6, 64],
    ["UTCID03 (B)", 1, 1],
    ["UTCID04 (B)", 127, 127],
    ["UTCID05 (B)", 0, 1],
    ["UTCID06 (B)", 0.5, 1],
    ["UTCID07 (B)", 128, 127],
    ["UTCID08 (B)", 127.4, 127],
    ["UTCID09 (A)", -10, 1],
    ["UTCID10 (A)", 200, 127],
  ])("%s: v = %d → %d", (_id, v, expected) => {
    expect(clampVelocity(v)).toBe(expected);
  });

  it("UTCID11 (A): v = NaN → a value within 1..127", () => {
    const v = clampVelocity(Number.NaN);
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(1);
    expect(v).toBeLessThanOrEqual(127);
  });

  const n1 = () => note("n1", { start: 0, velocity: 100 });

  it("lane click at mid height (raw 63.5) rounds to 64", () => {
    const { spy, canvas } = renderLane([n1()]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 53 });
    expect(byId(lastCall(spy), "n1").velocity).toBe(64);
  });

  it("lane click at the bottom edge (raw 0) is clamped to 1", () => {
    const { spy, canvas } = renderLane([n1()]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 96 });
    expect(byId(lastCall(spy), "n1").velocity).toBe(1);
  });

  it("lane click at the top edge (raw ≈141.8) is clamped to 127", () => {
    const { spy, canvas } = renderLane([n1()]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 0 });
    expect(byId(lastCall(spy), "n1").velocity).toBe(127);
  });

  it("result is always an integer within 1..127 across the lane", () => {
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
  const A = note("A", { velocity: 80 });
  const B = note("B", { start: 480, velocity: 60 });
  const C = note("C", { start: 960, velocity: 100 });
  const notes = [A, B, C];
  const originals = () => new Map([["A", 80], ["B", 60], ["C", 100]]);
  const run = (selected: string[], next: number, orig = originals()) => {
    const onNotesChange = vi.fn<(n: DraftNote[]) => void>();
    onNotesChange(applyVelocity(notes, new Set(selected), A, next, orig));
    return lastCall(onNotesChange);
  };

  it("UTCID01 (N): A not selected, next 100 → only A = 100; B, C unchanged", () => {
    const out = run([], 100);
    expect(byId(out, "A")).toMatchObject({ id: "A", velocity: 100 });
    expect(byId(out, "B")).toBe(B);
    expect(byId(out, "C")).toBe(C);
  });

  it("UTCID02 (N): A and B selected, next 100 → A = 100, B = 80 (+20); C unchanged", () => {
    const out = run(["A", "B"], 100);
    expect([byId(out, "A").velocity, byId(out, "B").velocity]).toEqual([100, 80]);
    expect(byId(out, "C")).toBe(C);
  });

  it("UTCID03 (B): A and B selected, next 127 → A = 127, B = 107 (+47); C unchanged", () => {
    const out = run(["A", "B"], 127);
    expect([byId(out, "A").velocity, byId(out, "B").velocity]).toEqual([127, 107]);
    expect(byId(out, "C")).toBe(C);
  });

  it("UTCID04 (B): A and B selected, next 1 → A = 1, B = 1 (60 − 79 clamped); C unchanged", () => {
    const out = run(["A", "B"], 1);
    expect([byId(out, "A").velocity, byId(out, "B").velocity]).toEqual([1, 1]);
    expect(byId(out, "C")).toBe(C);
  });

  it("UTCID05 (N): A not selected, next 80 (same as original) → called with the same note objects", () => {
    const out = run([], 80);
    out.forEach((n, i) => expect(n).toBe(notes[i]));
  });

  it("UTCID06 (A): A not selected, next 150 → only A = 127 (clamped)", () => {
    const out = run([], 150);
    expect(byId(out, "A").velocity).toBe(127);
    expect(byId(out, "B")).toBe(B);
    expect(byId(out, "C")).toBe(C);
  });

  it("UTCID07 (N): B selected, A not selected, next 100 → only A = 100; B, C unchanged", () => {
    const out = run(["B"], 100);
    expect(byId(out, "A").velocity).toBe(100);
    expect(byId(out, "B")).toBe(B);
    expect(byId(out, "C")).toBe(C);
  });

  it("UTCID08 (N): A and B selected, empty originals (fallback to note velocity) → A = 100, B = 80; C unchanged", () => {
    const out = run(["A", "B"], 100, new Map());
    expect([byId(out, "A").velocity, byId(out, "B").velocity]).toEqual([100, 80]);
    expect(byId(out, "C")).toBe(C);
  });

  it("lane drag: grabbed note inside a selection shifts every selected note by the same delta", () => {
    const { spy, canvas } = renderLane(
      [note("n1", { velocity: 100 }), note("n2", { start: 480, velocity: 60 })],
      { selected: ["n1", "n2"] },
    );
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 53 });
    const out = lastCall(spy);
    expect(byId(out, "n1").velocity).toBe(64);
    expect(byId(out, "n2").velocity).toBe(24);
  });

  it("lane drag is relative to the ORIGINAL velocities (no cumulative drift)", () => {
    const { spy, canvas } = renderLane(
      [note("n1", { velocity: 100 }), note("n2", { start: 480, velocity: 60 })],
      { selected: ["n1", "n2"] },
    );
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 53 });
    fireEvent.mouseMove(canvas, { clientX: 78, clientY: 50 });
    fireEvent.mouseMove(canvas, { clientX: 78, clientY: 53 });
    const out = lastCall(spy);
    expect(byId(out, "n1").velocity).toBe(64);
    expect(byId(out, "n2").velocity).toBe(24);
  });

  it("readOnly lane → onNotesChange never called", () => {
    const { spy, canvas } = renderLane([note("n1")], { readOnly: true });
    fireEvent.mouseDown(canvas, { button: 0, clientX: 78, clientY: 53 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("right mouse button → onNotesChange never called", () => {
    const { spy, canvas } = renderLane([note("n1")]);
    fireEvent.mouseDown(canvas, { button: 2, clientX: 78, clientY: 53 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("click on empty area / label column → nothing changes", () => {
    const { spy, canvas } = renderLane([note("n1")]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 150, clientY: 53 });
    fireEvent.mouseDown(canvas, { button: 0, clientX: 30, clientY: 53 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("mousemove after window mouseup does not keep editing", () => {
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
  it("UTCID01 (A): empty selection → no-op, clipboard state unchanged", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onCopy");
    expect(clipboardWriteText).not.toHaveBeenCalled();
    expect(setPatternClipboard).not.toHaveBeenCalled();
    expect(ed.props.hasClipboard).toBe(false);
    expect(toast()).toBeNull();
  });

  it("UTCID02 (N): 2 selected ids present in notes → clipboard holds 2 notes; JSON written to the system clipboard", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    ed.call("onCopy");
    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    const written = JSON.parse(clipboardWriteText.mock.calls[0][0]) as DraftNote[];
    expect(written.map((n) => n.id)).toEqual(["a", "b"]);
    expect(setPatternClipboard).toHaveBeenCalledWith(
      expect.objectContaining({ ppq: 480, notes: [expect.objectContaining({ id: "a" }), expect.objectContaining({ id: "b" })] }),
    );
    expect(ed.props.hasClipboard).toBe(true);
    expect(toast()?.textContent).toBe("Đã sao chép 2 nốt.");
  });

  it("UTCID03 (A): only a stale id (not in notes) selected → no-op, clipboard state unchanged", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["ghost"]));
    ed.call("onCopy");
    expect(clipboardWriteText).not.toHaveBeenCalled();
    expect(setPatternClipboard).not.toHaveBeenCalled();
    expect(ed.props.hasClipboard).toBe(false);
  });

  it("UTCID04 (A): 1 present + 1 stale id → clipboard holds 1 note (stale id ignored)", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "ghost"]));
    ed.call("onCopy");
    const written = JSON.parse(clipboardWriteText.mock.calls[0][0]) as DraftNote[];
    expect(written.map((n) => n.id)).toEqual(["a"]);
    expect((h.clipboardStore as { notes: DraftNote[] }).notes.map((n) => n.id)).toEqual(["a"]);
    expect(toast()?.textContent).toBe("Đã sao chép 1 nốt.");
  });

  it("UTCID05 (A): writeText rejects → clipboard holds 2 notes; rejection swallowed", async () => {
    clipboardWriteText.mockRejectedValueOnce(new Error("NotAllowedError"));
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    ed.call("onCopy");
    await act(async () => {});
    expect(ed.props.hasClipboard).toBe(true);
    expect((h.clipboardStore as { notes: DraftNote[] }).notes).toHaveLength(2);
    expect(toast()?.dataset.variant).toBe("success");
  });

  it("UTCID06 (A): navigator.clipboard undefined (insecure context) → clipboard holds 2 notes, system clipboard skipped, no error", async () => {
    const ed = await renderEditor(twoTrackSnap());
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true, writable: true });
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    expect(() => ed.call("onCopy")).not.toThrow();
    expect(ed.props.hasClipboard).toBe(true);
    expect((h.clipboardStore as { notes: DraftNote[] }).notes).toHaveLength(2);
    expect(toast()?.textContent).toBe("Đã sao chép 2 nốt.");
  });

  it("UTCID07 (A): selection spanning 2 tracks → copied with its track grouping, toast mentions the track count", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "c"]));
    ed.call("onCopy");
    expect(toast()?.textContent).toBe("Đã sao chép 2 nốt từ 2 track.");
  });

  it("Ctrl+C shortcut triggers copy of the current selection", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    act(() => {
      fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    });
    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
  });

  it("UTCID08 (A): Ctrl+X (cut) copies the selected notes then removes them from the track; with no selection nothing happens", async () => {
    const ed = await renderEditor(twoTrackSnap());
    act(() => {
      fireEvent.keyDown(window, { key: "x", ctrlKey: true });
    });
    expect(ed.props.snapshot.notes).toHaveLength(3);
    expect(ed.props.hasClipboard).toBe(false);
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    act(() => {
      fireEvent.keyDown(window, { key: "x", ctrlKey: true });
    });
    expect(ed.props.snapshot.notes.map((n: DraftNote) => n.id)).toEqual(["c"]);
    expect((h.clipboardStore as { notes: DraftNote[] }).notes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(ed.props.selectedNoteIds.size).toBe(0);
  });

  it("copy does not modify the project", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    ed.call("onCopy");
    expect(ed.props.notes.map((n: DraftNote) => n.id)).toEqual(["a", "b", "c"]);
    expect(ed.props.canUndo).toBe(false);
  });
});

describe("FE-EDT-05 handlePaste", () => {
  const SRC = [{ id: "s1", name: "Src", order: 0, instrument: null }];
  const twoClip = () => ({
    notes: [
      note("x", { trackId: "s1", pitch: 60, start: 960, duration: 480 }),
      note("y", { trackId: "s1", pitch: 64, start: 1440, duration: 480 }),
    ],
    tracks: SRC,
    ppq: 480,
  });
  const pastedOf = (ed: { props: Record<string, any> }) =>
    (ed.props.notes as DraftNote[]).filter((n) => n.id.startsWith("uuid-"));

  it("UTCID01 (A): clipboard null → no-op, snapshot unchanged", async () => {
    h.clipboardStore = null;
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onPaste");
    expect(ed.props.notes.map((n: DraftNote) => n.id)).toEqual(["a", "b", "c"]);
    expect(ed.props.canUndo).toBe(false);
  });

  it("UTCID02 (A): clipboard [] (empty) → no-op, snapshot unchanged", async () => {
    h.clipboardStore = { notes: [], tracks: SRC, ppq: 480 };
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onPaste");
    expect(ed.props.notes).toHaveLength(3);
    expect(ed.props.canUndo).toBe(false);
  });

  it("UTCID03 (A): no selected track and no tracks → no-op, snapshot unchanged", async () => {
    h.clipboardStore = twoClip();
    const ed = await renderEditor(snap({ tracks: [] }));
    ed.call("onSeek", 1920);
    ed.call("onPaste");
    expect(ed.props.notes).toHaveLength(0);
    expect(ed.props.tracks).toHaveLength(0);
  });

  it("UTCID04 (N): 2 notes at 960/1440, track t2, playhead 1920 → appended at 1920/2400 on t2 with new ids, selected", async () => {
    h.clipboardStore = twoClip();
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectTrack", "t2");
    ed.call("onSeek", 1920);
    ed.call("onPaste");
    const pasted = pastedOf(ed);
    expect(pasted.map((n) => [n.trackId, n.pitch, n.start, n.duration])).toEqual([
      ["t2", 60, 1920, 480],
      ["t2", 64, 2400, 480],
    ]);
    expect(pasted.map((n) => n.id)).not.toContain("x");
    expect([...ed.props.selectedNoteIds]).toEqual(pasted.map((n) => n.id));
  });

  it("UTCID05 (B): no selected track, tracks[0] = t1, playhead 0 → appended at 0/480 on t1 with new ids, selected", async () => {
    h.clipboardStore = twoClip();
    const ed = await renderEditor(snap({ tracks: [track("t1", 0), track("t2", 1)] }));
    ed.call("onSelectTrack", null);
    ed.call("onSeek", 0);
    ed.call("onPaste");
    const pasted = pastedOf(ed);
    expect(pasted.map((n) => [n.trackId, n.start])).toEqual([
      ["t1", 0],
      ["t1", 480],
    ]);
    expect([...ed.props.selectedNoteIds]).toEqual(pasted.map((n) => n.id));
  });

  it("UTCID06 (N): 1 note at 0, track t2, playhead 480 → appended at 480 on t2, selected", async () => {
    h.clipboardStore = { notes: [note("x", { trackId: "s1", start: 0 })], tracks: SRC, ppq: 480 };
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectTrack", "t2");
    ed.call("onSeek", 480);
    ed.call("onPaste");
    const pasted = pastedOf(ed);
    expect(pasted.map((n) => [n.trackId, n.start])).toEqual([["t2", 480]]);
    expect([...ed.props.selectedNoteIds]).toEqual([pasted[0].id]);
  });

  it("UTCID07 (A): notes copied from t1 & t3, target t2 → pasted on t2 and the track below, grouping kept", async () => {
    const s = snap({
      tracks: [track("t1", 0), track("t2", 1), track("t3", 2)],
      notes: [note("a", { trackId: "t1", start: 960 }), note("c", { trackId: "t3", pitch: 48, start: 1440 })],
    });
    const ed = await renderEditor(s);
    ed.call("onSelectedNotesChange", new Set(["a", "c"]));
    ed.call("onCopy");
    ed.call("onSelectTrack", "t2");
    ed.call("onSeek", 1920);
    ed.call("onPaste");
    const pasted = pastedOf(ed);
    expect(pasted.map((n) => [n.trackId, n.pitch, n.start])).toEqual([
      ["t2", 60, 1920],
      ["t3", 48, 2400],
    ]);
    expect(ed.props.tracks).toHaveLength(3);
  });

  it("UTCID08 (A): t2 already has pitch 60 at 1920–2400 → overlapped part trimmed and reported", async () => {
    h.clipboardStore = twoClip();
    const s = snap({
      tracks: [track("t1", 0), track("t2", 1)],
      notes: [note("old", { trackId: "t2", pitch: 60, start: 1600, duration: 800 })],
    });
    const ed = await renderEditor(s);
    ed.call("onSelectTrack", "t2");
    ed.call("onSeek", 1920);
    ed.call("onPaste");
    const old = (ed.props.notes as DraftNote[]).find((n) => n.id === "old")!;
    expect(old).toMatchObject({ start: 1600, duration: 320 });
    expect(toast()?.dataset.variant).toBe("warning");
    expect(toast()?.textContent).toContain("cắt bớt 1 nốt");
  });

  it("clipboard ppq 960 pasted into a ppq 480 project → timing rescaled", async () => {
    h.clipboardStore = {
      notes: [note("x", { start: 960, duration: 960 }), note("y", { start: 1920, duration: 480 })],
      tracks: [{ id: "t1", name: "Src", order: 0, instrument: null }],
      ppq: 960,
    };
    const ed = await renderEditor(snap());
    ed.call("onSeek", 0);
    ed.call("onPaste");
    expect(pastedOf(ed).map((n) => [n.start, n.duration])).toEqual([
      [0, 480],
      [480, 240],
    ]);
  });

  it("clipboard note with invalid pitch 200 is skipped with a warning", async () => {
    h.clipboardStore = {
      notes: [note("x", { pitch: 200 }), note("y", { pitch: 62, start: 480 })],
      tracks: [{ id: "t1", name: "Src", order: 0, instrument: null }],
      ppq: 480,
    };
    const ed = await renderEditor(snap());
    ed.call("onPaste");
    expect(pastedOf(ed).map((n) => n.pitch)).toEqual([62]);
    expect(toast()?.textContent).toContain("1 nốt không hợp lệ đã bị bỏ qua.");
  });

  it("multi-track paste at the 32-track limit → extra-track notes skipped with a warning", async () => {
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
    expect(pastedOf(ed).map((n) => n.trackId)).toEqual(["t32"]);
    expect(toast()?.textContent).toContain("1 nốt không được dán vì đã đủ số track tối đa.");
  });

  it("multi-track paste below the limit creates the missing track", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "c"]));
    ed.call("onCopy");
    ed.call("onSelectTrack", "t2");
    ed.call("onSeek", 4800);
    ed.call("onPaste");
    expect(ed.props.tracks).toHaveLength(3);
    expect(toast()?.textContent).toContain("Tạo thêm 1 track.");
  });

  it("Ctrl+V shortcut pastes the clipboard", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["b"]));
    ed.call("onCopy");
    ed.call("onSeek", 9600);
    act(() => {
      fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    });
    expect(ed.props.notes).toHaveLength(4);
  });
});

describe("FE-EDT-06 handleQuantize", () => {
  const get = (ed: { props: Record<string, any> }, id: string) =>
    (ed.props.notes as DraftNote[]).find((n) => n.id === id)!;
  async function quantizeOne(start: number, duration: number, grid?: number) {
    const ed = await renderEditor(snap({ notes: [note("p", { start, duration })] }));
    ed.call("onSelectTrack", null);
    if (grid) ed.call("onGridChange", grid);
    ed.call("onQuantize");
    return { ed, p: get(ed, "p") };
  }

  it("UTCID01 (N): grid 1/16, start 130, duration 100 → start 120, duration 120", async () => {
    const { p } = await quantizeOne(130, 100);
    expect([p.start, p.duration]).toEqual([120, 120]);
  });

  it("UTCID02 (B): grid 1/16, start 60 (half step), duration 240 → start 120, duration 240", async () => {
    const { p } = await quantizeOne(60, 240);
    expect([p.start, p.duration]).toEqual([120, 240]);
  });

  it("UTCID03 (B): grid 1/16, start 0, duration 30 (< step) → start 0, duration 120", async () => {
    const { p } = await quantizeOne(0, 30);
    expect([p.start, p.duration]).toEqual([0, 120]);
  });

  it("UTCID04 (N): grid 1/4 (step 480), start 130, duration 240 → start 0, duration 480", async () => {
    const { p } = await quantizeOne(130, 240, 4);
    expect([p.start, p.duration]).toEqual([0, 480]);
  });

  it("UTCID05 (N): grid 1/32 (step 60), start 119, duration 100 → start 120, duration 120", async () => {
    const { p } = await quantizeOne(119, 100, 32);
    expect([p.start, p.duration]).toEqual([120, 120]);
  });

  it("UTCID06 (A): no notes → no change (no undo point, no save)", async () => {
    const { putDraft } = await import("../../lib/api-client");
    const ed = await renderEditor(snap());
    vi.mocked(putDraft).mockClear();
    ed.call("onSelectTrack", null);
    ed.call("onQuantize");
    await act(async () => {});
    expect(ed.props.canUndo).toBe(false);
    expect(putDraft).not.toHaveBeenCalled();
    expect(toast()?.dataset.variant).toBe("info");
  });

  it("UTCID07 (N): 2 notes, 1 selected → only the selected note quantized", async () => {
    const ed = await renderEditor(
      snap({ notes: [note("p", { start: 130, duration: 120 }), note("q", { pitch: 62, start: 250, duration: 120 })] }),
    );
    ed.call("onSelectedNotesChange", new Set(["q"]));
    ed.call("onQuantize");
    expect(get(ed, "q").start).toBe(240);
    expect(get(ed, "p").start).toBe(130);
  });

  it("UTCID08 (N): no selection, notes on t1 (active) and t2 → only t1 notes quantized", async () => {
    const ed = await renderEditor(
      snap({
        tracks: [track("t1", 0), track("t2", 1)],
        notes: [note("p", { trackId: "t1", start: 130 }), note("q", { trackId: "t2", start: 250 })],
      }),
    );
    ed.call("onSelectTrack", "t1");
    ed.call("onQuantize");
    expect(get(ed, "p").start).toBe(120);
    expect(get(ed, "q").start).toBe(250);
  });

  it("UTCID09 (B): note already on grid (120, 240) → no change (no undo point, no save)", async () => {
    const { putDraft } = await import("../../lib/api-client");
    const ed = await renderEditor(snap({ notes: [note("p", { start: 120, duration: 240 })] }));
    vi.mocked(putDraft).mockClear();
    ed.call("onSelectTrack", null);
    ed.call("onQuantize");
    await act(async () => {});
    expect(ed.props.canUndo).toBe(false);
    expect(putDraft).not.toHaveBeenCalled();
    expect(get(ed, "p")).toMatchObject({ start: 120, duration: 240 });
  });

  it("UTCID10 (A): no selection, 2 pitch-60 notes at 115 and 125 → earlier note kept, collision reported", async () => {
    const ed = await renderEditor(
      snap({ notes: [note("p", { start: 115, duration: 120 }), note("q", { start: 125, duration: 120 })] }),
    );
    ed.call("onSelectTrack", null);
    ed.call("onQuantize");
    const starts = [get(ed, "p").start, get(ed, "q").start];
    expect(starts).toContain(120);
    expect(starts.filter((s) => s === 120)).toHaveLength(1);
    expect(toast()?.dataset.variant).toBe("warning");
    expect(toast()?.textContent).toContain("1 nốt được giữ nguyên vị trí");
  });

  it("quantize keeps note ids, pitch and velocity and is undoable", async () => {
    const { ed, p } = await quantizeOne(130, 110);
    expect(p).toMatchObject({ id: "p", pitch: 60, velocity: 100, trackId: "t1" });
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
  it.each([
    ["UTCID01 (N)", 100, 6],
    ["UTCID02 (B)", 15, 6],
    ["UTCID03 (N)", 10, 4],
    ["UTCID04 (B)", 0, 0],
    ["UTCID05 (A)", -5, -2],
  ])("%s: noteWidth %d → %d", (_id, width, expected) => {
    expect(resizeZonePx(width)).toBeCloseTo(expected, 9);
  });

  const hover = (start: number, duration: number, offsetFromRightEdge: number) => {
    const r = renderRoll([note("n", { start, duration })]);
    const nw = Math.max(4, duration * PX_PER_TICK);
    r.move(xOf(start) + nw - offsetFromRightEdge, yOf(60));
    return r.canvas.style.cursor;
  };

  it("wide note (120px): 3px from the right edge is inside the 6px resize zone, middle is body", () => {
    expect(hover(480, 480, 3)).toBe("ew-resize");
    cleanup();
    expect(hover(480, 480, 60)).toBe("grab");
  });

  it("wide note: 6px from the right edge is resize, 6.5px is body (zone capped at 6px)", () => {
    expect(hover(480, 480, 6)).toBe("ew-resize");
    cleanup();
    expect(hover(480, 480, 6.5)).toBe("grab");
  });

  it("narrow note (10px): zone shrinks to 40% = 4px", () => {
    expect(hover(480, 40, 4)).toBe("ew-resize");
    cleanup();
    expect(hover(480, 40, 5)).toBe("grab");
  });

  it("pointer just outside the right edge → not a note (default cursor)", () => {
    expect(hover(480, 480, -1)).toBe("default");
  });

  it("press in the resize zone starts a resize drag (duration changes, start fixed)", () => {
    const r = renderRoll([note("n", { start: 480, duration: 480 })]);
    r.down(xOf(960) - 2, yOf(60));
    r.move(xOf(960) - 2 + 30, yOf(60));
    const n = lastCall(r.onNotesChange)[0];
    expect([n.start, n.duration]).toEqual([480, 600]);
  });
});

describe("FE-EDT-08 snapToGrid", () => {
  const stepOf = (grid: number) => 480 / (grid / 4);
  const drawAt = (rawTick: number, opts: RollOpts = {}) => {
    const r = renderRoll([], { tool: "pencil", ...opts });
    r.down(xOf(rawTick), yOf(60));
    r.up();
    return lastCall(r.onNotesChange)[0];
  };

  it("UTCID01 (N): ppq 480, 1/16 (step 120), tick 250 → 240", () => {
    expect(snapTickToGrid(250, stepOf(16))).toBe(240);
    expect(drawAt(250).start).toBe(240);
  });

  it("UTCID02 (B): tick 0 → 0", () => {
    expect(snapTickToGrid(0, stepOf(16))).toBe(0);
    expect(drawAt(0).start).toBe(0);
  });

  it("UTCID03 (B): tick 60 (half step) → 120", () => {
    expect(snapTickToGrid(60, stepOf(16))).toBe(120);
    expect(drawAt(60).start).toBe(120);
  });

  it("UTCID04 (B): tick 59.9 → 0", () => {
    expect(snapTickToGrid(59.9, stepOf(16))).toBe(0);
  });

  it("UTCID05 (N): 1/4 (step 480), tick 250 → 480", () => {
    expect(snapTickToGrid(250, stepOf(4))).toBe(480);
    expect(drawAt(250, { gridDivision: 4 }).start).toBe(480);
  });

  it("UTCID06 (N): 1/32 (step 60), tick 250 → 240", () => {
    expect(snapTickToGrid(250, stepOf(32))).toBe(240);
    expect(drawAt(250, { gridDivision: 32 }).start).toBe(240);
  });

  it("UTCID07 (A): tick -70 → -120 (no lower clamp)", () => {
    expect(snapTickToGrid(-70, stepOf(16))).toBe(-120);
  });

  it("snap disabled → only rounded to the nearest whole tick (250.75 → 251)", () => {
    expect(drawAt(250.75, { snapEnabled: false }).start).toBe(251);
  });
});

describe("FE-EDT-09 handleMouseDown [pencil branch]", () => {
  const twoTracks = () => [track("t1", 0), track("t2", 1)];
  const drawOne = (tick: number, pitchY: number, opts: RollOpts = {}, existing: DraftNote[] = []) => {
    const r = renderRoll(existing, { tool: "pencil", tracks: twoTracks(), selectedTrackId: "t2", ...opts });
    r.down(xOf(tick), pitchY);
    r.up();
    return r;
  };

  it("UTCID01 (N): pitch 60, tick 960, track t2 → new note t2, start 960, dur 120, velocity 80", () => {
    const r = drawOne(960, yOf(60));
    expect(lastCall(r.onNotesChange)).toEqual([
      { id: "uuid-1", trackId: "t2", pitch: 60, start: 960, duration: 120, velocity: 80 },
    ]);
  });

  it("UTCID02 (N): tick 1000 snaps to 960 → new note t2, start 960, dur 120, velocity 80", () => {
    const r = drawOne(1000, yOf(60));
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ trackId: "t2", pitch: 60, start: 960, duration: 120, velocity: 80 });
  });

  it("UTCID03 (B): bottom row → new note at pitch 0 on t2", () => {
    const r = drawOne(960, yOf(0));
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ trackId: "t2", pitch: 0 });
  });

  it("UTCID04 (B): top row → new note at pitch 127 on t2", () => {
    const r = renderRoll([], { tool: "pencil", tracks: twoTracks(), selectedTrackId: "t2" });
    const scroller = r.container.firstElementChild as HTMLElement;
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    r.down(xOf(960), 34 + 11);
    r.up();
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ trackId: "t2", pitch: 127 });
  });

  it("UTCID05 (A): below the last row (pitch -1) → no note created, no drag started", () => {
    const r = drawOne(960, yOf(0) + 22);
    r.move(xOf(1200), yOf(0) + 22);
    r.up();
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("UTCID06 (N): no selected track, tracks[0] = t1 → new note on t1", () => {
    const r = drawOne(960, yOf(60), { selectedTrackId: null });
    expect(lastCall(r.onNotesChange)[0].trackId).toBe("t1");
  });

  it("UTCID07 (A): no selected track and no tracks → no note created, no drag started", () => {
    const r = drawOne(960, yOf(60), { selectedTrackId: null, tracks: [] });
    r.move(xOf(1200), yOf(60));
    r.up();
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("UTCID08 (A): click lands on an existing t2 note (pitch 60, 960) → it is selected, no duplicate", () => {
    const r = drawOne(960, yOf(60), {}, [note("e", { trackId: "t2", start: 960 })]);
    expect(r.onSelectedNotesChange).toHaveBeenCalledWith(new Set(["e"]));
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("existing notes are preserved; the new note is appended", () => {
    const existing = note("e", { pitch: 64, start: 0 });
    const r = renderRoll([existing], { tool: "pencil" });
    r.down(xOf(960), yOf(60));
    r.up();
    const out = lastCall(r.onNotesChange);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(existing);
  });

  it("click inside the piano-key column (cx < 72) → ignored", () => {
    const r = renderRoll([], { tool: "pencil" });
    r.down(71, yOf(60));
    r.up();
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("right-click on an empty cell with the pencil → nothing drawn", () => {
    const r = renderRoll([], { tool: "pencil" });
    r.down(xOf(0), yOf(60), { button: 2 });
    r.up();
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("UTCID09 (A): snapping turned off, click at tick 1005 → note starts at the exact clicked position, one step long", () => {
    const r = drawOne(1005, yOf(60), { snapEnabled: false });
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ trackId: "t2", pitch: 60, start: 1005, duration: 120, velocity: 80 });
  });

  it("UTCID10 (A): view-only grid, pencil click on an empty cell → no note created, edit warning shown", () => {
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
  const dragBy = (ticks: number) => {
    const r = start();
    r.move(xOf(480) + ticks * PX_PER_TICK, yOf(60));
    r.up();
    return lastCall(r.onNotesChange)[0];
  };

  it("UTCID01 (N): draw drag +240 ticks → preview duration 360", () => {
    expect(dragBy(240)).toMatchObject({ start: 480, duration: 360 });
  });

  it("UTCID02 (B): +50 ticks → duration 120", () => {
    expect(dragBy(50).duration).toBe(120);
  });

  it("UTCID03 (B): +70 ticks → duration 240", () => {
    expect(dragBy(70).duration).toBe(240);
  });

  it("UTCID04 (A): -200 ticks → duration 120 (min one step)", () => {
    expect(dragBy(-200)).toMatchObject({ start: 480, duration: 120 });
  });

  it("UTCID05 (A): no preview note (no pencil press) → move is a no-op", () => {
    const r = renderRoll([], { tool: "pencil" });
    r.move(xOf(480) + 60, yOf(60));
    r.up();
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("vertical drag does not change pitch or start of the drawn note", () => {
    const r = start();
    r.move(xOf(480) + 30, yOf(60) - 66);
    r.up();
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ pitch: 60, start: 480, duration: 240 });
  });

  it("repeated moves use the latest pointer position (not cumulative)", () => {
    const r = start();
    r.move(xOf(480) + 120, yOf(60));
    r.move(xOf(480) + 30, yOf(60));
    r.up();
    expect(lastCall(r.onNotesChange)[0].duration).toBe(240);
  });

  it("release outside the canvas still commits exactly one note", () => {
    const r = start();
    r.move(xOf(480) + 60, yOf(60));
    fireEvent.mouseUp(document.body);
    expect(r.onNotesChange).toHaveBeenCalledTimes(1);
    expect(lastCall(r.onNotesChange)).toHaveLength(1);
  });
});

describe("FE-EDT-11 handleMouseMove [move drag]", () => {
  const GX = 220;
  const topY = (p: number) => 34 + (127 - p) * 22 + 11;
  const scrollTop = (r: ReturnType<typeof renderRoll>) => {
    const scroller = r.container.firstElementChild as HTMLElement;
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
  };
  const single = () => renderRoll([note("a", { start: 480, pitch: 60 })]);
  const group = () => {
    const r = renderRoll(
      [note("a", { start: 0, pitch: 10 }), note("b", { start: 480, pitch: 120 })],
      { selected: ["a", "b"] },
    );
    scrollTop(r);
    r.down(GX, topY(120));
    return r;
  };

  it("UTCID01 (N): 1 note start 480, dx +480 ticks → start 960, pitch 60", () => {
    const r = single();
    r.down(GX, yOf(60));
    r.move(GX + 120, yOf(60));
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ id: "a", start: 960, pitch: 60 });
  });

  it("UTCID02 (A): dx -960 ticks → start 0 (clamped), pitch 60", () => {
    const r = single();
    r.down(GX, yOf(60));
    r.move(GX - 240, yOf(60));
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ start: 0, pitch: 60 });
  });

  it("UTCID03 (N): dx +130 ticks → start 600 (snapped), pitch 60", () => {
    const r = single();
    r.down(GX, yOf(60));
    r.move(GX + 32.5, yOf(60));
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ start: 600, pitch: 60 });
  });

  it("UTCID04 (N): dy 3 rows up → start 480, pitch 63", () => {
    const r = single();
    r.down(GX, yOf(60));
    r.move(GX, yOf(60) - 66);
    expect(lastCall(r.onNotesChange)[0]).toMatchObject({ start: 480, pitch: 63 });
  });

  it("UTCID05 (B): group pitches 10 & 120, 20 rows up → whole gesture rejected: pitches stay 10 & 120, warning", () => {
    const r = group();
    r.move(GX, topY(120) - 22 * 20);
    const out = lastCall(r.onNotesChange);
    expect([byId(out, "a").pitch, byId(out, "b").pitch]).toEqual([10, 120]);
    expect(r.onNotify).toHaveBeenCalledWith("Các nốt giữ nguyên cao độ vì sẽ vượt ngoài khoảng 0 đến 127.", "warning");
  });

  it("UTCID06 (B): group pitches 10 & 120, 20 rows down → whole gesture rejected: pitches stay 10 & 120, warning", () => {
    const r = group();
    r.move(GX, topY(120) + 22 * 20);
    const out = lastCall(r.onNotesChange);
    expect([byId(out, "a").pitch, byId(out, "b").pitch]).toEqual([10, 120]);
    expect(r.onNotify).toHaveBeenCalledTimes(1);
  });

  it("UTCID07 (B): group starts 0 & 480, dx -960 ticks → starts unchanged (delta clamped to 0)", () => {
    const r = group();
    r.move(GX - 240, topY(120));
    const out = lastCall(r.onNotesChange);
    expect([byId(out, "a").start, byId(out, "b").start]).toEqual([0, 480]);
  });

  it("UTCID09 (A): single note dragged above pitch 127 → stopped at 127, not rejected", () => {
    const r = renderRoll([note("a", { start: 480, pitch: 125 })]);
    scrollTop(r);
    r.down(GX, topY(125));
    r.move(GX, topY(125) - 22 * 5);
    expect(lastCall(r.onNotesChange)[0].pitch).toBe(127);
  });

  it("group within bounds moves together by the same delta", () => {
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

  it("UTCID10 (A): view-only grid, drag on a note → note never moves, one warning shown", () => {
    const r = renderRoll([note("a", { start: 480 })], { isReadOnly: true });
    r.down(GX, yOf(60));
    r.move(GX + 30, yOf(60));
    r.move(GX + 60, yOf(60));
    expect(r.onNotesChange).not.toHaveBeenCalled();
    expect(r.onNotify).toHaveBeenCalledTimes(1);
  });

  it("UTCID08 (A): note dropped onto a same-pitch note → overlap trimmed on release and the user is told", () => {
    const r = renderRoll([note("a", { start: 480, duration: 480 }), note("b", { start: 1200, duration: 480 })]);
    r.down(GX, yOf(60));
    r.move(GX + 120, yOf(60));
    r.up();
    const out = lastCall(r.onNotesChange);
    expect(byId(out, "b")).toMatchObject({ start: 1440, duration: 240 });
    expect(r.onNotify).toHaveBeenCalledWith(expect.stringContaining("cắt bớt 1 nốt"), "warning");
  });
});

describe("FE-EDT-12 handleMouseMove [resize drag]", () => {
  const RX = 250;
  const one = () => renderRoll([note("a", { start: 480, duration: 240 })]);
  const two = () =>
    renderRoll(
      [note("a", { start: 480, duration: 240 }), note("b", { start: 1440, duration: 120, pitch: 64 })],
      { selected: ["a", "b"] },
    );
  const resize = (r: ReturnType<typeof renderRoll>, ticks: number) => {
    r.down(RX, yOf(60));
    r.move(RX + ticks * PX_PER_TICK, yOf(60));
    return lastCall(r.onNotesChange);
  };

  it("UTCID01 (N): duration 240, dx +120 ticks → 360", () => {
    expect(resize(one(), 120)[0]).toMatchObject({ id: "a", start: 480, duration: 360 });
  });

  it("UTCID02 (B): dx -480 ticks → 120 (min one step)", () => {
    expect(resize(one(), -480)[0].duration).toBe(120);
  });

  it("UTCID03 (B): dx +50 ticks → 240 (snapped back)", () => {
    expect(resize(one(), 50)[0].duration).toBe(240);
  });

  it("UTCID04 (N): dx 0 → 240 (unchanged)", () => {
    expect(resize(one(), 0)[0].duration).toBe(240);
  });

  it("UTCID05 (N): 2 notes 240 (grabbed) & 120, dx +120 → 360 & 240", () => {
    const out = resize(two(), 120);
    expect([byId(out, "a").duration, byId(out, "b").duration]).toEqual([360, 240]);
  });

  it("UTCID06 (B): 2 notes 240 (grabbed) & 120, dx -480 → 120 & 120 (2nd clamped)", () => {
    const out = resize(two(), -480);
    expect([byId(out, "a").duration, byId(out, "b").duration]).toEqual([120, 120]);
  });

  it("vertical movement during resize never changes pitch", () => {
    const r = one();
    r.down(RX, yOf(60));
    r.move(RX + 30, yOf(60) - 88);
    expect(lastCall(r.onNotesChange)[0].pitch).toBe(60);
  });

  it("frozen grid — resize attempt blocked and reported", () => {
    const r = renderRoll([note("a", { start: 480, duration: 240 })], { isReadOnly: true });
    r.down(RX, yOf(60));
    r.move(RX + 60, yOf(60));
    expect(r.onNotesChange).not.toHaveBeenCalled();
    expect(r.onNotify).toHaveBeenCalledWith(
      "Sự kiện đã kết thúc. Bạn không thể chỉnh sửa kết quả này.",
      "warning",
    );
  });

  it("mousemove after release does not continue resizing", () => {
    const r = one();
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
  it("UTCID01 (N): eraser click on a note → onNotesChange with every note except the clicked one", () => {
    const r = renderRoll([note("a", { start: 480, duration: 480 }), note("b", { start: 1440, pitch: 64 })], { tool: "eraser" });
    r.down(xOf(600), yOf(60));
    expect(lastCall(r.onNotesChange).map((n) => n.id)).toEqual(["b"]);
  });

  it("UTCID02 (N): eraser click on an empty cell → onNotesChange not called", () => {
    const r = renderRoll([note("a", { start: 480, duration: 480 })], { tool: "eraser" });
    r.down(xOf(120), yOf(60));
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("UTCID03 (B): eraser click on the resize edge of a note → the note is removed", () => {
    const r = renderRoll([note("a", { start: 480, duration: 480 })], { tool: "eraser" });
    r.down(xOf(960) - 2, yOf(60));
    expect(lastCall(r.onNotesChange)).toEqual([]);
  });

  it("UTCID04 (N): click on one of two overlapping notes → only the hit note is removed", () => {
    const r = renderRoll(
      [note("a", { start: 480, duration: 480 }), note("b", { start: 720, duration: 480 })],
      { tool: "eraser" },
    );
    r.down(xOf(800), yOf(60));
    const out = lastCall(r.onNotesChange);
    expect(out).toHaveLength(1);
    expect(["a", "b"]).toContain(out[0].id);
  });

  it("UTCID05 (A): click inside the piano key column (x < key width) → onNotesChange not called", () => {
    const r = renderRoll([note("a", { start: 0, duration: 480 })], { tool: "eraser" });
    r.down(KEY_W - 1, yOf(60));
    expect(r.onNotesChange).not.toHaveBeenCalled();
  });

  it("UTCID06 (A): frozen grid, click on a note → not removed, only selected", () => {
    const r = renderRoll([note("a", { start: 480 })], { tool: "eraser", isReadOnly: true });
    r.down(xOf(600), yOf(60));
    expect(r.onNotesChange).not.toHaveBeenCalled();
    expect(r.onSelectedNotesChange).toHaveBeenCalledWith(new Set(["a"]));
  });

  it("UTCID07 (A): frozen grid, click on an empty cell → not called, frozen warning shown", () => {
    const r = renderRoll([note("a", { start: 480 })], { tool: "eraser", isReadOnly: true });
    r.down(xOf(120), yOf(60));
    expect(r.onNotesChange).not.toHaveBeenCalled();
    expect(r.onNotify).toHaveBeenCalledWith(
      "Sự kiện đã kết thúc. Bạn không thể chỉnh sửa kết quả này.",
      "warning",
    );
  });

  it("right-click on a note deletes it regardless of tool", () => {
    const r = renderRoll([note("a", { start: 480, duration: 480 })], { tool: "pointer" });
    r.down(xOf(600), yOf(60), { button: 2 });
    expect(lastCall(r.onNotesChange)).toEqual([]);
  });

  it("eraser deletes a note that belongs to an unselected track", () => {
    const r = renderRoll([note("a", { start: 480, trackId: "t2" })], { tool: "eraser", selectedTrackId: "t1" });
    r.down(xOf(600), yOf(60));
    expect(lastCall(r.onNotesChange)).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════
// FE-EDT-14: Delete/Backspace shortcuts (UC-27)
// ═════════════════════════════════════════════════════════════
describe("FE-EDT-14 MidiEditor [Delete/Backspace keys]", () => {
  const ids = (ed: { props: Record<string, any> }) => ed.props.snapshot.notes.map((n: DraftNote) => n.id);

  it("UTCID01 (N): Delete with 2 selected notes → both removed, selection cleared, default prevented", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    const ev = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(ids(ed)).toEqual(["c"]);
    expect(ed.props.selectedNoteIds.size).toBe(0);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("UTCID02 (N): Backspace with 1 selected note → selection cleared, the note removed", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["b"]));
    act(() => {
      fireEvent.keyDown(window, { key: "Backspace" });
    });
    expect(ids(ed)).toEqual(["a", "c"]);
    expect(ed.props.selectedNoteIds.size).toBe(0);
  });

  it("UTCID03 (N): Delete with no selection → snapshot unchanged", async () => {
    const ed = await renderEditor(twoTrackSnap());
    act(() => {
      fireEvent.keyDown(window, { key: "Delete" });
    });
    expect(ids(ed)).toEqual(["a", "b", "c"]);
    expect(ed.props.canUndo).toBe(false);
  });

  it("UTCID04 (A): Delete while typing in a text input (track rename) → notes kept", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      fireEvent.keyDown(input, { key: "Delete" });
    });
    expect(ids(ed)).toEqual(["a", "b", "c"]);
    document.body.removeChild(input);
  });

  it("UTCID05 (A): Delete while a dialog is open → notes kept", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    const dlg = render(React.createElement(Dialog, { title: "Dlg", onClose: () => {} }, "body"));
    act(() => {
      fireEvent.keyDown(window, { key: "Delete" });
    });
    expect(ids(ed)).toEqual(["a", "b", "c"]);
    dlg.unmount();
  });

  it("UTCID06 (A): Delete with Ctrl or Alt held → notes kept", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    act(() => {
      fireEvent.keyDown(window, { key: "Delete", ctrlKey: true });
      fireEvent.keyDown(window, { key: "Delete", altKey: true });
    });
    expect(ids(ed)).toEqual(["a", "b", "c"]);
  });

  it("UTCID07 (N): Escape with 2 selected notes → selection cleared, notes not removed", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(ids(ed)).toEqual(["a", "b", "c"]);
    expect(ed.props.selectedNoteIds.size).toBe(0);
  });

  it("UTCID08 (A): undo after Delete → removed notes restored with their original ids", async () => {
    const ed = await renderEditor(twoTrackSnap());
    const before = ed.props.snapshot.notes.map((n: DraftNote) => ({ ...n }));
    ed.call("onSelectedNotesChange", new Set(["a", "b"]));
    act(() => {
      fireEvent.keyDown(window, { key: "Delete" });
    });
    expect(ids(ed)).toEqual(["c"]);
    act(() => {
      fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    });
    expect(ed.props.snapshot.notes).toEqual(before);
  });

  it("UTCID09 (N): Delete removes every note of a track → the track stays in the project", async () => {
    const ed = await renderEditor(twoTrackSnap());
    const trackCount = ed.props.snapshot.tracks.length;
    ed.call("onSelectedNotesChange", new Set(["a", "b", "c"]));
    act(() => {
      fireEvent.keyDown(window, { key: "Delete" });
    });
    expect(ids(ed)).toEqual([]);
    expect(ed.props.snapshot.tracks).toHaveLength(trackCount);
  });

  it("Delete inside a textarea does not delete notes", async () => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSelectedNotesChange", new Set(["a"]));
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    fireEvent.keyDown(textarea, { key: "Delete" });
    expect(ids(ed)).toHaveLength(3);
    document.body.removeChild(textarea);
  });
});

describe("MidiEditor.handleExportMidi (custom sounds)", () => {
  beforeEach(() => {
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });
  afterEach(() => {
    delete (URL as unknown as Record<string, unknown>).createObjectURL;
    delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  });
  const withSounds = () =>
    snap({
      tracks: [track("t1", 0, { soundMap: { "60": "s1" } })],
      notes: [note("a", { trackId: "t1" })],
    });

  it("a project that uses custom sounds asks for confirmation before exporting; Cancel exports nothing", async () => {
    const { exportMidiFile } = await import("../../lib/midi-exporter");
    vi.mocked(exportMidiFile).mockClear().mockReturnValue(new Uint8Array([1]));
    const ed = await renderEditor(withSounds());
    ed.call("onExportMidi");
    expect(screen.getByText("Âm thanh tuỳ chỉnh sẽ không có trong file")).toBeTruthy();
    expect(exportMidiFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(exportMidiFile).not.toHaveBeenCalled();
  });

  it("confirming exports the MIDI file; a project without custom sounds exports at once", async () => {
    const { exportMidiFile } = await import("../../lib/midi-exporter");
    vi.mocked(exportMidiFile).mockClear().mockReturnValue(new Uint8Array([1]));
    const ed = await renderEditor(withSounds());
    ed.call("onExportMidi");
    fireEvent.click(screen.getByRole("button", { name: "Vẫn xuất MIDI" }));
    expect(exportMidiFile).toHaveBeenCalledTimes(1);
    cleanup();
    vi.mocked(exportMidiFile).mockClear();
    const plain = await renderEditor(twoTrackSnap());
    plain.call("onExportMidi");
    expect(exportMidiFile).toHaveBeenCalledTimes(1);
  });
});

describe("MidiEditor.handleAssignInstrument (assign instrument)", () => {
  const instrumentOf = (ed: { props: Record<string, any> }) => ed.props.snapshot.tracks[0].instrument;

  it("an instrument whose samples load is assigned to the track", async () => {
    const ed = await renderEditor(snap());
    await act(async () => {
      await ed.props.onAssignInstrument("t1", "Trumpet");
    });
    expect(instrumentOf(ed)).toBe("Trumpet");
  });

  it("samples that cannot be loaded → previous instrument kept and the failure is reported", async () => {
    const ed = await renderEditor(snap({ tracks: [track("t1", 0, { instrument: "Flute" })] }));
    vi.mocked(probeInstrumentSamples).mockResolvedValueOnce(false);
    await act(async () => {
      await ed.props.onAssignInstrument("t1", "Trumpet");
    });
    expect(instrumentOf(ed)).toBe("Flute");
    expect(toast()?.dataset.variant).toBe("danger");
    expect(toast()?.textContent).toContain("Trumpet");
  });
});

describe("FE-EDT-20 MidiEditor.handleDeleteTrack", () => {
  const trackIds = (ed: { props: Record<string, any> }) => ed.props.snapshot.tracks.map((t: DraftTrack) => t.id);
  const empty = () =>
    snap({
      tracks: [track("t1", 0), track("t2", 1)],
      notes: [note("a", { trackId: "t1" }), note("b", { trackId: "t1", start: 480 })],
    });

  it("UTCID01 (B): a track without notes is removed at once, without a confirmation dialog", async () => {
    const ed = await renderEditor(empty());
    ed.call("onDeleteTrack", "t2");
    expect(trackIds(ed)).toEqual(["t1"]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByText("Xoá track?")).toBeNull();
  });

  it("UTCID02 (N): a track with notes asks for confirmation stating how many notes go with it", async () => {
    const ed = await renderEditor(empty());
    ed.call("onDeleteTrack", "t1");
    expect(screen.getByText("Xoá track?")).toBeTruthy();
    expect(document.body.textContent).toContain("2 note trong track này");
    expect(trackIds(ed)).toEqual(["t1", "t2"]);
  });

  it("UTCID03 (A): Cancel leaves the project unchanged", async () => {
    const ed = await renderEditor(empty());
    ed.call("onDeleteTrack", "t1");
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(trackIds(ed)).toEqual(["t1", "t2"]);
    expect(ed.props.snapshot.notes).toHaveLength(2);
    expect(ed.props.canUndo).toBe(false);
  });

  it("UTCID04 (N): confirming removes the track together with all of its notes", async () => {
    const ed = await renderEditor(empty());
    ed.call("onDeleteTrack", "t1");
    fireEvent.click(screen.getByRole("button", { name: "Xoá track" }));
    expect(trackIds(ed)).toEqual(["t2"]);
    expect(ed.props.snapshot.notes).toHaveLength(0);
  });

  it("UTCID05 (N): removing the selected track selects the first remaining track", async () => {
    const ed = await renderEditor(empty());
    expect(ed.props.selectedTrackId).toBe("t1");
    ed.call("onDeleteTrack", "t1");
    fireEvent.click(screen.getByRole("button", { name: "Xoá track" }));
    expect(ed.props.selectedTrackId).toBe("t2");
  });

  it("UTCID06 (N): undo restores the track and its notes with their original ids", async () => {
    const ed = await renderEditor(empty());
    const before = structuredClone(ed.props.snapshot);
    ed.call("onDeleteTrack", "t1");
    fireEvent.click(screen.getByRole("button", { name: "Xoá track" }));
    act(() => {
      fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    });
    expect(ed.props.snapshot.tracks).toEqual(before.tracks);
    expect(ed.props.snapshot.notes).toEqual(before.notes);
  });

  it.fails("UTCID07 (A): the only track of a project is refused, a project must keep one track", async () => {
    const ed = await renderEditor(snap({ tracks: [track("t1", 0)], notes: [] }));
    ed.call("onDeleteTrack", "t1");
    expect(trackIds(ed)).toEqual(["t1"]);
  });
});

// ═════════════════════════════════════════════════════════════
// FE-EDT-15: handleAddTrack (UC-28)
// ═════════════════════════════════════════════════════════════
describe("FE-EDT-15 MidiEditor.handleAddTrack", () => {
  const withTracks = (n: number, colors?: string[]) =>
    snap({
      tracks: Array.from({ length: n }, (_, i) => track(`t${i}`, i, { color: colors?.[i] ?? "#000000" })),
      notes: n > 0 ? [note("x", { trackId: "t0" })] : [],
    });

  it("UTCID01 (N): 0 tracks → \"Track 1\", order 0, first palette colour, defaults, new UUID, selected", async () => {
    const ed = await renderEditor(withTracks(0));
    ed.call("onAddTrack");
    const added = ed.props.snapshot.tracks[0];
    expect(added).toEqual({
      id: "uuid-1",
      name: "Track 1",
      order: 0,
      color: TRACK_COLOR_PALETTE[0],
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
      instrument: null,
    });
    expect(ed.props.selectedTrackId).toBe("uuid-1");
  });

  it("UTCID02 (N): 3 tracks using the first 3 colours → \"Track 4\", order 3, first unused palette colour", async () => {
    const ed = await renderEditor(withTracks(3, TRACK_COLOR_PALETTE.slice(0, 3)));
    ed.call("onAddTrack");
    const added = ed.props.snapshot.tracks[3];
    expect(added).toMatchObject({ name: "Track 4", order: 3, color: TRACK_COLOR_PALETTE[3] });
  });

  it("UTCID03 (N): 1 track → new track appended once; existing tracks and notes unchanged", async () => {
    const s = withTracks(1);
    const ed = await renderEditor(s);
    ed.call("onAddTrack");
    expect(ed.props.snapshot.tracks).toHaveLength(2);
    expect(ed.props.snapshot.tracks[0]).toEqual(s.tracks[0]);
    expect(ed.props.snapshot.notes).toEqual(s.notes);
    expect(ed.props.canUndo).toBe(true);
  });

  it("UTCID04 (B): 31 tracks → the 32nd track is added, no warning", async () => {
    const ed = await renderEditor(withTracks(31));
    ed.call("onAddTrack");
    expect(ed.props.snapshot.tracks).toHaveLength(32);
    expect(ed.props.trackLimitWarning).toBe(false);
  });

  it("UTCID05 (A): 32 tracks → nothing added, snapshot not updated, warning shown then hidden after 3 s", async () => {
    const ed = await renderEditor(withTracks(32));
    vi.useFakeTimers();
    try {
      ed.call("onAddTrack");
      expect(ed.props.snapshot.tracks).toHaveLength(32);
      expect(ed.props.canUndo).toBe(false);
      expect(ed.props.trackLimitWarning).toBe(true);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(ed.props.trackLimitWarning).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("UTCID06 (B): 12 tracks using all 12 colours → colour by index (12 mod 12), no crash", async () => {
    const ed = await renderEditor(withTracks(12, [...TRACK_COLOR_PALETTE]));
    ed.call("onAddTrack");
    expect(ed.props.snapshot.tracks[12].color).toBe(TRACK_COLOR_PALETTE[12 % 12]);
  });
});

// ═════════════════════════════════════════════════════════════
// FE-EDT-16: handleSetTrackVolume (UC-40)
// ═════════════════════════════════════════════════════════════
const trackOf = (ed: { props: Record<string, any> }, id: string) =>
  (ed.props.snapshot.tracks as DraftTrack[]).find((t) => t.id === id)!;

describe("FE-EDT-16 MidiEditor.handleSetTrackVolume", () => {
  const setVol = async (v: number, id = "t1") => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackVolume", id, v);
    return ed;
  };

  it("UTCID01 (N): volume 0.5 on an existing track → that track 0.5; other tracks unchanged", async () => {
    const ed = await setVol(0.5);
    expect(trackOf(ed, "t1").volume).toBe(0.5);
    expect(trackOf(ed, "t2")).toEqual(twoTrackSnap().tracks[1]);
  });

  it.each([
    ["UTCID02 (B)", 0, 0],
    ["UTCID03 (B)", 1, 1],
    ["UTCID04 (A)", -0.2, 0],
    ["UTCID05 (A)", 1.7, 1],
  ])("%s: volume %d → %d", async (_id, v, expected) => {
    const ed = await setVol(v);
    expect(trackOf(ed, "t1").volume).toBe(expected);
  });

  it("UTCID06 (A): id not in the snapshot → no track changes", async () => {
    const ed = await setVol(0.5, "ghost");
    expect(ed.props.snapshot.tracks).toEqual(twoTrackSnap().tracks);
  });

  it("UTCID07 (N): volume 0.8 → notes, mute, solo, pan and colour of all tracks unchanged", async () => {
    const before = twoTrackSnap();
    const ed = await setVol(0.8);
    expect(ed.props.snapshot.notes).toEqual(before.notes);
    (ed.props.snapshot.tracks as DraftTrack[]).forEach((t, i) => {
      const b = before.tracks[i];
      expect([t.muted, t.solo, t.pan, t.color]).toEqual([b.muted, b.solo, b.pan, b.color]);
    });
  });
});

// ═════════════════════════════════════════════════════════════
// FE-EDT-17: handleSetTrackPan (UC-41)
// ═════════════════════════════════════════════════════════════
describe("FE-EDT-16 MidiEditor mute and solo keep the stored volume", () => {
  it("UTCID08 (A): toggling mute or solo leaves every track volume unchanged, so unmuting restores the level", async () => {
    const ed = await renderEditor(snap({ tracks: [track("t1", 0, { volume: 0.4 }), track("t2", 1, { volume: 0.7 })] }));
    ed.call("onToggleMute", "t1");
    ed.call("onToggleSolo", "t2");
    const after = ed.props.snapshot.tracks as DraftTrack[];
    expect(after.map((t) => t.volume)).toEqual([0.4, 0.7]);
    expect(after.map((t) => [t.muted, t.solo])).toEqual([[true, false], [false, true]]);
    ed.call("onToggleMute", "t1");
    expect((ed.props.snapshot.tracks as DraftTrack[])[0]).toMatchObject({ muted: false, volume: 0.4 });
  });
});

describe("FE-EDT-17 MidiEditor.handleSetTrackPan", () => {
  const setPan = async (p: number, id = "t1") => {
    const ed = await renderEditor(twoTrackSnap());
    ed.call("onSetTrackPan", id, p);
    return ed;
  };

  it("UTCID01 (N): pan 0.3 on an existing track → that track 0.3; other tracks unchanged", async () => {
    const ed = await setPan(0.3);
    expect(trackOf(ed, "t1").pan).toBe(0.3);
    expect(trackOf(ed, "t2")).toEqual(twoTrackSnap().tracks[1]);
  });

  it.each([
    ["UTCID02 (B)", -1, -1],
    ["UTCID03 (B)", 0, 0],
    ["UTCID04 (B)", 1, 1],
    ["UTCID05 (A)", -1.5, -1],
    ["UTCID06 (A)", 2, 1],
  ])("%s: pan %d → %d", async (_id, p, expected) => {
    const ed = await setPan(p);
    expect(trackOf(ed, "t1").pan).toBe(expected);
  });

  it("UTCID07 (A): id not in the snapshot → no track changes", async () => {
    const ed = await setPan(0.3, "ghost");
    expect(ed.props.snapshot.tracks).toEqual(twoTrackSnap().tracks);
  });
});

// ═════════════════════════════════════════════════════════════
// FE-EDT-18: handleSetTrackColor (UC-34)
// ═════════════════════════════════════════════════════════════
describe("FE-EDT-18 MidiEditor.handleSetTrackColor", () => {
  const setColor = async (c: string, id = "t1", s = twoTrackSnap()) => {
    const ed = await renderEditor(s);
    ed.call("onSetTrackColor", id, c);
    return ed;
  };

  it("UTCID01 (N): \"#10b981\" on an existing track → that track colour set; other tracks unchanged", async () => {
    const ed = await setColor("#10b981");
    expect(trackOf(ed, "t1").color).toBe("#10b981");
    expect(trackOf(ed, "t2")).toEqual(twoTrackSnap().tracks[1]);
  });

  it("UTCID02 (N): \"#10b981\" → notes, volume, pan, mute and solo unchanged", async () => {
    const before = twoTrackSnap();
    const ed = await setColor("#10b981");
    expect(ed.props.snapshot.notes).toEqual(before.notes);
    const t = trackOf(ed, "t1");
    const b = before.tracks[0];
    expect([t.volume, t.pan, t.muted, t.solo]).toEqual([b.volume, b.pan, b.muted, b.solo]);
  });

  it("UTCID03 (N): same colour as another track → accepted (colours need not be unique)", async () => {
    const s = snap({ tracks: [track("t1", 0, { color: "#6366f1" }), track("t2", 1, { color: "#10b981" })] });
    const ed = await setColor("#10b981", "t1", s);
    expect([trackOf(ed, "t1").color, trackOf(ed, "t2").color]).toEqual(["#10b981", "#10b981"]);
  });

  it("UTCID04 (A): id not in the snapshot → no track changes", async () => {
    const ed = await setColor("#10b981", "ghost");
    expect(ed.props.snapshot.tracks).toEqual(twoTrackSnap().tracks);
  });

  it("UTCID05 (A): \"red\" (not hex) → stored as given by the handler", async () => {
    const ed = await setColor("red");
    expect(trackOf(ed, "t1").color).toBe("red");
  });
});
