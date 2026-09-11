/**
 * track-list.tsx
 * Left sidebar — shows tracks, allows add/mute/solo/delete/assign instrument/set color.
 * UC-28: Add track
 * UC-29: Remove track
 * UC-30: Assign instrument to track
 * UC-34: Set track color
 * UC-35: Set track label
 */
"use client";

import React, { useState, useRef, useEffect } from "react";
import type { DraftTrack } from "@stave/shared-types";
import { GM_INSTRUMENTS } from "../../lib/instruments";

interface TrackListProps {
  tracks: DraftTrack[];
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onAddTrack: () => void;
  onToggleMute: (id: string) => void;
  onToggleSolo: (id: string) => void;
  onDeleteTrack: (id: string) => void;
  onAssignInstrument: (id: string, instrument: string | null) => void;
  onSetTrackColor: (id: string, color: string) => void;
  onSetTrackLabel: (id: string, label: string) => void;
  noteRowHeight: number;
  pitchCount: number; // total visible rows (128)
  canAddTrack?: boolean; // UC-28: max 16 tracks
}

const TRACK_HEIGHT = 36; // px per track header row

// UC-35 exception 4.E2: label max length — shared by the input's `maxLength`
// attribute and the character counter shown while editing.
const MAX_LABEL_LENGTH = 50;

// UC-34: Color palette for tracks (matches TRACK_COLORS in midi-editor)
const TRACK_COLOR_PALETTE = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#ef4444", // red
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#f97316", // orange
  "#84cc16", // lime
  "#06b6d4", // cyan
  "#a855f7", // purple
];

