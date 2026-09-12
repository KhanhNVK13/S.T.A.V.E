/**
 * midi-toolbar.tsx
 * Toolbar for the MIDI Editor: tool selector, grid quantize, zoom, import, play.
 */
"use client";

import React from "react";

export type ToolMode = "pointer" | "pencil" | "eraser";
export type GridDivision = 4 | 8 | 16 | 32;

interface MidiToolbarProps {
  tool: ToolMode;
  onToolChange: (t: ToolMode) => void;
  gridDivision: GridDivision;
  onGridChange: (g: GridDivision) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  onQuantize: () => void;
  onImportMidi: () => void;
  onPlay: () => void;
  onStop: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onPause: () => void;
  onToggleLoop: () => void;
  isPlaying: boolean;
  isPaused: boolean;
  loopOn: boolean;
  projectName: string;
  hasSelection: boolean;
  hasClipboard: boolean;
  /** Mở bản UI dựng theo mockup thiết kế (giao diện gốc vẫn là mặc định). */
  onOpenRedesign: () => void;
  /** 0..1 — âm lượng chung cho TẤT CẢ track (chỉ ảnh hưởng lúc phát, không ghi vào snapshot). */
  masterVolume: number;
  onMasterVolumeChange: (v: number) => void;
  /** UC-36: Tempo (BPM) — ghi thẳng vào snapshot.meta.tempo. */
  tempo: number;
  onTempoChange: (bpm: number) => void;
  /** UC-36: Metronome click trong lúc phát. */
  metronomeOn: boolean;
  onMetronomeToggle: () => void;
}

const TOOLS: { id: ToolMode; label: string; icon: string; title: string }[] = [
  { id: "pointer", label: "Select", icon: "↖", title: "Pointer – Select & Move notes" },
  { id: "pencil", label: "Draw", icon: "✏", title: "Pencil – Click to add notes" },
  { id: "eraser", label: "Erase", icon: "⌫", title: "Eraser – Click to delete notes" },
];

const GRIDS: { value: GridDivision; label: string }[] = [
  { value: 4, label: "1/4" },
  { value: 8, label: "1/8" },
  { value: 16, label: "1/16" },
  { value: 32, label: "1/32" },
];

