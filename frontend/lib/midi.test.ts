/**
 * midi.test.ts — Report 5, FE-LIB-20 exportMidiFile, FE-LIB-21 pitchName,
 * FE-LIB-22 parseMidiBuffer (UC-24 import / UC-39 export).
 * Owner: Haidnde180202. Uses the real @tonejs/midi reader/writer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Midi } from "@tonejs/midi";
import type { DraftNote, DraftSnapshot, DraftTrack } from "@stave/shared-types";
import { exportMidiFile } from "./midi-exporter";
import { pitchName } from "./midi-note-name";
import { parseMidiBuffer } from "./midi-parser";

function track(id: string, extra: Partial<DraftTrack> = {}): DraftTrack {
  return { id, name: id, order: 0, color: "#6366f1", muted: false, solo: false, volume: 1, pan: 0, instrument: null, ...extra };
}
function note(id: string, extra: Partial<DraftNote> = {}): DraftNote {
  return { id, trackId: "t1", pitch: 60, start: 0, duration: 480, velocity: 100, ...extra };
}
function snap(extra: Partial<DraftSnapshot> = {}): DraftSnapshot {
  return {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [track("t1")],
    notes: [note("n1")],
    ...extra,
  } as DraftSnapshot;
}
const toBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const readBack = (s: DraftSnapshot) => new Midi(exportMidiFile(s));

/** Builds a .mid file in memory with @tonejs/midi's writer. */
function buildMidi(opts: {
  ppq?: number;
  bpm?: number | null;
  ts?: [number, number] | null;
  tracks: { name?: string; channel?: number; program?: number; notes: { midi: number; ticks: number; durationTicks: number; velocity?: number }[] }[];
}): ArrayBuffer {
  const midi = new Midi();
  midi.header.fromJSON({
    name: "",
    ppq: opts.ppq ?? 480,
    meta: [],
    tempos: opts.bpm === null ? [] : [{ ticks: 0, bpm: opts.bpm ?? 120 }],
    timeSignatures: opts.ts === null ? [] : [{ ticks: 0, timeSignature: opts.ts ?? [4, 4] }],
    keySignatures: [],
  });
  for (const t of opts.tracks) {
    const mt = midi.addTrack();
    if (t.name !== undefined) mt.name = t.name;
    if (t.channel !== undefined) mt.channel = t.channel;
    if (t.program !== undefined) mt.instrument.number = t.program;
    for (const n of t.notes) mt.addNote({ velocity: 0.8, ...n });
  }
  return toBuffer(midi.toArray());
}

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-20 exportMidiFile", () => {
  it("FE-LIB-20 UTCID01 (N): returns a Standard MIDI File (MThd) with the project's ppq, tempo and time signature", () => {
    const bytes = exportMidiFile(snap({ meta: { tempo: 96, timeSignature: [3, 4], ppq: 960 } }));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("MThd");
    const midi = new Midi(bytes);
    expect(midi.header.ppq).toBe(960);
    expect(midi.header.tempos[0].bpm).toBeCloseTo(96, 3);
    expect(midi.header.timeSignatures[0].timeSignature).toEqual([3, 4]);
  });

  it("FE-LIB-20 UTCID02 (N): notes keep pitch / tick start / tick duration unchanged; velocity = v/127", () => {
    const midi = readBack(snap({ notes: [note("a", { pitch: 64, start: 960, duration: 240, velocity: 64 })] }));
    const n = midi.tracks[0].notes[0];
    expect([n.midi, n.ticks, n.durationTicks]).toEqual([64, 960, 240]);
    expect(n.velocity).toBeCloseTo(64 / 127, 2);
  });

  it("FE-LIB-20 UTCID03 (N): one MIDI track per project track, with names and per-track notes", () => {
    const midi = readBack(
      snap({
        tracks: [track("t1", { name: "Lead" }), track("t2", { name: "Bass" })],
        notes: [note("a"), note("b", { trackId: "t2", pitch: 36 }), note("c", { trackId: "t2", pitch: 38 })],
      }),
    );
    expect(midi.tracks.map((t) => t.name)).toEqual(["Lead", "Bass"]);
    expect(midi.tracks.map((t) => t.notes.length)).toEqual([1, 2]);
  });

  it("FE-LIB-20 UTCID04 (N): GM melodic instrument → program number (Trumpet = 56)", () => {
    const midi = readBack(snap({ tracks: [track("t1", { instrument: "Trumpet" })] }));
    expect(midi.tracks[0].instrument.number).toBe(56);
    expect(midi.tracks[0].channel).not.toBe(9);
  });

  it("FE-LIB-20 UTCID05 (N): drum kits → channel 10 (index 9) with kit program (Standard 0, Orchestra 48)", () => {
    const midi = readBack(
      snap({
        tracks: [track("t1", { instrument: "Standard Drum Kit" }), track("t2", { instrument: "Orchestra Drum Kit" })],
        notes: [note("a", { pitch: 36 }), note("b", { trackId: "t2", pitch: 38 })],
      }),
    );
    expect(midi.tracks.map((t) => [t.channel, t.instrument.number])).toEqual([
      [9, 0],
      [9, 48],
    ]);
  });

  it("FE-LIB-20 UTCID06 (N): muted / solo state is ignored — every track and note is exported", () => {
    const midi = readBack(
      snap({
        tracks: [track("t1", { muted: true }), track("t2", { solo: true })],
        notes: [note("a"), note("b", { trackId: "t2" })],
      }),
    );
    expect(midi.tracks.map((t) => t.notes.length)).toEqual([1, 1]);
  });

  it("FE-LIB-20 UTCID07 (B): empty project (0 tracks) → still a valid MIDI file with header only", () => {
    const midi = readBack(snap({ tracks: [], notes: [] }));
    expect(midi.tracks).toHaveLength(0);
    expect(midi.header.ppq).toBe(480);
  });

  it("FE-LIB-20 UTCID08 (B): velocity bounds 1 and 127 map to ≈0.008 and 1.0", () => {
    const midi = readBack(snap({ notes: [note("a", { velocity: 1 }), note("b", { velocity: 127, start: 480 })] }));
    const [lo, hi] = midi.tracks[0].notes;
    expect(Math.round(lo.velocity * 127)).toBe(1);
    expect(Math.round(hi.velocity * 127)).toBe(127);
  });

  it("FE-LIB-20 UTCID09 (B): pitch bounds 0 and 127 are exported", () => {
    const midi = readBack(snap({ notes: [note("a", { pitch: 0 }), note("b", { pitch: 127, start: 480 })] }));
    expect(midi.tracks[0].notes.map((n) => n.midi)).toEqual([0, 127]);
  });

  it("FE-LIB-20 UTCID10 (A): unknown / null instrument name → no crash, default program 0", () => {
    const midi = readBack(snap({ tracks: [track("t1", { instrument: "Kazoo 9000" }), track("t2")] }));
    expect(midi.tracks.map((t) => t.instrument.number)).toEqual([0, 0]);
  });

  it("FE-LIB-20 UTCID11 (A): notes pointing to a non-existent track are not exported", () => {
    const midi = readBack(snap({ notes: [note("a"), note("orphan", { trackId: "ghost" })] }));
    expect(midi.tracks).toHaveLength(1);
    expect(midi.tracks[0].notes).toHaveLength(1);
  });

  it("FE-LIB-20 UTCID12 (A): out-of-range velocity (200) is clamped to the MIDI max (1.0)", () => {
    const midi = readBack(snap({ notes: [note("a", { velocity: 200 })] }));
    expect(Math.round(midi.tracks[0].notes[0].velocity * 127)).toBe(127);
  });
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-21 pitchName", () => {
  it("FE-LIB-21 UTCID01 (N): 60 → C4 (middle C, international convention)", () => {
    expect(pitchName(60)).toBe("C4");
  });
  it("FE-LIB-21 UTCID02 (N): 61 → C#4 (sharp spelling)", () => {
    expect(pitchName(61)).toBe("C#4");
  });
  it("FE-LIB-21 UTCID03 (N): 69 → A4 (440 Hz reference)", () => {
    expect(pitchName(69)).toBe("A4");
  });
  it("FE-LIB-21 UTCID04 (B): 0 → C-1 (lowest MIDI pitch)", () => {
    expect(pitchName(0)).toBe("C-1");
  });
  it("FE-LIB-21 UTCID05 (B): 127 → G9 (highest MIDI pitch)", () => {
    expect(pitchName(127)).toBe("G9");
  });
  it("FE-LIB-21 UTCID06 (B): octave boundary 11 → B-1 and 12 → C0", () => {
    expect([pitchName(11), pitchName(12)]).toEqual(["B-1", "C0"]);
  });
  it("FE-LIB-21 UTCID07 (N): all 12 pitch classes of octave 4 are named correctly", () => {
    expect(Array.from({ length: 12 }, (_, i) => pitchName(60 + i))).toEqual([
      "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4",
    ]);
  });
  it("FE-LIB-21 UTCID08 (A): out-of-range negative pitch (-1) must not produce a meaningless label (NaN/undefined)", () => {
    expect(pitchName(-1)).toMatch(/^[A-G]#?-?\d+$/);
  });
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-22 parseMidiBuffer", () => {
  let n = 0;
  beforeEach(() => {
    n = 0;
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(
      () => `id-${++n}` as `${string}-${string}-${string}-${string}-${string}`,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it("FE-LIB-22 UTCID01 (N): new snapshot — meta, tracks and notes converted from the file", () => {
    const s = parseMidiBuffer(
      buildMidi({
        ppq: 480,
        bpm: 100,
        ts: [3, 4],
        tracks: [{ name: "Piano", notes: [{ midi: 60, ticks: 0, durationTicks: 480, velocity: 100 / 127 }] }],
      }),
    );
    expect(s.schemaVersion).toBe(3);
    expect(s.meta).toEqual({ tempo: 100, timeSignature: [3, 4], ppq: 480 });
    expect(s.tracks).toHaveLength(1);
    expect(s.tracks[0]).toMatchObject({ id: "id-1", name: "Piano", order: 0, muted: false, solo: false, volume: 1, pan: 0 });
    expect(s.notes).toEqual([{ id: "id-2", trackId: "id-1", pitch: 60, start: 0, duration: 480, velocity: 100 }]);
  });

  it("FE-LIB-22 UTCID02 (B): file without tempo / time-signature events → defaults 120 BPM and 4/4", () => {
    const s = parseMidiBuffer(
      buildMidi({ bpm: null, ts: null, tracks: [{ notes: [{ midi: 60, ticks: 0, durationTicks: 480 }] }] }),
    );
    expect(s.meta.tempo).toBe(120);
    expect(s.meta.timeSignature).toEqual([4, 4]);
  });

  it("FE-LIB-22 UTCID03 (B): fractional tempo 119.6 BPM is rounded to 120", () => {
    const s = parseMidiBuffer(buildMidi({ bpm: 119.6, tracks: [{ notes: [{ midi: 60, ticks: 0, durationTicks: 1 }] }] }));
    expect(s.meta.tempo).toBe(120);
  });

  it("FE-LIB-22 UTCID04 (N): merge into an existing project — keeps meta, appends tracks with continued order / names", () => {
    const existing = snap({ meta: { tempo: 90, timeSignature: [4, 4], ppq: 480 }, tracks: [track("old", { order: 0 })], notes: [note("old-n", { trackId: "old" })] });
    const s = parseMidiBuffer(
      buildMidi({ bpm: 140, tracks: [{ notes: [{ midi: 62, ticks: 0, durationTicks: 480 }] }] }),
      existing,
    );
    expect(s.meta.tempo).toBe(90);
    expect(s.tracks.map((t) => [t.name, t.order])).toEqual([
      ["old", 0],
      ["Track 2", 1],
    ]);
    expect(s.notes).toHaveLength(2);
    expect(s.notes[0]).toBe(existing.notes[0]);
  });

  it("FE-LIB-22 UTCID05 (N): merge rescales file ticks to the project ppq (960 → 480)", () => {
    const s = parseMidiBuffer(
      buildMidi({ ppq: 960, tracks: [{ notes: [{ midi: 60, ticks: 1920, durationTicks: 960 }] }] }),
      snap({ tracks: [], notes: [] }),
    );
    expect([s.notes[0].start, s.notes[0].duration]).toEqual([960, 480]);
  });

  it("FE-LIB-22 UTCID06 (B): tracks without notes (e.g. conductor track) are skipped", () => {
    const s = parseMidiBuffer(
      buildMidi({ tracks: [{ name: "Empty", notes: [] }, { name: "Real", notes: [{ midi: 60, ticks: 0, durationTicks: 480 }] }] }),
    );
    expect(s.tracks.map((t) => t.name)).toEqual(["Real"]);
  });

  it("FE-LIB-22 UTCID07 (A): NUL / control characters in the track name are stripped", () => {
    const s = parseMidiBuffer(
      buildMidi({ tracks: [{ name: "Lead\u0000\u0000\u0007 ", notes: [{ midi: 60, ticks: 0, durationTicks: 480 }] }] }),
    );
    expect(s.tracks[0].name).toBe("Lead");
  });

  it("FE-LIB-22 UTCID08 (B): name made only of control chars → fallback 'Track N'", () => {
    const s = parseMidiBuffer(buildMidi({ tracks: [{ name: "\u0000\u0000", notes: [{ midi: 60, ticks: 0, durationTicks: 480 }] }] }));
    expect(s.tracks[0].name).toBe("Track 1");
  });

  it("FE-LIB-22 UTCID09 (N): Program Change → GM instrument assigned (program 56 = Trumpet)", () => {
    const s = parseMidiBuffer(buildMidi({ tracks: [{ program: 56, notes: [{ midi: 60, ticks: 0, durationTicks: 480 }] }] }));
    expect(s.tracks[0].instrument).toBe("Trumpet");
  });

  it("FE-LIB-22 UTCID10 (N): channel 10 percussion → drum kit (program 48 = Orchestra, unknown kit 25 → Standard)", () => {
    const s = parseMidiBuffer(
      buildMidi({
        tracks: [
          { channel: 9, program: 48, notes: [{ midi: 38, ticks: 0, durationTicks: 120 }] },
          { channel: 9, program: 25, notes: [{ midi: 36, ticks: 0, durationTicks: 120 }] },
        ],
      }),
    );
    expect(s.tracks.map((t) => t.instrument)).toEqual(["Orchestra Drum Kit", "Standard Drum Kit"]);
  });

  it("FE-LIB-22 UTCID11 (B): zero-length note → duration clamped to 1 tick; full velocity → 127", () => {
    const s = parseMidiBuffer(buildMidi({ tracks: [{ notes: [{ midi: 60, ticks: 0, durationTicks: 0, velocity: 1 }] }] }));
    expect(s.notes[0].duration).toBe(1);
    expect(s.notes[0].velocity).toBe(127);
  });

  it("FE-LIB-22 UTCID12 (N): imported tracks get colours different from tracks already in the project", () => {
    const existing = snap({ tracks: [track("old", { color: "#6366f1" })], notes: [] });
    const s = parseMidiBuffer(
      buildMidi({ tracks: [{ notes: [{ midi: 60, ticks: 0, durationTicks: 1 }] }, { notes: [{ midi: 62, ticks: 0, durationTicks: 1 }] }] }),
      existing,
    );
    const colors = s.tracks.map((t) => t.color.toLowerCase());
    expect(new Set(colors).size).toBe(3);
  });

  it("FE-LIB-22 UTCID13 (A): buffer that is not a MIDI file → throws", () => {
    expect(() => parseMidiBuffer(new TextEncoder().encode("not a midi file").buffer as ArrayBuffer)).toThrow();
  });

  it("FE-LIB-22 UTCID14 (N): export → import round-trip preserves notes and instruments", () => {
    const original = snap({
      tracks: [track("t1", { name: "Horn", instrument: "French Horn" })],
      notes: [note("a", { pitch: 65, start: 240, duration: 720, velocity: 90 })],
    });
    const s = parseMidiBuffer(toBuffer(exportMidiFile(original)));
    expect(s.tracks[0]).toMatchObject({ name: "Horn", instrument: "French Horn" });
    expect(s.notes[0]).toMatchObject({ pitch: 65, start: 240, duration: 720, velocity: 90 });
  });
});
