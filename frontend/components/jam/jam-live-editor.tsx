"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Eraser,
  Lock,
  MousePointer,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import type {
  DraftNote,
  DraftTrack,
  JamNoteDto,
} from "@stave/shared-types";
import { draftNoteToJamNote } from "@stave/shared-types";
import type {
  GridDivision,
  PianoRollHandle,
  ToolMode,
} from "../midi-editor/piano-roll";
import { PianoRoll } from "../midi-editor/piano-roll";
import { VelocityLane } from "../midi-editor/velocity-lane";

/**
 * UC-67 — the collaborative live editor. Re-uses the project's real
 * `PianoRoll` + `VelocityLane` (the same canvas components the private MIDI
 * editor drives), but wires every note change through `onNotesChange` into a
 * diff that emits one `jam:edit_note` op (add / update / delete) per changed
 * note. The room's `jam:note_updated` broadcasts reconcile everyone on the
 * server's LWW truth (8.E1), so the caller's `notes` are always the source of
 * truth and this component is a pure view + editor surface.
 *
 * The caller owns the connection (socket, cooldown clock, read-only flag) and
 * passes in the notes/tracks to render plus the send/notify callbacks.
 */

type JamNoteOpAction = "add" | "update" | "delete";

export interface JamLiveEditorCallbacks {
  /**
   * Emit one LWW op for a single note. The socket layer handles cooldown /
   * read-only gating; the server's broadcast then reconciles everyone.
   */
  sendNote: (action: JamNoteOpAction, note: JamNoteDto) => Promise<boolean>;
  /** Toast / inline notice (2.E1 cooldown, 12.E1 storage warning, …). */
  notify?: (
    message: string,
    variant?: "success" | "warning" | "info",
  ) => void;
}

export interface JamLiveEditorProps {
  notes: DraftNote[];
  tracks: DraftTrack[];
  ppq: number;
  /** BR-70 — frozen when the event ended (5.E1). */
  isReadOnly: boolean;
  /** 2.E1 — ms left on the caller's cooldown (0 = can edit). */
  cooldownRemainingMs: number;
  callbacks: JamLiveEditorCallbacks;
}

/** One op to emit: which action and the note it targets. */
interface NoteOp {
  action: JamNoteOpAction;
  note: DraftNote;
}

/**
 * Diff two note lists by id + content so each real change maps to exactly
 * one LWW op. `before`/`after` are the same shape the editor hands us.
 */
function diffNotes(before: DraftNote[], after: DraftNote[]): NoteOp[] {
  const beforeMap = new Map(before.map((n) => [n.id, n]));
  const afterMap = new Map(after.map((n) => [n.id, n]));
  const ops: NoteOp[] = [];
  for (const note of afterMap.values()) {
    const prev = beforeMap.get(note.id);
    if (!prev) {
      ops.push({ action: "add", note });
    } else if (
      prev.pitch !== note.pitch ||
      prev.start !== note.start ||
      prev.duration !== note.duration ||
      prev.velocity !== note.velocity ||
      prev.trackId !== note.trackId
    ) {
      ops.push({ action: "update", note });
    }
  }
  for (const note of beforeMap.values()) {
    if (!afterMap.has(note.id)) ops.push({ action: "delete", note });
  }
  return ops;
}

const TOOLS: Array<{ id: ToolMode; icon: LucideIcon; label: string }> = [
  { id: "pointer", icon: MousePointer, label: "Chọn (P)" },
  { id: "pencil", icon: Pencil, label: "Vẽ nốt (B)" },
  { id: "eraser", icon: Eraser, label: "Xoá nốt (E)" },
];