export function TrackList({
  tracks,
  selectedTrackId,
  onSelectTrack,
  onAddTrack,
  onToggleMute,
  onToggleSolo,
  onDeleteTrack,
  onAssignInstrument,
  onSetTrackColor,
  onSetTrackLabel,
  noteRowHeight,
  pitchCount,
  canAddTrack = true,
}: TrackListProps) {
  // BR-30: Project must have at least 1 track — cannot delete when only 1 left
  const canDelete = tracks.length > 1;

  // UC-30: Track being edited for instrument assignment
  const [editingInstrumentTrackId, setEditingInstrumentTrackId] = useState<string | null>(null);

  // UC-34: Track being edited for color
  const [editingColorTrackId, setEditingColorTrackId] = useState<string | null>(null);

  // UC-35: Track being edited for label
  const [editingLabelTrackId, setEditingLabelTrackId] = useState<string | null>(null);
  const [labelInputValue, setLabelInputValue] = useState("");
  const labelInputRef = useRef<HTMLInputElement>(null);
  // Enter/Escape both end editing, which unmounts the input and triggers a
  // native `blur` — without this flag, onBlur would run again afterwards and
  // re-save (double-fire on Enter) or silently overrule Escape's "discard
  // and restore" (SRS UC-35 alt-flow 3.1). Set before closing, checked (and
  // reset) at the top of onBlur.
  const labelIntentHandledRef = useRef(false);

  function commitLabel(trackId: string) {
    const trimmed = labelInputValue.trim();
    // Exception 4.E1: empty label — restore the previous one (do nothing).
    if (trimmed) onSetTrackLabel(trackId, trimmed);
    labelIntentHandledRef.current = true;
    setEditingLabelTrackId(null);
  }

  function cancelLabelEdit() {
    // Alt-flow 3.1: Escape discards the change and restores the previous label.
    labelIntentHandledRef.current = true;
    setEditingLabelTrackId(null);
  }

  // Auto-focus input when editing starts
  useEffect(() => {
    if (editingLabelTrackId !== null && labelInputRef.current) {
      labelIntentHandledRef.current = false;
      labelInputRef.current.focus();
      labelInputRef.current.select();
    }
  }, [editingLabelTrackId]);

  // Get short display name for instrument
  function getInstrumentDisplayName(instrument: string | null): string {
    if (!instrument) return "—";
    // Get first 12 chars for compact display
    const short = instrument.replace("Acoustic ", "").replace("Electric ", "E-");
    return short.length > 14 ? short.slice(0, 13) + "…" : short;
  }

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerLabel}>Tracks</span>
        <button
          onClick={onAddTrack}
          disabled={!canAddTrack}
          style={{
            ...styles.addBtn,
            ...(!canAddTrack ? styles.addBtnDisabled : {}),
          }}
          title={
            canAddTrack
              ? "Add new track"
              : "Maximum 16 tracks reached (BR-29)"
          }
        >
          + Track
        </button>
      </div>

      {/* Track rows */}
      <div style={styles.list}>
        {tracks.length === 0 && (
          <div style={styles.empty}>No tracks yet</div>
        )}
        {tracks.map((track) => {
          const isSelected = track.id === selectedTrackId;
          const isEditingInstrument = editingInstrumentTrackId === track.id;

          return (
            <div key={track.id}>
              {/* Track row */}
              <div
                onClick={() => onSelectTrack(track.id)}
                style={{
                  ...styles.row,
                  height: TRACK_HEIGHT,
                  background: isSelected
                    ? "rgba(99,102,241,0.15)"
                    : "transparent",
                  borderLeft: `3px solid ${isSelected ? "#6366f1" : track.color}`,
                }}
              >
                {/* Color dot - clickable to change color (UC-34) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingColorTrackId(
                      editingColorTrackId === track.id ? null : track.id
                    );
                  }}
                  title="Click to change track color"
                  style={{
                    ...styles.dot,
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />

                {/* Track name — click to edit label (UC-35) */}
                {editingLabelTrackId === track.id ? (
                  <span style={styles.trackNameEditWrap}>
                    <input
                      ref={labelInputRef}
                      type="text"
                      value={labelInputValue}
                      maxLength={MAX_LABEL_LENGTH}
                      onChange={(e) => setLabelInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          commitLabel(track.id);
                        } else if (e.key === "Escape") {
                          cancelLabelEdit();
                        }
                      }}
                      onBlur={() => {
                        // Enter/Escape already handled intent and closed
                        // editing — the blur that follows (from the input
                        // unmounting) must not save/re-save on top of that.
                        if (labelIntentHandledRef.current) return;
                        commitLabel(track.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={styles.trackNameInput}
                    />
                    {/* Exception 4.E2: show the length limit while editing */}
                    <span style={styles.trackNameCounter}>
                      {labelInputValue.length}/{MAX_LABEL_LENGTH}
                    </span>
                  </span>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLabelInputValue(track.name);
                      setEditingLabelTrackId(track.id);
                    }}
                    title="Click to rename track"
                    style={styles.trackNameBtn}
                  >
                    {track.name}
                  </button>
                )}

                {/* Instrument indicator (clickable) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingInstrumentTrackId(
                      isEditingInstrument ? null : track.id
                    );
                  }}
                  title={track.instrument ?? "Click to assign instrument"}
                  style={styles.instrumentBtn}
                >
                  {getInstrumentDisplayName(track.instrument)}
                </button>

                {/* Controls */}
                <div style={styles.controls}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMute(track.id);
                    }}
                    title={track.muted ? "Unmute" : "Mute"}
                    style={{
                      ...styles.iconBtn,
                      color: track.muted ? "#f59e0b" : "#52525b",
                    }}
                  >
                    {track.muted ? "M" : "m"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSolo(track.id);
                    }}
                    title={track.solo ? "Un-solo" : "Solo"}
                    style={{
                      ...styles.iconBtn,
                      color: track.solo ? "#22c55e" : "#52525b",
                    }}
                  >
                    {track.solo ? "S" : "s"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTrack(track.id);
                    }}
                    disabled={!canDelete}
                    title={
                      canDelete
                        ? "Delete track"
                        : "Cannot delete — project must have at least 1 track (BR-30)"
                    }
                    style={{
                      ...styles.iconBtn,
                      color: canDelete ? "#52525b" : "#27272a",
                      cursor: canDelete ? "pointer" : "not-allowed",
                      opacity: canDelete ? 1 : 0.4,
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* UC-30: Instrument selector dropdown */}
              {isEditingInstrument && (
                <div style={styles.instrumentDropdown}>
                  <div style={styles.instrumentDropdownHeader}>
                    <span style={styles.instrumentDropdownLabel}>Select Instrument</span>
                    <button
                      onClick={() => setEditingInstrumentTrackId(null)}
                      style={styles.instrumentDropdownClose}
                    >
                      ✕
                    </button>
                  </div>
                  {/* None option */}
                  <button
                    onClick={() => {
                      onAssignInstrument(track.id, null);
                      setEditingInstrumentTrackId(null);
                    }}
                    style={{
                      ...styles.instrumentOption,
                      ...(track.instrument === null ? styles.instrumentOptionSelected : {}),
                    }}
                  >
                    <span style={styles.instrumentOptionName}>None (Default)</span>
                  </button>
                  {/* Instrument categories */}
                  {Array.from(new Set(GM_INSTRUMENTS.map((i) => i.category))).map(
                    (category) => (
                      <div key={category}>
                        <div style={styles.instrumentCategory}>{category}</div>
                        {GM_INSTRUMENTS.filter((i) => i.category === category).map(
                          (inst) => (
                            <button
                              key={inst.id}
                              onClick={() => {
                                onAssignInstrument(track.id, inst.name);
                                setEditingInstrumentTrackId(null);
                              }}
                              style={{
                                ...styles.instrumentOption,
                                ...(track.instrument === inst.name
                                  ? styles.instrumentOptionSelected
                                  : {}),
                              }}
                            >
                              <span style={styles.instrumentOptionName}>{inst.name}</span>
                            </button>
                          )
                        )}
                      </div>
                    )
                  )}
                </div>
              )}

              {/* UC-34: Color picker */}
              {editingColorTrackId === track.id && (
                <div style={styles.colorPicker}>
                  <div style={styles.colorPickerHeader}>
                    <span style={styles.colorPickerLabel}>Track Color</span>
                    <button
                      onClick={() => setEditingColorTrackId(null)}
                      style={styles.colorPickerClose}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={styles.colorGrid}>
                    {TRACK_COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          onSetTrackColor(track.id, color);
                          setEditingColorTrackId(null);
                        }}
                        title={color}
                        style={{
                          ...styles.colorSwatch,
                          background: color,
                          ...(track.color === color ? styles.colorSwatchActive : {}),
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  root: {
    width: 180,
    flexShrink: 0,
    background: "#18181b",
    borderRight: "1px solid #27272a",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 10px",
    borderBottom: "1px solid #27272a",
    flexShrink: 0,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  addBtn: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 4,
    border: "1px solid #27272a",
    background: "transparent",
    color: "#818cf8",
    cursor: "pointer",
  },
  addBtnDisabled: {
    color: "#3f3f46",
    cursor: "not-allowed",
    opacity: 0.6,
  },
  list: {
    flex: 1,
    overflowY: "auto",
  },
  empty: {
    padding: "16px 10px",
    fontSize: 12,
    color: "#3f3f46",
    textAlign: "center",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "0 8px",
    cursor: "pointer",
    transition: "background 0.12s",
    borderBottom: "1px solid #27272a22",
    flexWrap: "wrap",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  trackNameEditWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  trackNameCounter: {
    fontSize: 8,
    color: "#52525b",
    lineHeight: 1,
  },
  trackNameBtn: {
    fontSize: 12,
    color: "#d4d4d8",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 60,
    textAlign: "left",
    fontFamily: "inherit",
  },
  trackNameInput: {
    fontSize: 12,
    color: "#d4d4d8",
    background: "#09090b",
    border: "1px solid #6366f1",
    borderRadius: 3,
    padding: "1px 4px",
    outline: "none",
    width: 60,
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  instrumentBtn: {
    fontSize: 9,
    padding: "1px 4px",
    borderRadius: 3,
    border: "1px solid #27272a",
    background: "transparent",
    color: "#6366f1",
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 55,
  },
  controls: {
    display: "flex",
    gap: 2,
    flexShrink: 0,
  },
  iconBtn: {
    width: 18,
    height: 18,
    fontSize: 10,
    fontWeight: 700,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    borderRadius: 3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color 0.12s",
    padding: 0,
  },
  // UC-30: Instrument dropdown styles
  instrumentDropdown: {
    background: "#09090b",
    borderBottom: "1px solid #27272a",
    maxHeight: 240,
    overflowY: "auto",
    padding: "4px 0",
  },
  instrumentDropdownHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 8px 4px",
    borderBottom: "1px solid #27272a",
    marginBottom: 4,
  },
  instrumentDropdownLabel: {
    fontSize: 10,
    color: "#71717a",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  instrumentDropdownClose: {
    fontSize: 10,
    border: "none",
    background: "transparent",
    color: "#52525b",
    cursor: "pointer",
    padding: 0,
  },
  instrumentCategory: {
    fontSize: 9,
    color: "#52525b",
    fontWeight: 600,
    padding: "4px 8px 2px",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  instrumentOption: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "3px 8px",
    fontSize: 10,
    border: "none",
    background: "transparent",
    color: "#a1a1aa",
    cursor: "pointer",
  },
  instrumentOptionSelected: {
    background: "rgba(99,102,241,0.2)",
    color: "#818cf8",
  },
  // UC-34: Color picker styles
  colorPicker: {
    background: "#09090b",
    borderBottom: "1px solid #27272a",
    padding: "6px 8px",
  },
  colorPickerHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  colorPickerLabel: {
    fontSize: 10,
    color: "#71717a",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  colorPickerClose: {
    fontSize: 10,
    border: "none",
    background: "transparent",
    color: "#52525b",
    cursor: "pointer",
    padding: 0,
  },
  colorGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 4,
  },
  colorSwatch: {
    width: "100%",
    aspectRatio: "1",
    border: "1px solid transparent",
    borderRadius: 3,
    cursor: "pointer",
    padding: 0,
  },
  colorSwatchActive: {
    borderColor: "#fff",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.5)",
  },
};
