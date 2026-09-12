/**
 * midi-editor.tsx
 * Main container: wires Toolbar + TrackList + PianoRoll together.
 * Handles auto-save (debounce 2s) to PUT /projects/:id/draft
 * UC-24: Import MIDI via hidden file input
 * UC-28: Add track
 * UC-29: Remove track
 * UC-30: Assign instrument to track
 * UC-31: Quantize button
 * UC-32: Copy pattern
 * UC-33: Paste pattern
 * UC-34: Set track color
 * UC-35: Set track label
 */
"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { DRAFT_SCHEMA_VERSION } from "@stave/shared-types";
import type { DraftNote, DraftSnapshot, DraftTrack } from "@stave/shared-types";
import type { GridDivision, ToolMode } from "./midi-toolbar";
import { MidiToolbar } from "./midi-toolbar";
import { TrackList } from "./track-list";
import { PianoRoll } from "./piano-roll";
import type { PianoRollHandle } from "./piano-roll";
import { getDraft, putDraft } from "../../lib/api-client";
import { parseMidiBuffer } from "../../lib/midi-parser";

// Maximum tracks allowed per project (BR-29)
const MAX_TRACKS = 16;

// Color palette for tracks
const TRACK_COLORS = [
  "#6366f1","#ec4899","#f59e0b","#10b981",
  "#3b82f6","#ef4444","#8b5cf6","#14b8a6",
];

interface MidiEditorProps {
  projectId: string;
  projectName: string;
}

