/**
 * midi-parser.ts
 * Parse a MIDI ArrayBuffer → DraftSnapshot using @tonejs/midi.
 * UC-24: Import MIDI file
 */
import { Midi } from "@tonejs/midi";
import { DRAFT_SCHEMA_VERSION, DRUM_KIT_ID_OFFSET, DRUM_KIT_INSTRUMENT_NAME } from "@stave/shared-types";
import type { DraftSnapshot, DraftTrack, DraftNote } from "@stave/shared-types";
import { getInstrumentById } from "./instruments";
import { nextTrackColor } from "./track-colors";


const TRACK_NAME_MAX_LENGTH = 50;

export const MAX_MIDI_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_PROJECT_TRACKS = 32;

export type MidiImportErrorCode = "FILE_TOO_LARGE" | "TOO_MANY_TRACKS";

export class MidiImportError extends Error {
  constructor(public readonly code: MidiImportErrorCode) {
    super(code);
    this.name = "MidiImportError";
  }
}

export interface MidiDiscardReport {
  pitchBends: number;
  controlChanges: number;
  sysex: number;
  extraTempoChanges: number;
  extraTimeSignatureChanges: number;
}

function countSysexEvents(buffer: ArrayBuffer): number {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let pos = 0;
  let count = 0;
  const readVlq = () => {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = data[pos++];
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) break;
    }
    return value;
  };
  try {
    if (data.length < 14 || view.getUint32(0) !== 0x4d546864) return 0;
    pos = 8 + view.getUint32(4);
    while (pos + 8 <= data.length) {
      const id = view.getUint32(pos);
      const len = view.getUint32(pos + 4);
      pos += 8;
      const end = Math.min(data.length, pos + len);
      if (id === 0x4d54726b) {
        let running = 0;
        while (pos < end) {
          readVlq();
          let status = data[pos];
          if (status < 0x80) status = running;
          else pos++;
          if (status === 0xff) {
            pos++;
            pos += readVlq();
          } else if (status === 0xf0 || status === 0xf7) {
            count++;
            pos += readVlq();
          } else {
            running = status;
            const kind = status & 0xf0;
            pos += kind === 0xc0 || kind === 0xd0 ? 1 : 2;
          }
        }
      }
      pos = end;
    }
  } catch {
    return count;
  }
  return count;
}

export function countDiscardedMidiEvents(buffer: ArrayBuffer): MidiDiscardReport {
  const midi = new Midi(buffer);
  let pitchBends = 0;
  let controlChanges = 0;
  midi.tracks.forEach((t) => {
    pitchBends += t.pitchBends.length;
    controlChanges += Object.values(t.controlChanges).reduce((sum, list) => sum + list.length, 0);
  });
  return {
    pitchBends,
    controlChanges,
    sysex: countSysexEvents(buffer),
    extraTempoChanges: Math.max(0, midi.header.tempos.length - 1),
    extraTimeSignatureChanges: Math.max(0, midi.header.timeSignatures.length - 1),
  };
}

const UNSAFE_NAME_CHARS =
  /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function sanitizeTrackName(name: string): string {
  const cleaned = name.replace(UNSAFE_NAME_CHARS, "").trim();
  return cleaned.slice(0, TRACK_NAME_MAX_LENGTH).replace(UNSAFE_NAME_CHARS, "").trim();
}

/**
 * Convert a MIDI ArrayBuffer to a DraftSnapshot.
 * Merges into an existing snapshot if provided (keeps meta, appends tracks+notes).
 */
export function parseMidiBuffer(
  buffer: ArrayBuffer,
  existing?: DraftSnapshot,
): DraftSnapshot {
  if (buffer.byteLength > MAX_MIDI_IMPORT_BYTES) {
    throw new MidiImportError("FILE_TOO_LARGE");
  }
  const midi = new Midi(buffer);

  const ppq = midi.header.ppq ?? 480;
  const targetPpq = existing?.meta.ppq ?? ppq;
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
  const importedTrackCount = midi.tracks.filter((t) => t.notes.length > 0).length;
  if (existingTrackCount + importedTrackCount > MAX_PROJECT_TRACKS) {
    throw new MidiImportError("TOO_MANY_TRACKS");
  }
  const newTracks: DraftTrack[] = [];
  const newNotes: DraftNote[] = [];

  midi.tracks.forEach((midiTrack) => {
    if (midiTrack.notes.length === 0) return;

    const trackId = crypto.randomUUID();
    const trackColor = nextTrackColor([
      ...(existing?.tracks ?? []).map((t) => t.color),
      ...newTracks.map((t) => t.color),
    ]);

    // Some MIDI files pad the track name meta event with NUL bytes (or other
    // control chars). Postgres rejects \u0000 in text/jsonb, so clean the name
    // here with the same character set as the backend and cap it at 50.
    const cleanName = sanitizeTrackName(midiTrack.name ?? "");

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
      name: cleanName || `Track ${existingTrackCount + newTracks.length + 1}`,
      order: existingTrackCount + newTracks.length,
      color: trackColor,
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
        // Ticks của file quy đổi sang ppq của dự án
        start: Math.round((n.ticks * targetPpq) / ppq),
        duration: Math.max(1, Math.round((n.durationTicks * targetPpq) / ppq)),
        velocity: Math.min(127, Math.max(1, Math.round(n.velocity * 127))),
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
