/**
 * midi-exporter.ts
 * UC-39: Export MIDI file — the inverse of midi-parser.ts's UC-24 import.
 *
 * Builds a standard .mid file from a DraftSnapshot using @tonejs/midi's
 * writer API. Ticks map directly (no seconds conversion needed): both
 * DraftNote.start/duration and @tonejs/midi's Note.ticks/durationTicks are
 * "ticks since track start" at the same `ppq` (ticks-per-quarter-note), so
 * as long as the exported file's header.ppq matches `snapshot.meta.ppq`,
 * `note.ticks = draftNote.start` and `durationTicks = draftNote.duration`
 * carry over unchanged.
 *
 * Unlike audio export (UC-38), mute/solo are NOT applied here — those are
 * playback-only preview toggles, not a statement that the muted note data
 * doesn't exist. Exporting MIDI is about preserving the actual composition,
 * so every track/note goes out regardless of its current mute/solo state.
 */
import { Midi } from "@tonejs/midi";
import { DRUM_KIT_ID_OFFSET, isDrumKitInstrument } from "@stave/shared-types";
import type { DraftSnapshot } from "@stave/shared-types";
import { getInstrumentByName } from "./instruments";

export function exportMidiFile(snapshot: DraftSnapshot): Uint8Array {
  const midi = new Midi();

  // `ppq` has no public setter on Header — fromJSON is the supported way to
  // set it (also resets tempos/timeSignatures in one pass).
  midi.header.fromJSON({
    name: "",
    ppq: snapshot.meta.ppq,
    meta: [],
    tempos: [{ ticks: 0, bpm: snapshot.meta.tempo }],
    timeSignatures: [{ ticks: 0, timeSignature: snapshot.meta.timeSignature }],
    keySignatures: [],
  });

  for (const track of snapshot.tracks) {
    const midiTrack = midi.addTrack();
    midiTrack.name = track.name;

    const inst = track.instrument ? getInstrumentByName(track.instrument) : undefined;
    if (inst && isDrumKitInstrument(inst.name)) {
      // Drums are selected by channel 10 (index 9) and the kit by the
      // program number on that channel (Standard 0, Orchestra 48) — both
      // are what midi-parser reads back on re-import.
      midiTrack.channel = 9;
      midiTrack.instrument.number = inst.id - DRUM_KIT_ID_OFFSET;
    } else if (inst) {
      midiTrack.instrument.number = inst.id;
    }

    const notes = snapshot.notes.filter((n) => n.trackId === track.id);
    for (const n of notes) {
      midiTrack.addNote({
        midi: n.pitch,
        ticks: n.start,
        durationTicks: n.duration,
        velocity: Math.max(0, Math.min(1, n.velocity / 127)),
      });
    }
  }

  return midi.toArray();
}