export function JamLiveEditor({
  notes,
  tracks,
  ppq,
  isReadOnly,
  cooldownRemainingMs,
  callbacks,
}: JamLiveEditorProps) {
  const [tool, setTool] = useState<ToolMode>("pencil");
  const [zoom, setZoom] = useState(1);
  const [gridDivision] = useState<GridDivision>(16);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(() => new Set());
  const [scrollX, setScrollX] = useState(0);
  const rollRef = useRef<PianoRollHandle | null>(null);
  const localNotes = useRef<DraftNote[]>(notes);

  const effectiveTrack = selectedTrackId ?? tracks[0]?.id ?? null;

  // The editor hands us the full new notes array after each mutation. We
  // diff it against the last one we saw (localNotes) and emit one op per
  // real change. The caller's `notes` prop (the server's truth) always
  // re-renders us; we just forward intent. The local mirror only advances
  // when the server accepted the ops — a rejected batch (2.E1 cooldown /
  // BR-70 read-only) must not leak a "ghost" op into the next diff.
  const handleNotesChange = useCallback(
    (next: DraftNote[]) => {
      const ops = diffNotes(localNotes.current, next);
      if (ops.length === 0) return;
      void Promise.all(
        ops.map((op) => callbacks.sendNote(op.action, draftNoteToJamNote(op.note))),
      ).then((accepted) => {
        if (accepted.every(Boolean)) localNotes.current = next;
      });
    },
    [callbacks],
  );

  // Keep the local mirror in sync when the caller's authoritative notes
  // change (a remote `jam:note_updated` just reconciled everyone). We only
  // resync when the notes array identity changes — our own pending ops do
  // not swap the caller's array, so the mirror follows the server's truth.
  useEffect(() => {
    localNotes.current = notes;
  }, [notes]);

  const cooldownSec = Math.ceil(cooldownRemainingMs / 1000);

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Toolbar: tool + track + zoom (mirrors the private editor's rail). */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-1 py-2">
        <div className="flex items-center gap-1">
          {TOOLS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              disabled={isReadOnly}
              onClick={() => setTool(id)}
              className={`rounded px-2 py-1.5 text-xs transition ${
                tool === id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted hover:bg-surface-muted"
              } ${isReadOnly ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        <select
          className="rounded border border-border bg-surface px-2 py-1.5 text-xs"
          value={effectiveTrack ?? ""}
          onChange={(e) => setSelectedTrackId(e.target.value || null)}
          disabled={isReadOnly}
          aria-label="Chọn track"
        >
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name || `Track ${t.order + 1}`}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted">
          <button
            className="rounded border border-border px-2 py-1"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            aria-label="Thu nhỏ"
          >
            −
          </button>
          <span className="w-8 text-center">{Math.round(zoom * 100)}%</span>
          <button
            className="rounded border border-border px-2 py-1"
            onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
            aria-label="Phóng to"
          >
            +
          </button>
          {isReadOnly && (
            <span className="inline-flex items-center gap-1 text-danger">
              <Lock className="h-3.5 w-3.5" /> Chỉ đọc
            </span>
          )}
          {!isReadOnly && cooldownSec > 0 && (
            <span className="text-warning-foreground">Chỉnh: {cooldownSec}s</span>
          )}
        </div>
      </div>

      {/* The shared canvas grid + velocity lane (same as the private editor). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden rounded border border-border">
          <PianoRoll
            ref={rollRef}
            notes={notes}
            tracks={tracks}
            selectedTrackId={effectiveTrack}
            tool={tool}
            zoom={zoom}
            ppq={ppq}
            gridDivision={gridDivision}
            playheadTick={0}
            isPlaying={false}
            onNotesChange={handleNotesChange}
            selectedNoteIds={selectedNoteIds}
            onSelectedNotesChange={setSelectedNoteIds}
            onSeek={() => {}}
            onNotify={callbacks.notify}
            isReadOnly={isReadOnly}
            onScrollXChange={setScrollX}
          />
        </div>
        <VelocityLane
          notes={notes}
          tracks={tracks}
          scrollX={scrollX}
          zoom={zoom}
          selectedNoteIds={selectedNoteIds}
          onNotesChange={handleNotesChange}
          readOnly={isReadOnly}
        />
      </div>
    </div>
  );
}
