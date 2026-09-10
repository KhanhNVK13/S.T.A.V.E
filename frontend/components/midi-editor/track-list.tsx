/**
 * track-list.tsx
 * Left sidebar — shows tracks, allows add/mute/solo/delete.
 * UC-28: Add track
 * UC-29: Remove track
 */
"use client";

import React from "react";
import type { DraftTrack } from "@stave/shared-types";

interface TrackListProps {
  tracks: DraftTrack[];
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onAddTrack: () => void;
  onToggleMute: (id: string) => void;
  onToggleSolo: (id: string) => void;
  onDeleteTrack: (id: string) => void;
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
  noteRowHeight,
  pitchCount,
  canAddTrack = true,
}: TrackListProps) {
  // BR-30: Project must have at least 1 track — cannot delete when only 1 left
  const canDelete = tracks.length > 1;

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
          return (
            <div
              key={track.id}
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
    gap: 6,
    padding: "0 8px",
    cursor: "pointer",
    transition: "background 0.12s",
    borderBottom: "1px solid #27272a22",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  trackName: {
    flex: 1,
    fontSize: 12,
    color: "#d4d4d8",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
};
