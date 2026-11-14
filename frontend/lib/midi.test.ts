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
import { MAX_MIDI_IMPORT_BYTES, MidiImportError, countDiscardedMidiEvents, parseMidiBuffer } from "./midi-parser";

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
  const two = () => [note("a", { start: 0, duration: 480 }), note("b", { pitch: 64, start: 960, duration: 240 })];

  it("UTCID01 (N): ppq 480, 120 bpm, Acoustic Grand Piano, 2 notes → 1 track, program 0, same ticks", () => {
    const bytes = exportMidiFile(snap({ tracks: [track("t1", { instrument: "Acoustic Grand Piano" })], notes: two() }));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("MThd");
    const midi = new Midi(bytes);
    expect(midi.tracks).toHaveLength(1);
    expect(midi.tracks[0].instrument.number).toBe(0);
    expect(midi.tracks[0].notes.map((n) => [n.midi, n.ticks, n.durationTicks])).toEqual([
      [60, 0, 480],
      [64, 960, 240],
    ]);
  });

  it("UTCID02 (N): ppq 96, 90 bpm, 3/4 → header ppq 96, tempo 90, time signature [3,4]", () => {
    const midi = readBack(
      snap({
        meta: { tempo: 90, timeSignature: [3, 4], ppq: 96 },
        tracks: [track("t1", { instrument: "Acoustic Grand Piano" })],
        notes: [note("a", { duration: 96 }), note("b", { start: 96, duration: 96 })],
      }),
    );
    expect(midi.header.ppq).toBe(96);
    expect(midi.header.tempos[0].bpm).toBeCloseTo(90, 3);
    expect(midi.header.timeSignatures[0].timeSignature).toEqual([3, 4]);
  });

  it("UTCID03 (N): Standard Drum Kit → channel 9, program 0", () => {
    const midi = readBack(snap({ tracks: [track("t1", { instrument: "Standard Drum Kit" })], notes: two() }));
    expect([midi.tracks[0].channel, midi.tracks[0].instrument.number]).toEqual([9, 0]);
  });

  it("UTCID04 (N): Orchestra Drum Kit → channel 9, program 48", () => {
    const midi = readBack(snap({ tracks: [track("t1", { instrument: "Orchestra Drum Kit" })], notes: two() }));
    expect([midi.tracks[0].channel, midi.tracks[0].instrument.number]).toEqual([9, 48]);
  });

  it("UTCID05 (N): instrument null → default program 0, default (non-drum) channel", () => {
    const midi = readBack(snap({ tracks: [track("t1", { instrument: null })], notes: two() }));
    expect(midi.tracks[0].instrument.number).toBe(0);
    expect(midi.tracks[0].channel).toBe(0);
    expect(midi.tracks[0].notes).toHaveLength(2);
  });

  it("UTCID06 (A): instrument \"My Synth\" (not GM) → default program 0, default channel", () => {
    const midi = readBack(snap({ tracks: [track("t1", { instrument: "My Synth" })], notes: two() }));
    expect(midi.tracks[0].instrument.number).toBe(0);
    expect(midi.tracks[0].channel).toBe(0);
  });

  it("UTCID07 (B): velocity 127 and 0 → 1.0, and 0 is raised to 1/127 so the note is not lost", () => {
    const midi = readBack(
      snap({
        tracks: [track("t1", { instrument: "Acoustic Grand Piano" })],
        notes: [note("a", { velocity: 127 }), note("b", { velocity: 0, start: 480 })],
      }),
    );
    expect(midi.tracks[0].notes).toHaveLength(2);
    expect(midi.tracks[0].notes.map((n) => Math.round(n.velocity * 127))).toEqual([127, 1]);
  });

  it("UTCID08 (A): velocity 200 (out of range) → clamped to 1.0", () => {
    const midi = readBack(snap({ tracks: [track("t1", { instrument: "Acoustic Grand Piano" })], notes: [note("a", { velocity: 200 })] }));
    expect(midi.tracks[0].notes[0].velocity).toBe(1);
  });

  it("UTCID09 (A): note with unknown trackId → orphan note not written", () => {
    const midi = readBack(snap({ notes: [note("a"), note("orphan", { trackId: "ghost" })] }));
    expect(midi.tracks).toHaveLength(1);
    expect(midi.tracks[0].notes).toHaveLength(1);
  });

  it("UTCID10 (N): muted track is still exported with its notes", () => {
    const midi = readBack(snap({ tracks: [track("t1", { instrument: "Acoustic Grand Piano", muted: true })], notes: two() }));
    expect(midi.tracks).toHaveLength(1);
    expect(midi.tracks[0].notes).toHaveLength(2);
  });

  it("UTCID11 (B): no tracks → valid .mid with header only, 0 tracks", () => {
    const bytes = exportMidiFile(snap({ tracks: [], notes: [] }));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("MThd");
    const midi = new Midi(bytes);
    expect(midi.tracks).toHaveLength(0);
    expect(midi.header.ppq).toBe(480);
  });

  it("UTCID12 (A): an audio sketch attached to the project is not part of the MIDI file", () => {
    const base = snap({ tracks: [track("t1")], notes: two() });
    const withSketch = snap({
      tracks: [track("t1")],
      notes: two(),
      ...({ audioSketches: [{ id: "sk1", path: "u/sk1.wav", durationMs: 4000 }] } as Partial<DraftSnapshot>),
    });
    expect(exportMidiFile(withSketch)).toEqual(exportMidiFile(base));
    expect(readBack(withSketch).tracks).toHaveLength(1);
  });

  it("one MIDI track per project track, with names and per-track notes", () => {
    const midi = readBack(
      snap({
        tracks: [track("t1", { name: "Lead" }), track("t2", { name: "Bass" })],
        notes: [note("a"), note("b", { trackId: "t2", pitch: 36 }), note("c", { trackId: "t2", pitch: 38 })],
      }),
    );
    expect(midi.tracks.map((t) => t.name)).toEqual(["Lead", "Bass"]);
    expect(midi.tracks.map((t) => t.notes.length)).toEqual([1, 2]);
  });

  it("GM melodic instrument → program number (Trumpet = 56)", () => {
    const midi = readBack(snap({ tracks: [track("t1", { instrument: "Trumpet" })] }));
    expect(midi.tracks[0].instrument.number).toBe(56);
    expect(midi.tracks[0].channel).not.toBe(9);
  });

  it("solo state is ignored — every track and note is exported", () => {
    const midi = readBack(
      snap({
        tracks: [track("t1"), track("t2", { solo: true })],
        notes: [note("a"), note("b", { trackId: "t2" })],
      }),
    );
    expect(midi.tracks.map((t) => t.notes.length)).toEqual([1, 1]);
  });

  it("pitch bounds 0 and 127 are exported", () => {
    const midi = readBack(snap({ notes: [note("a", { pitch: 0 }), note("b", { pitch: 127, start: 480 })] }));
    expect(midi.tracks[0].notes.map((n) => n.midi)).toEqual([0, 127]);
  });
});