export function MidiToolbar({
  tool,
  onToolChange,
  gridDivision,
  onGridChange,
  zoom,
  onZoomChange,
  onQuantize,
  onImportMidi,
  onPlay,
  onStop,
  onCopy,
  onPaste,
  onSelectAll,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onPause,
  onToggleLoop,
  isPlaying,
  isPaused,
  loopOn,
  projectName,
  hasSelection,
  hasClipboard,
  onOpenRedesign,
  masterVolume,
  onMasterVolumeChange,
  tempo,
  onTempoChange,
  metronomeOn,
  onMetronomeToggle,
}: MidiToolbarProps) {
  return (
    <div style={styles.bar}>
      {/* Project name */}
      <span style={styles.projectName} title={projectName}>
        {projectName}
      </span>

      <div style={styles.divider} />

      {/* Tool modes */}
      <div style={styles.group}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            title={t.title}
            onClick={() => onToolChange(t.id)}
            style={{
              ...styles.btn,
              ...(tool === t.id ? styles.btnActive : {}),
            }}
          >
            <span style={styles.btnIcon}>{t.icon}</span>
            <span style={styles.btnLabel}>{t.label}</span>
          </button>
        ))}
      </div>

      <div style={styles.divider} />

      {/* Grid quantize */}
      <div style={styles.group}>
        <span style={styles.label}>Grid</span>
        {GRIDS.map((g) => (
          <button
            key={g.value}
            onClick={() => onGridChange(g.value)}
            style={{
              ...styles.btn,
              ...(gridDivision === g.value ? styles.btnActive : {}),
            }}
          >
            {g.label}
          </button>
        ))}
        <button
          onClick={onQuantize}
          title="Quantize all notes to grid (UC-31)"
          style={{ ...styles.btn, ...styles.btnSpecial }}
        >
          ⟵ Quantize
        </button>
      </div>

      <div style={styles.divider} />

      {/* Zoom */}
      <div style={styles.group}>
        <button
          onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))}
          style={styles.btn}
          title="Zoom out"
        >
          −
        </button>
        <span style={styles.label}>{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => onZoomChange(Math.min(4, zoom + 0.25))}
          style={styles.btn}
          title="Zoom in"
        >
          +
        </button>
      </div>

      <div style={styles.divider} />

      {/* Copy/Paste (UC-32/33) */}
      <div style={styles.group}>
        <button
          onClick={onSelectAll}
          title="Select all notes (Ctrl+A)"
          style={{ ...styles.btn, ...styles.btnSpecial }}
        >
          ⊞ All
        </button>
        <button
          onClick={onCopy}
          disabled={!hasSelection}
          title={hasSelection ? "Copy selected notes (Ctrl+C)" : "Select notes first"}
          style={{
            ...styles.btn,
            ...(!hasSelection ? styles.btnDisabled : styles.btnSpecial),
          }}
        >
          ⧉ Copy
        </button>
        <button
          onClick={onPaste}
          disabled={!hasClipboard}
          title={hasClipboard ? "Paste notes (Ctrl+V)" : "Nothing to paste"}
          style={{
            ...styles.btn,
            ...(!hasClipboard ? styles.btnDisabled : styles.btnSpecial),
          }}
        >
          ⧉ Paste
        </button>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title={canUndo ? "Undo (Ctrl+Z)" : "Nothing to undo"}
          style={{
            ...styles.btn,
            ...(!canUndo ? styles.btnDisabled : styles.btnSpecial),
          }}
        >
          ↶ Undo
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title={canRedo ? "Redo (Ctrl+Y / Ctrl+Shift+Z)" : "Nothing to redo"}
          style={{
            ...styles.btn,
            ...(!canRedo ? styles.btnDisabled : styles.btnSpecial),
          }}
        >
          ↷ Redo
        </button>
      </div>

      <div style={styles.divider} />

      {/* Playback (UC-37) */}
      <div style={styles.group}>
        {isPlaying ? (
          <>
            <button onClick={onPause} style={{ ...styles.btn, ...styles.btnPause }} title="Pause">
              ⏸
            </button>
            <button onClick={onStop} style={{ ...styles.btn, ...styles.btnStop }} title="Stop">
              ■
            </button>
          </>
        ) : isPaused ? (
          <>
            <button onClick={onPlay} style={{ ...styles.btn, ...styles.btnPlay }} title="Resume">
              ▶ Resume
            </button>
            <button onClick={onStop} style={{ ...styles.btn, ...styles.btnStop }} title="Stop">
              ■
            </button>
          </>
        ) : (
          <button onClick={onPlay} style={{ ...styles.btn, ...styles.btnPlay }} title="Play">
            ▶
          </button>
        )}
        {/* Loop toggle */}
        <button
          onClick={onToggleLoop}
          title={loopOn ? "Loop: ON (click to disable)" : "Loop: OFF (click to enable)"}
          style={{
            ...styles.btn,
            ...(loopOn ? styles.btnLoopActive : {}),
          }}
        >
          🔁 Loop
        </button>
        {/* UC-36: Metronome toggle */}
        <button
          onClick={onMetronomeToggle}
          title={metronomeOn ? "Metronome: ON (click to disable)" : "Metronome: OFF (click to enable)"}
          style={{
            ...styles.btn,
            ...(metronomeOn ? styles.btnMetronomeActive : {}),
          }}
        >
          🎵 Metro
        </button>
      </div>

      <div style={styles.divider} />

      {/* UC-36: Tempo (BPM) */}
      <div style={styles.group} title="Tempo (BPM)">
        <span style={styles.label}>BPM</span>
        <input
          type="number"
          min={20}
          max={300}
          value={tempo}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= 20 && v <= 300) onTempoChange(v);
          }}
          style={styles.bpmInput}
        />
      </div>

      <div style={styles.divider} />

      {/* Master volume — chỉnh âm lượng đồng bộ cho TẤT CẢ track cùng lúc,
          thay vì phải chỉnh từng track riêng (xem masterGainRef trong
          midi-editor.tsx). Chỉ ảnh hưởng output lúc phát, không ghi vào
          snapshot/track.volume của từng track. */}
      <div style={styles.group} title="Âm lượng chung cho tất cả track">
        <span style={styles.label}>🔊</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={masterVolume}
          onChange={(e) => onMasterVolumeChange(Number(e.target.value))}
          style={styles.masterVolumeSlider}
        />
        <span style={styles.masterVolumeValue}>{Math.round(masterVolume * 100)}%</span>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Import MIDI */}
      <button
        onClick={onImportMidi}
        title="Import MIDI file (UC-24)"
        style={{ ...styles.btn, ...styles.btnImport }}
      >
        ⬆ Import MIDI
      </button>

      {/* Chuyển sang bản UI dựng theo mockup thiết kế */}
      <button
        onClick={onOpenRedesign}
        title="Xem bản giao diện mới dựng theo mockup thiết kế"
        style={{ ...styles.btn, ...styles.btnRedesign }}
      >
        ◧ Xem giao diện mới
      </button>
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "0 12px",
    height: 44,
    background: "#18181b",
    borderBottom: "1px solid #27272a",
    flexShrink: 0,
    overflow: "hidden",
  },
  projectName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#a1a1aa",
    maxWidth: 140,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  divider: {
    width: 1,
    height: 24,
    background: "#27272a",
    margin: "0 4px",
    flexShrink: 0,
  },
  group: {
    display: "flex",
    alignItems: "center",
    gap: 2,
  },
  label: {
    fontSize: 11,
    color: "#71717a",
    padding: "0 4px",
    userSelect: "none",
  },
  masterVolumeSlider: {
    width: 72,
    accentColor: "#6366f1",
    cursor: "pointer",
  },
  masterVolumeValue: {
    fontSize: 11,
    color: "#a1a1aa",
    width: 34,
    textAlign: "right",
    userSelect: "none",
  },
  btn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 8px",
    fontSize: 12,
    borderRadius: 5,
    border: "1px solid #27272a",
    background: "transparent",
    color: "#a1a1aa",
    cursor: "pointer",
    transition: "background 0.12s, color 0.12s",
    whiteSpace: "nowrap",
  },
  btnActive: {
    background: "#6366f1",
    borderColor: "#6366f1",
    color: "#fff",
  },
  btnSpecial: {
    borderColor: "#4f46e5",
    color: "#818cf8",
  },
  btnDisabled: {
    color: "#3f3f46",
    cursor: "not-allowed",
    opacity: 0.5,
  },
  btnPlay: {
    background: "#16a34a",
    borderColor: "#16a34a",
    color: "#fff",
  },
  btnStop: {
    background: "#dc2626",
    borderColor: "#dc2626",
    color: "#fff",
  },
  btnPause: {
    background: "#f59e0b",
    borderColor: "#f59e0b",
    color: "#fff",
  },
  btnLoopActive: {
    background: "#7c3aed",
    borderColor: "#7c3aed",
    color: "#fff",
  },
  btnMetronomeActive: {
    background: "#d97706",
    borderColor: "#d97706",
    color: "#fff",
  },
  bpmInput: {
    width: 48,
    padding: "3px 6px",
    fontSize: 12,
    borderRadius: 5,
    border: "1px solid #27272a",
    background: "#111113",
    color: "#e4e4e7",
  },
  btnImport: {
    borderColor: "#0ea5e9",
    color: "#38bdf8",
  },
  btnRedesign: {
    borderColor: "#a855f7",
    color: "#d8b4fe",
  },
  btnIcon: {
    fontSize: 14,
    lineHeight: 1,
  },
  btnLabel: {
    fontSize: 11,
  },
};
