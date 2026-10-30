"use client";

import { useMemo, useRef } from "react";
import type { DraftNote, DraftTrack } from "@stave/shared-types";
import { PianoRoll } from "../midi-editor/piano-roll";

/**
 * UC-66 — a READ-ONLY wrapper around the editor's `PianoRoll`, driven purely
 * by props (`notes`/`tracks` come from the jam room's server broadcast, never
 * from a local draft — BR-74/POST-3).
 *
 * `PianoRoll` has no `readOnly` prop; read-only is achieved by wiring a no-op
 * `onNotesChange` (the select tool can still highlight a note, but nothing the
 * room does mutates the snapshot locally) and starting in the pointer/select
 * tool. The actual shared edits land in UC-67, where `onNotesChange` becomes
 * the `jam:edit` emitter.
 */

export const PIANO_ROLL_FALLBACK_NOTES: DraftNote[] = [];

export function JamPianoRoll({
  notes,
  tracks,
  ppq,
  gridDivision = 16,
}: {
  notes: DraftNote[];
  tracks: DraftTrack[];
  ppq: number;
  gridDivision?: 4 | 8 | 16 | 32;
}) {
  // A stable empty selection + no-op mutator so the roll renders without any
  // owning draft. `useMemo` keeps the no-op referentially stable.
  const emptySelection = useMemo(() => new Set<string>(), []);
  const noop = useMemo(() => {
    return (): void => {
      // read-only: edits are server-driven in UC-67
    };
  }, []);

  const pianoRollRef = useRef(null);
  const selectedTrackId = tracks[0]?.id ?? null;

  return (
    <PianoRoll
      ref={pianoRollRef}
      notes={notes}
      tracks={tracks}
      selectedTrackId={selectedTrackId}
      tool="pointer"
      zoom={0.5}
      ppq={ppq}
      gridDivision={gridDivision}
      playheadTick={0}
      onNotesChange={noop}
      selectedNoteIds={emptySelection}
      onSelectedNotesChange={noop}
      isPlaying={false}
      onSeek={noop}
    />
  );
}