// ═════════════════════════════════════════════════════════════
describe("FE-LIB-21 pitchName", () => {
  it("UTCID01 (N): 60 → C4 (middle C, international convention)", () => {
    expect(pitchName(60)).toBe("C4");
  });
  it("UTCID02 (N): 61 → C#4 (sharp spelling)", () => {
    expect(pitchName(61)).toBe("C#4");
  });
  it("UTCID03 (N): 69 → A4 (440 Hz reference)", () => {
    expect(pitchName(69)).toBe("A4");
  });
  it("UTCID04 (B): 0 → C-1 (lowest MIDI pitch)", () => {
    expect(pitchName(0)).toBe("C-1");
  });
  it("UTCID05 (B): 127 → G9 (highest MIDI pitch)", () => {
    expect(pitchName(127)).toBe("G9");
  });
  it("UTCID06 (A): -1 → \"B-2\" (no NaN/undefined label)", () => {
    expect(pitchName(-1)).toBe("B-2");
  });
  it("octave boundary 11 → B-1 and 12 → C0", () => {
    expect([pitchName(11), pitchName(12)]).toEqual(["B-1", "C0"]);
  });
  it("all 12 pitch classes of octave 4 are named correctly", () => {
    expect(Array.from({ length: 12 }, (_, i) => pitchName(60 + i))).toEqual([
      "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4",
    ]);
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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@tonejs/midi");
    vi.resetModules();
  });

  const twoNotes = [
    { midi: 60, ticks: 0, durationTicks: 480 },
    { midi: 64, ticks: 480, durationTicks: 480 },
  ];
  const oneTrack = () => buildMidi({ ppq: 480, bpm: 120, ts: [4, 4], tracks: [{ program: 0, notes: twoNotes }] });
  const manyTracks = (count: number) =>
    buildMidi({ tracks: Array.from({ length: count }, (_, i) => ({ notes: [{ midi: 60 + (i % 12), ticks: 0, durationTicks: 120 }] })) });

  async function parseWithFakeMidi(fake: unknown) {
    vi.doMock("@tonejs/midi", () => ({
      Midi: class {
        constructor() {
          return fake;
        }
      },
    }));
    vi.resetModules();
    const mod = await import("./midi-parser");
    return mod.parseMidiBuffer(new ArrayBuffer(16));
  }

  it("UTCID01 (N): 1 track, program 0, 2 notes, no existing → snapshot v3, 1 Acoustic Grand Piano track, 2 notes", () => {
    const s = parseMidiBuffer(oneTrack());
    expect(s.schemaVersion).toBe(3);
    expect(s.meta).toEqual({ tempo: 120, timeSignature: [4, 4], ppq: 480 });
    expect(s.tracks).toHaveLength(1);
    expect(s.tracks[0]).toMatchObject({ id: "id-1", instrument: "Acoustic Grand Piano", order: 0, muted: false, solo: false, volume: 1, pan: 0 });
    expect(s.notes).toHaveLength(2);
    expect(s.notes[0]).toMatchObject({ trackId: "id-1", pitch: 60, start: 0, duration: 480 });
  });

  it("UTCID02 (N): no tempo / time-signature events → meta tempo 120, 4/4", () => {
    const s = parseMidiBuffer(buildMidi({ bpm: null, ts: null, tracks: [{ program: 0, notes: twoNotes }] }));
    expect(s.meta.tempo).toBe(120);
    expect(s.meta.timeSignature).toEqual([4, 4]);
  });

  it("UTCID03 (B): header ppq undefined → meta.ppq 480", async () => {
    const s = await parseWithFakeMidi({
      header: { ppq: undefined, tempos: [{ bpm: 120 }], timeSignatures: [{ timeSignature: [4, 4] }] },
      tracks: [{ name: "", instrument: { percussion: false, number: 0 }, notes: [{ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 }] }],
    });
    expect(s.meta.ppq).toBe(480);
  });

  it("UTCID04 (A): track A without notes, track B with 3 notes → only B imported, named \"Track 1\"", () => {
    const s = parseMidiBuffer(
      buildMidi({
        tracks: [
          { name: "A", notes: [] },
          { notes: [{ midi: 60, ticks: 0, durationTicks: 120 }, { midi: 62, ticks: 120, durationTicks: 120 }, { midi: 64, ticks: 240, durationTicks: 120 }] },
        ],
      }),
    );
    expect(s.tracks.map((t) => t.name)).toEqual(["Track 1"]);
    expect(s.notes).toHaveLength(3);
  });

  it("UTCID05 (N): track name \"Bass\\u0000\\u0000 \" → \"Bass\"", () => {
    const s = parseMidiBuffer(buildMidi({ tracks: [{ name: "Bass\u0000\u0000 ", notes: twoNotes }] }));
    expect(s.tracks[0].name).toBe("Bass");
  });

  it("UTCID06 (B): track name made only of control chars → \"Track 1\"", () => {
    const s = parseMidiBuffer(buildMidi({ tracks: [{ name: "\u0000\u0001\u0007", notes: twoNotes }] }));
    expect(s.tracks[0].name).toBe("Track 1");
  });

  it("UTCID07 (N): percussion track, program 0 → \"Standard Drum Kit\"", () => {
    const s = parseMidiBuffer(buildMidi({ tracks: [{ channel: 9, program: 0, notes: [{ midi: 36, ticks: 0, durationTicks: 120 }] }] }));
    expect(s.tracks[0].instrument).toBe("Standard Drum Kit");
  });

  it("UTCID08 (N): percussion track, program 48 → \"Orchestra Drum Kit\"", () => {
    const s = parseMidiBuffer(buildMidi({ tracks: [{ channel: 9, program: 48, notes: [{ midi: 38, ticks: 0, durationTicks: 120 }] }] }));
    expect(s.tracks[0].instrument).toBe("Orchestra Drum Kit");
  });

  it("UTCID09 (A): percussion track, program 16 (kit not bundled) → \"Standard Drum Kit\" fallback", () => {
    const s = parseMidiBuffer(buildMidi({ tracks: [{ channel: 9, program: 16, notes: [{ midi: 36, ticks: 0, durationTicks: 120 }] }] }));
    expect(s.tracks[0].instrument).toBe("Standard Drum Kit");
  });

  it("UTCID10 (N): merge into snapshot with 2 tracks, tempo 90 → existing meta kept, new track order 2 named \"Track 3\"", () => {
    const existing = snap({
      meta: { tempo: 90, timeSignature: [4, 4], ppq: 480 },
      tracks: [track("a", { order: 0 }), track("b", { order: 1, color: "#ec4899" })],
      notes: [note("old-n", { trackId: "a" })],
    });
    const s = parseMidiBuffer(oneTrack(), existing);
    expect(s.meta).toEqual(existing.meta);
    expect(s.tracks).toHaveLength(3);
    expect(s.tracks[2]).toMatchObject({ order: 2, name: "Track 3" });
    expect(s.notes[0]).toBe(existing.notes[0]);
    expect(s.notes).toHaveLength(3);
  });

  it("UTCID11 (B): 13 tracks with notes → 12 distinct palette colours, 13th wraps to \"#6366f1\"", () => {
    const s = parseMidiBuffer(manyTracks(13));
    const colors = s.tracks.map((t) => t.color);
    expect(new Set(colors.slice(0, 12)).size).toBe(12);
    expect(colors[12]).toBe("#6366f1");
  });

  it("UTCID12 (B): note at 0.5 s, duration 0, velocity 1.0 → start 480, duration 1, velocity 127", () => {
    const s = parseMidiBuffer(buildMidi({ ppq: 480, bpm: 120, tracks: [{ notes: [{ midi: 60, ticks: 480, durationTicks: 0, velocity: 1 }] }] }));
    expect(s.notes[0]).toMatchObject({ start: 480, duration: 1, velocity: 127 });
  });

  it("UTCID13 (A): buffer that is not a MIDI file → parse error propagated", () => {
    expect(() => parseMidiBuffer(new TextEncoder().encode("not a midi file").buffer as ArrayBuffer)).toThrow();
  });

  it("UTCID14 (B): valid file of exactly 5 MB → imported normally", () => {
    const midi = new Uint8Array(oneTrack());
    const padded = new Uint8Array(MAX_MIDI_IMPORT_BYTES);
    padded.set(midi);
    const s = parseMidiBuffer(padded.buffer);
    expect(s.tracks).toHaveLength(1);
    expect(s.tracks[0].instrument).toBe("Acoustic Grand Piano");
    expect(s.notes).toHaveLength(2);
  });

  it("UTCID15 (A): file of 5 MB + 1 byte → rejected before parsing (FILE_TOO_LARGE)", () => {
    const midi = new Uint8Array(oneTrack());
    const padded = new Uint8Array(MAX_MIDI_IMPORT_BYTES + 1);
    padded.set(midi);
    let err: unknown;
    try {
      parseMidiBuffer(padded.buffer);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MidiImportError);
    expect((err as MidiImportError).code).toBe("FILE_TOO_LARGE");
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it("UTCID16 (B): 32 tracks with notes → 32 tracks imported", () => {
    expect(parseMidiBuffer(manyTracks(32)).tracks).toHaveLength(32);
  });

  it("UTCID17 (A): 33 tracks with notes → rejected (TOO_MANY_TRACKS)", () => {
    expect(() => parseMidiBuffer(manyTracks(33))).toThrow(expect.objectContaining({ code: "TOO_MANY_TRACKS" }));
  });

  it("UTCID18 (A): merge into a snapshot that already has 32 tracks → rejected (TOO_MANY_TRACKS)", () => {
    const existing = snap({ tracks: Array.from({ length: 32 }, (_, i) => track(`t${i}`, { order: i })), notes: [] });
    expect(() => parseMidiBuffer(oneTrack(), existing)).toThrow(expect.objectContaining({ code: "TOO_MANY_TRACKS" }));
  });

  it("UTCID19 (A): note velocity 0.0 in the file → imported velocity clamped to 1", async () => {
    const s = await parseWithFakeMidi({
      header: { ppq: 480, tempos: [], timeSignatures: [] },
      tracks: [{ name: "", instrument: { percussion: false, number: 0 }, notes: [{ midi: 60, ticks: 0, durationTicks: 480, velocity: 0 }] }],
    });
    expect(s.notes[0].velocity).toBe(1);
  });

  it("UTCID20 (A): file ppq 96 / tempo 90 merged into ppq 480 / tempo 120 → ticks normalised to 480", () => {
    const existing = snap({ meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 }, tracks: [], notes: [] });
    const s = parseMidiBuffer(
      buildMidi({ ppq: 96, bpm: 90, tracks: [{ program: 0, notes: [{ midi: 60, ticks: 96, durationTicks: 48 }, { midi: 62, ticks: 192, durationTicks: 96 }] }] }),
      existing,
    );
    expect(s.meta).toEqual(existing.meta);
    expect(s.notes.map((x) => [x.start, x.duration])).toEqual([
      [480, 240],
      [960, 480],
    ]);
  });

  it("UTCID21 (A): file with pitch bend, control change and system-exclusive events → each kind counted so the user can be told before confirming", () => {
    const events = [
      0x00, 0xf0, 0x03, 0x7e, 0x00, 0xf7,
      0x00, 0xb0, 0x07, 0x64,
      0x00, 0xe0, 0x00, 0x50,
      0x00, 0x90, 0x3c, 0x40,
      0x60, 0x80, 0x3c, 0x40,
      0x00, 0xff, 0x2f, 0x00,
    ];
    const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0];
    const trk = [0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, events.length, ...events];
    const buf = toBuffer(new Uint8Array([...head, ...trk]));
    expect(countDiscardedMidiEvents(buf)).toEqual({
      pitchBends: 1,
      controlChanges: 1,
      sysex: 1,
      extraTempoChanges: 0,
      extraTimeSignatureChanges: 0,
    });
    expect(parseMidiBuffer(buf).notes).toHaveLength(1);
    expect(countDiscardedMidiEvents(oneTrack())).toEqual({
      pitchBends: 0,
      controlChanges: 0,
      sysex: 0,
      extraTempoChanges: 0,
      extraTimeSignatureChanges: 0,
    });
  });

  it("merge into a snapshot with 31 tracks plus 1 imported track is allowed (exactly 32)", () => {
    const existing = snap({ tracks: Array.from({ length: 31 }, (_, i) => track(`t${i}`, { order: i })), notes: [] });
    expect(parseMidiBuffer(oneTrack(), existing).tracks).toHaveLength(32);
  });

  it("fractional tempo 119.6 BPM is rounded to 120", () => {
    const s = parseMidiBuffer(buildMidi({ bpm: 119.6, tracks: [{ notes: [{ midi: 60, ticks: 0, durationTicks: 1 }] }] }));
    expect(s.meta.tempo).toBe(120);
  });

  it("Program Change → GM instrument assigned (program 56 = Trumpet)", () => {
    const s = parseMidiBuffer(buildMidi({ tracks: [{ program: 56, notes: [{ midi: 60, ticks: 0, durationTicks: 480 }] }] }));
    expect(s.tracks[0].instrument).toBe("Trumpet");
  });

  it("imported tracks get colours different from tracks already in the project", () => {
    const existing = snap({ tracks: [track("old", { color: "#6366f1" })], notes: [] });
    const s = parseMidiBuffer(
      buildMidi({ tracks: [{ notes: [{ midi: 60, ticks: 0, durationTicks: 1 }] }, { notes: [{ midi: 62, ticks: 0, durationTicks: 1 }] }] }),
      existing,
    );
    const colors = s.tracks.map((t) => t.color.toLowerCase());
    expect(new Set(colors).size).toBe(3);
  });

  it("export → import round-trip preserves notes and instruments", () => {
    const original = snap({
      tracks: [track("t1", { name: "Horn", instrument: "French Horn" })],
      notes: [note("a", { pitch: 65, start: 240, duration: 720, velocity: 90 })],
    });
    const s = parseMidiBuffer(toBuffer(exportMidiFile(original)));
    expect(s.tracks[0]).toMatchObject({ name: "Horn", instrument: "French Horn" });
    expect(s.notes[0]).toMatchObject({ pitch: 65, start: 240, duration: 720, velocity: 90 });
  });
});
