/**
 * midi-parser.ts
 * Parse a MIDI ArrayBuffer → DraftSnapshot using @tonejs/midi.
 * UC-24: Import MIDI file
 */
import { Midi } from "@tonejs/midi";
import { DRAFT_SCHEMA_VERSION, DRUM_KIT_ID_OFFSET, DRUM_KIT_INSTRUMENT_NAME } from "@stave/shared-types";
import type { DraftSnapshot, DraftTrack, DraftNote } from "@stave/shared-types";
import { getInstrumentById } from "./instruments";

const TRACK_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
];

/**
 * Convert a MIDI ArrayBuffer to a DraftSnapshot.
 * Merges into an existing snapshot if provided (keeps meta, appends tracks+notes).
 */
export function parseMidiBuffer(
  buffer: ArrayBuffer,
  existing?: DraftSnapshot,
): DraftSnapshot {
  const midi = new Midi(buffer);

  const ppq = midi.header.ppq ?? 480;
  const tempoChanges = midi.header.tempos;
  const tempo =
    tempoChanges.length > 0 ? Math.round(tempoChanges[0].bpm) : 120;
  const timeSignatures = midi.header.timeSignatures;
  const ts: [number, number] =
    timeSignatures.length > 0
      ? [
          timeSignatures[0].timeSignature[0],
          timeSignatures[0].timeSignature[1],
        ]
      : [4, 4];

  const existingTrackCount = existing?.tracks.length ?? 0;
  const newTracks: DraftTrack[] = [];
  const newNotes: DraftNote[] = [];

  midi.tracks.forEach((midiTrack) => {
    if (midiTrack.notes.length === 0) return;

    const trackId = crypto.randomUUID();
    const colorIdx = (existingTrackCount + newTracks.length) % TRACK_COLORS.length;

    // UC-24/UC-30: auto-assign the instrument from the file's own Program
    // Change data (GM program number 0-127) instead of always leaving it
    // unset — matches by number, not by @tonejs/midi's own lower-cased name
    // string (e.g. "acoustic grand piano" vs our "Acoustic Grand Piano"),
    // since GM_INSTRUMENTS.id is the same 0-127 program number either way.
    // Percussion (channel 10) gets a drum kit, picked by the kit program on
    // that channel (48 = Orchestra); kits we don't bundle (Room, Power, …)
    // fall back to the Standard kit.
    const autoInstrument = midiTrack.instrument.percussion
      ? (getInstrumentById(DRUM_KIT_ID_OFFSET + midiTrack.instrument.number)?.name ?? DRUM_KIT_INSTRUMENT_NAME)
      : (getInstrumentById(midiTrack.instrument.number)?.name ?? null);

    newTracks.push({
      id: trackId,
      name: midiTrack.name || `Track ${existingTrackCount + newTracks.length + 1}`,
      order: existingTrackCount + newTracks.length,
      color: TRACK_COLORS[colorIdx],
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
      instrument: autoInstrument, // UC-30: user can still reassign afterward
    });

    midiTrack.notes.forEach((n) => {
      newNotes.push({
        id: crypto.randomUUID(),
        trackId,
        pitch: n.midi,
        // Convert seconds → ticks using ppq + tempo
        start: Math.round((n.time * tempo * ppq) / 60),
        duration: Math.max(1, Math.round((n.duration * tempo * ppq) / 60)),
        velocity: Math.round(n.velocity * 127),
      });
    });
  });

  if (existing) {
    return {
      ...existing,
      tracks: [...existing.tracks, ...newTracks],
      notes: [...existing.notes, ...newNotes],
    };
  }

  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    meta: { tempo, timeSignature: ts, ppq },
    tracks: newTracks,
    notes: newNotes,
  };
}
