/**
 * track-list.tsx
 * Left sidebar — shows tracks, allows add/mute/solo/delete/assign instrument.
 * UC-28: Add track
 * UC-29: Remove track
 * UC-30: Assign instrument to track
 */
"use client";

import React, { useState } from "react";
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
  noteRowHeight: number;
  pitchCount: number; // total visible rows (128)
  canAddTrack?: boolean; // UC-28: max 16 tracks
}

const TRACK_HEIGHT = 36; // px per track header row

export function TrackList({
  tracks,
  selectedTrackId,
  onSelectTrack,
  onAddTrack,
  onToggleMute,
  onToggleSolo,
  onDeleteTrack,
  onAssignInstrument,
  noteRowHeight,
  pitchCount,
  canAddTrack = true,
}: TrackListProps) {
  // BR-30: Project must have at least 1 track — cannot delete when only 1 left
  const canDelete = tracks.length > 1;

  // UC-30: Track being edited for instrument assignment
  const [editingInstrumentTrackId, setEditingInstrumentTrackId] = useState<string | null>(null);

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
                {/* Color dot */}
                <div
                  style={{
                    ...styles.dot,
                    background: track.color,
                  }}
                />

                {/* Track name */}
                <span style={styles.trackName} title={track.name}>
                  {track.name}
                </span>

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
  trackName: {
    fontSize: 12,
    color: "#d4d4d8",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 60,
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
};