export function MidiEditor({ projectId, projectName }: MidiEditorProps) {
  // ── State ───────────────────────────────────────────────────
  const [snapshot, setSnapshot] = useState<DraftSnapshot>({
    schemaVersion: DRAFT_SCHEMA_VERSION,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [],
    notes: [],
  });
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [tool, setTool] = useState<ToolMode>("pencil");
  const [gridDivision, setGridDivision] = useState<GridDivision>(16);
  const [zoom, setZoom] = useState(1);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [playheadTick, setPlayheadTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackLimitWarning, setTrackLimitWarning] = useState(false);
  // UC-32: Selected note IDs for copy
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  // UC-33: Clipboard for paste
  const [clipboard, setClipboard] = useState<DraftNote[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pianoRollRef = useRef<PianoRollHandle>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Always holds the latest snapshot so the unmount-flush below (a cleanup
  // closure, which only ever sees the snapshot from its own render) can save
  // the most recent edit instead of whatever was current when it was set up.
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  // ── Load draft on mount ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getDraft(projectId)
      .then((snap) => {
        if (cancelled) return;
        setSnapshot(snap);
        if (snap.tracks.length > 0) {
          setSelectedTrackId(snap.tracks[0].id);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // ── Keyboard shortcuts (UC-32/33) ───────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't hijack Ctrl/Cmd+A/C/V while the user is typing in a text field
      // (e.g. the track rename input) — those need native select-all/copy/paste.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        handleCopy();
      } else if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        handlePaste();
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        handleSelectAll();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCopy, handlePaste, handleSelectAll, selectedTrackId, snapshot]);

  // ── Flush pending autosave on unmount — a debounced save left running after
  // navigating away can setState on an unmounted component; just clearing the
  // timer would also silently drop the last edit, so fire the save once more
  // instead (best-effort, not awaited — the component is already gone). ─────
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        putDraft(projectId, snapshotRef.current).catch(() => {});
      }
    };
  }, [projectId]);

  // ── Auto-save (debounce 2s) ─────────────────────────────────
  const scheduleSave = useCallback(
    (snap: DraftSnapshot) => {
      setSaveStatus("unsaved");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setSaveStatus("saving");
        try {
          await putDraft(projectId, snap);
          setSaveStatus("saved");
        } catch {
          setSaveStatus("unsaved");
        }
      }, 2000);
    },
    [projectId],
  );

  function updateSnapshot(next: DraftSnapshot) {
    setSnapshot(next);
    scheduleSave(next);
  }

  // ── Note changes ────────────────────────────────────────────
  function handleNotesChange(notes: DraftNote[]) {
    updateSnapshot({ ...snapshot, notes });
  }

  // ── UC-28: Add track ────────────────────────────────────────
  function handleAddTrack() {
    if (snapshot.tracks.length >= MAX_TRACKS) {
      setTrackLimitWarning(true);
      setTimeout(() => setTrackLimitWarning(false), 3000);
      return;
    }

    const idx = snapshot.tracks.length;
    const newTrack: DraftTrack = {
      id: crypto.randomUUID(),
      name: `Track ${idx + 1}`,
      order: idx,
      color: TRACK_COLORS[idx % TRACK_COLORS.length],
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
      instrument: null, // UC-30: default no instrument assigned
    };
    const next = {
      ...snapshot,
      tracks: [...snapshot.tracks, newTrack],
    };
    updateSnapshot(next);
    setSelectedTrackId(newTrack.id);
  }

  function handleToggleMute(id: string) {
    updateSnapshot({
      ...snapshot,
      tracks: snapshot.tracks.map((t) =>
        t.id === id ? { ...t, muted: !t.muted } : t,
      ),
    });
  }

  function handleToggleSolo(id: string) {
    updateSnapshot({
      ...snapshot,
      tracks: snapshot.tracks.map((t) =>
        t.id === id ? { ...t, solo: !t.solo } : t,
      ),
    });
  }

  // ── UC-30: Assign instrument ─────────────────────────────────
  function handleAssignInstrument(id: string, instrument: string | null) {
    updateSnapshot({
      ...snapshot,
      tracks: snapshot.tracks.map((t) =>
        t.id === id ? { ...t, instrument } : t,
      ),
    });
  }

  // ── UC-34: Set track color ──────────────────────────────────
  function handleSetTrackColor(id: string, color: string) {
    updateSnapshot({
      ...snapshot,
      tracks: snapshot.tracks.map((t) =>
        t.id === id ? { ...t, color } : t,
      ),
    });
  }

  // ── UC-35: Set track label ──────────────────────────────────
  function handleSetTrackLabel(id: string, label: string) {
    updateSnapshot({
      ...snapshot,
      tracks: snapshot.tracks.map((t) =>
        t.id === id ? { ...t, name: label } : t,
      ),
    });
  }

  // ── UC-32: Copy selected notes ───────────────────────────────
  function handleCopy() {
    if (selectedNoteIds.size === 0) return;
    const selectedNotes = snapshot.notes.filter((n) => selectedNoteIds.has(n.id));
    if (selectedNotes.length === 0) return;
    setClipboard(selectedNotes);
    // Also copy to system clipboard as JSON
    void navigator.clipboard.writeText(JSON.stringify(selectedNotes)).catch(() => {});
  }

  // ── UC-33: Paste notes ──────────────────────────────────────
  function handlePaste() {
    if (!clipboard || clipboard.length === 0) return;
    const targetTrackId = selectedTrackId ?? snapshot.tracks[0]?.id;
    if (!targetTrackId) return;

    // Calculate offset: paste at playhead position
    const minStart = Math.min(...clipboard.map((n) => n.start));
    const offset = playheadTick - minStart;

    const pastedNotes = clipboard.map((n) => ({
      ...n,
      id: crypto.randomUUID(),
      trackId: targetTrackId,
      start: n.start + offset,
    }));

    updateSnapshot({ ...snapshot, notes: [...snapshot.notes, ...pastedNotes] });
    setSelectedNoteIds(new Set(pastedNotes.map((n) => n.id)));
  }

  // Handle Ctrl+A: select every note shown on the piano roll. The piano roll
  // always renders notes from every track (see `notes={snapshot.notes}`
  // below), so Select All must match that scope — filtering by
  // selectedTrackId here would silently select nothing while notes from
  // other tracks are visibly on screen.
  function handleSelectAll() {
    setSelectedNoteIds(new Set(snapshot.notes.map((n) => n.id)));
  }

  // ── UC-29: Remove track ─────────────────────────────────────
  function handleDeleteTrack(id: string) {
    // BR-30: Project must have at least 1 track
    if (snapshot.tracks.length <= 1) {
      return;
    }

    const trackName = snapshot.tracks.find((t) => t.id === id)?.name ?? "this track";
    const confirmed = window.confirm(
      `Delete track "${trackName}"?\n\nThis will also delete all notes in this track. This action cannot be undone.`,
    );
    if (!confirmed) return;

    updateSnapshot({
      ...snapshot,
      tracks: snapshot.tracks.filter((t) => t.id !== id),
      notes: snapshot.notes.filter((n) => n.trackId !== id),
    });
    if (selectedTrackId === id) {
      // Select the first remaining track
      const remaining = snapshot.tracks.filter((t) => t.id !== id);
      setSelectedTrackId(remaining[0]?.id ?? null);
    }
  }

  // ── UC-31: Quantize ─────────────────────────────────────────
  function handleQuantize() {
    const step = snapshot.meta.ppq / (gridDivision / 4);
    const quantized = snapshot.notes.map((n) => ({
      ...n,
      start: Math.round(n.start / step) * step,
      duration: Math.max(step, Math.round(n.duration / step) * step),
    }));
    updateSnapshot({ ...snapshot, notes: quantized });
  }

  // ── UC-24: Import MIDI ──────────────────────────────────────
  function handleImportMidi() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const merged = parseMidiBuffer(buf, snapshot);
    updateSnapshot(merged);
    if (merged.tracks.length > 0 && !selectedTrackId) {
      setSelectedTrackId(merged.tracks[0].id);
    }
    // Reset input so same file can be re-imported
    e.target.value = "";
  }

  // ── Playback (simple Web Audio oscillator) ──────────────────
  function handlePlay() {
    if (isPlaying) return;
    setIsPlaying(true);
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const bpm = snapshot.meta.tempo;
    const ppq = snapshot.meta.ppq;
    const secPerTick = 60 / (bpm * ppq);
    const startTick = playheadTick;
    const startTime = ctx.currentTime;

    // Schedule all notes via Web Audio
    snapshot.notes.forEach((n) => {
      const track = snapshot.tracks.find((t) => t.id === n.trackId);
      if (track?.muted) return;
      const noteStart = (n.start - startTick) * secPerTick;
      if (noteStart < 0) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440 * Math.pow(2, (n.pitch - 69) / 12);
      osc.type = "sine";
      gain.gain.setValueAtTime(0, startTime + noteStart);
      gain.gain.linearRampToValueAtTime(
        (n.velocity / 127) * (track?.volume ?? 1) * 0.3,
        startTime + noteStart + 0.01,
      );
      const noteDur = n.duration * secPerTick;
      gain.gain.setValueAtTime(
        (n.velocity / 127) * (track?.volume ?? 1) * 0.3,
        startTime + noteStart + noteDur - 0.01,
      );
      gain.gain.linearRampToValueAtTime(0, startTime + noteStart + noteDur);
      osc.start(startTime + noteStart);
      osc.stop(startTime + noteStart + noteDur + 0.01);
    });

    // Animate playhead
    const ticksPerMs = (bpm * ppq) / 60000;
    playTimerRef.current = setInterval(() => {
      const elapsed = (ctx.currentTime - startTime) * 1000;
      setPlayheadTick(Math.floor(startTick + elapsed * ticksPerMs));
    }, 16);
  }

  function handleStop() {
    setIsPlaying(false);
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
    setPlayheadTick(0);
  }

  // ── Render ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
        <p>Loading draft…</p>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* Hidden file input for MIDI import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi"
        style={{ display: "none" }}
        onChange={(e) => void handleFileChange(e)}
      />

      {/* Toolbar */}
      <MidiToolbar
        tool={tool}
        onToolChange={setTool}
        gridDivision={gridDivision}
        onGridChange={setGridDivision}
        zoom={zoom}
        onZoomChange={setZoom}
        onQuantize={handleQuantize}
        onImportMidi={handleImportMidi}
        onPlay={handlePlay}
        onStop={handleStop}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onSelectAll={handleSelectAll}
        isPlaying={isPlaying}
        projectName={projectName}
        hasSelection={selectedNoteIds.size > 0}
        hasClipboard={clipboard !== null}
      />

      {/* Save status strip */}
      <div style={styles.statusBar}>
        <span style={{ ...styles.statusDot, background: saveStatusColor(saveStatus) }} />
        <span style={styles.statusText}>
          {saveStatus === "saved"
            ? "All changes saved"
            : saveStatus === "saving"
              ? "Saving…"
              : "Unsaved changes"}
        </span>
        {trackLimitWarning && (
          <span style={styles.warningText}>
            Maximum {MAX_TRACKS} tracks allowed (BR-29)
          </span>
        )}
        <span style={styles.statusMeta}>
          {snapshot.meta.tempo} BPM · {snapshot.meta.timeSignature.join("/")} ·{" "}
          {snapshot.notes.length} notes · {snapshot.tracks.length}/{MAX_TRACKS} tracks
        </span>
      </div>

      {/* Editor body */}
      <div style={styles.body}>
        <TrackList
          tracks={snapshot.tracks}
          selectedTrackId={selectedTrackId}
          onSelectTrack={setSelectedTrackId}
          onAddTrack={handleAddTrack}
          onToggleMute={handleToggleMute}
          onToggleSolo={handleToggleSolo}
          onDeleteTrack={handleDeleteTrack}
          onAssignInstrument={handleAssignInstrument}
          onSetTrackColor={handleSetTrackColor}
          onSetTrackLabel={handleSetTrackLabel}
          canAddTrack={snapshot.tracks.length < MAX_TRACKS}
        />
        <PianoRoll
          ref={pianoRollRef}
          notes={snapshot.notes}
          tracks={snapshot.tracks}
          selectedTrackId={selectedTrackId}
          tool={tool}
          zoom={zoom}
          ppq={snapshot.meta.ppq}
          gridDivision={gridDivision}
          playheadTick={playheadTick}
          onNotesChange={handleNotesChange}
          selectedNoteIds={selectedNoteIds}
          onSelectedNotesChange={setSelectedNoteIds}
        />
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────── */
function saveStatusColor(s: "saved" | "saving" | "unsaved") {
  if (s === "saved") return "#22c55e";
  if (s === "saving") return "#f59e0b";
  return "#ef4444";
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#09090b",
    color: "#d4d4d8",
    fontFamily: "'Inter', 'Geist', sans-serif",
    overflow: "hidden",
  },
  loading: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 16,
    color: "#71717a",
    fontSize: 14,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #27272a",
    borderTopColor: "#6366f1",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  statusBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "3px 12px",
    background: "#0f0f11",
    borderBottom: "1px solid #1a1a1f",
    flexShrink: 0,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
    transition: "background 0.3s",
  },
  statusText: {
    fontSize: 11,
    color: "#71717a",
  },
  warningText: {
    fontSize: 11,
    color: "#f59e0b",
    fontWeight: 600,
  },
  statusMeta: {
    marginLeft: "auto",
    fontSize: 11,
    color: "#3f3f46",
  },
  body: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },
};
