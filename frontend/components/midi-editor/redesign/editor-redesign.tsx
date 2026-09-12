/**
 * redesign/editor-redesign.tsx
 * Bản UI thứ 2 của MIDI Editor — dựng lại theo mockup thật
 * (docs/STAVE design component sample/.../STAVE.dc.html, screen "editor").
 *
 * Khác UI gốc về CẤU TRÚC, không chỉ màu:
 *   - header riêng 60px: branch + transport dạng segmented + Commit
 *   - tool strip riêng cho các công cụ soạn nhạc
 *   - body 3 cột: Tracks | Piano roll | Project History  (UI gốc chỉ có 2 cột)
 *   - footer 34px hiện thông số thật
 *
 * 0% tái sử dụng JSX/CSS của UI gốc. Toàn bộ state/handler nhận từ
 * `MidiEditor` — chung một nguồn dữ liệu với UI gốc nên đổi qua lại không mất
 * thay đổi đang soạn.
 */
"use client";

import React, { useState } from "react";
import {
  ClipboardPaste,
  Copy,
  Eraser,
  GitBranch,
  GitCommitHorizontal,
  Magnet,
  MousePointer2,
  Pause,
  Pencil,
  Play,
  Repeat,
  Square,
  SquareCheck,
  Undo2,
  Redo2,
  Upload,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { DraftNote, DraftSnapshot, DraftTrack } from "@stave/shared-types";
import type { CommitWithAuthor } from "../../../lib/api-client";
import type { GridDivision, ToolMode } from "../midi-toolbar";
import { PianoRoll } from "../piano-roll";
import type { PianoRollHandle } from "../piano-roll";
import { TrackPanel } from "./track-panel";
import { HistoryPanel } from "./history-panel";
import { CommitDialog } from "./commit-dialog";
import { RestoreDialog } from "./restore-dialog";
import { useVersionControl } from "./use-version-control";
import { DC, DC_SIZE } from "./tokens";

const TOOLS: { id: ToolMode; label: string; Icon: typeof Pencil; title: string }[] = [
  { id: "pointer", label: "Select", Icon: MousePointer2, title: "Chọn & di chuyển note" },
  { id: "pencil", label: "Draw", Icon: Pencil, title: "Vẽ note mới (UC-25)" },
  { id: "eraser", label: "Erase", Icon: Eraser, title: "Xoá note (UC-27)" },
];

const GRIDS: { value: GridDivision; label: string }[] = [
  { value: 4, label: "1/4" },
  { value: 8, label: "1/8" },
  { value: 16, label: "1/16" },
  { value: 32, label: "1/32" },
];

interface EditorRedesignProps {
  projectId: string;
  projectName: string;
  // Dữ liệu nhạc
  /** Nguyên bản nháp đang mở — dùng cho Version Control (commit/so sánh). */
  snapshot: DraftSnapshot;
  notes: DraftNote[];
  tracks: DraftTrack[];
  tempo: number;
  timeSignature: [number, number];
  ppq: number;
  // Trạng thái soạn thảo
  tool: ToolMode;
  onToolChange: (t: ToolMode) => void;
  gridDivision: GridDivision;
  onGridChange: (g: GridDivision) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
  selectedNoteIds: Set<string>;
  onSelectedNotesChange: (ids: Set<string>) => void;
  onNotesChange: (notes: DraftNote[]) => void;
  playheadTick: number;
  pianoRollRef: React.RefObject<PianoRollHandle | null>;
  // Track
  onAddTrack: () => void;
  onToggleMute: (id: string) => void;
  onToggleSolo: (id: string) => void;
  onDeleteTrack: (id: string) => void;
  onAssignInstrument: (id: string, instrument: string | null) => void;
  onSetTrackColor: (id: string, color: string) => void;
  onSetTrackLabel: (id: string, label: string) => void;
  onSetTrackVolume: (id: string, volume: number) => void;
  canAddTrack: boolean;
  maxTracks: number;
  trackLimitWarning: boolean;
  // Thao tác
  onQuantize: () => void;
  onImportMidi: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  hasClipboard: boolean;
  // Playback
  isPlaying: boolean;
  isPaused: boolean;
  loopOn: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onSeek: (tick: number) => void;
  // Lưu
  saveStatus: "saved" | "saving" | "unsaved";
  /** Ghi ngay bản nháp xuống server (huỷ debounce) — chạy trước mỗi lần commit. */
  onFlushDraft: () => Promise<void>;
  /** Nạp lại editor theo snapshot backend trả về sau khi khôi phục (UC-46). */
  onSnapshotRestored: (snapshot: DraftSnapshot) => void;
  // Chuyển về UI gốc
  onBackToClassic: () => void;
  /** 0..1 — âm lượng chung cho TẤT CẢ track (chỉ ảnh hưởng lúc phát, không ghi vào snapshot). */
  masterVolume: number;
  onMasterVolumeChange: (v: number) => void;
}

export function EditorRedesign(props: EditorRedesignProps) {
  const {
    projectId, projectName, snapshot, notes, tracks, tempo, timeSignature, ppq,
    tool, onToolChange, gridDivision, onGridChange, zoom, onZoomChange,
    selectedTrackId, onSelectTrack, selectedNoteIds, onSelectedNotesChange,
    onNotesChange, playheadTick, pianoRollRef,
    onAddTrack, onToggleMute, onToggleSolo, onDeleteTrack, onAssignInstrument,
    onSetTrackColor, onSetTrackLabel, onSetTrackVolume, canAddTrack, maxTracks,
    trackLimitWarning,
    onQuantize, onImportMidi, onCopy, onPaste, onSelectAll, hasSelection, hasClipboard,
    onUndo, onRedo, canUndo, canRedo,
    isPlaying, isPaused, loopOn, onPlay, onPause, onStop, onToggleLoop, onSeek,
    saveStatus, onFlushDraft, onSnapshotRestored, onBackToClassic,
    masterVolume, onMasterVolumeChange,
  } = props;

  const canStop = isPlaying || isPaused;

  // ── Version Control (UC-42/43/44/46) ────────────────────────
  const vc = useVersionControl({
    projectId,
    flushDraft: onFlushDraft,
    onSnapshotRestored,
  });
  const [commitOpen, setCommitOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<CommitWithAuthor | null>(null);
  const branchLabel = vc.branch?.name ?? "main";
  const canCommit = vc.branch !== null && !vc.branchLoading;

  const { clearCommitError, clearRestoreError } = vc;

  function openCommitDialog() {
    clearCommitError();
    setCommitOpen(true);
  }

  async function submitCommit(message: string) {
    const ok = await vc.commit(message);
    if (ok) setCommitOpen(false);
  }

  function openRestoreDialog(commit: CommitWithAuthor) {
    clearRestoreError();
    setRestoreTarget(commit);
  }

  async function confirmRestore() {
    if (!restoreTarget) return;
    const ok = await vc.restore(restoreTarget.id);
    if (ok) setRestoreTarget(null);
  }

  return (
    <div style={styles.root}>
      {/* ── Header (mockup dòng 159–199) ───────────────────────── */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.projectName} title={projectName}>
            {projectName}
          </span>
          <span style={styles.branchChip} title="Branch mặc định của project">
            <GitBranch size={14} color={DC.accent} />
            <span style={styles.branchName}>{branchLabel}</span>
          </span>
        </div>

        {/* Transport — segmented control đúng mockup dòng 182–192 */}
        <div style={styles.transport}>
          <button
            onClick={onPlay}
            disabled={isPlaying}
            title={isPaused ? "Phát tiếp" : "Phát (UC-37)"}
            style={{
              ...styles.transportBtn,
              background: isPlaying ? DC.accent : "transparent",
              color: isPlaying ? "#fff" : DC.text,
              cursor: isPlaying ? "default" : "pointer",
            }}
          >
            <Play size={15} fill="currentColor" strokeWidth={0} />
          </button>
          <button
            onClick={onPause}
            disabled={!isPlaying}
            title="Tạm dừng"
            style={{
              ...styles.transportBtn,
              color: isPlaying ? DC.text : "#C6C8CD",
              cursor: isPlaying ? "pointer" : "not-allowed",
            }}
          >
            <Pause size={15} fill="currentColor" strokeWidth={0} />
          </button>
          <button
            onClick={onStop}
            disabled={!canStop}
            title="Dừng, đưa playhead về đầu"
            style={{
              ...styles.transportBtn,
              color: canStop ? DC.text : "#C6C8CD",
              cursor: canStop ? "pointer" : "not-allowed",
            }}
          >
            <Square size={13} fill="currentColor" strokeWidth={0} />
          </button>
          <span style={styles.transportDivider} />
          <button
            onClick={onToggleLoop}
            title={loopOn ? "Loop: ĐANG BẬT" : "Loop: đang tắt"}
            style={{
              ...styles.transportBtn,
              background: loopOn ? DC.accent : "transparent",
              color: loopOn ? "#fff" : DC.text,
            }}
          >
            <Repeat size={15} />
          </button>
        </div>

        <div style={styles.headerRight}>
          <button
            onClick={openCommitDialog}
            disabled={!canCommit}
            title={
              vc.branchError
                ? `Không tải được branch: ${vc.branchError}`
                : vc.branchLoading
                  ? "Đang tải thông tin branch…"
                  : "Ghi lại phiên bản hiện tại (UC-42)"
            }
            style={{
              ...styles.commitBtn,
              opacity: canCommit ? 1 : 0.45,
              cursor: canCommit ? "pointer" : "not-allowed",
            }}
          >
            <GitCommitHorizontal size={16} />
            Commit Changes
          </button>
          <button onClick={onBackToClassic} style={styles.backBtn}>
            Quay lại giao diện gốc
          </button>
        </div>
      </header>

      {/* ── Tool strip ─────────────────────────────────────────── */}
      <div style={styles.toolStrip}>
        <div style={styles.segment}>
          {TOOLS.map(({ id, label, Icon, title }) => (
            <button
              key={id}
              title={title}
              onClick={() => onToolChange(id)}
              style={{
                ...styles.segmentBtn,
                background: tool === id ? DC.surface : "transparent",
                color: tool === id ? DC.accent : DC.textMuted,
                boxShadow: tool === id ? "0 1px 2px rgba(0,0,0,.08)" : "none",
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <span style={styles.stripDivider} />

        <span style={styles.stripLabel}>GRID</span>
        <div style={styles.segment}>
          {GRIDS.map((g) => (
            <button
              key={g.value}
              onClick={() => onGridChange(g.value)}
              style={{
                ...styles.segmentBtn,
                fontFamily: DC.mono,
                background: gridDivision === g.value ? DC.surface : "transparent",
                color: gridDivision === g.value ? DC.accent : DC.textMuted,
                boxShadow: gridDivision === g.value ? "0 1px 2px rgba(0,0,0,.08)" : "none",
              }}
            >
              {g.label}
            </button>
          ))}
        </div>
        <button onClick={onQuantize} title="Quantize toàn bộ note về lưới (UC-31)" style={styles.ghostBtn}>
          <Magnet size={14} />
          Quantize
        </button>

        <span style={styles.stripDivider} />

        <button onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))} title="Thu nhỏ" style={styles.iconBtn}>
          <ZoomOut size={14} />
        </button>
        <span style={styles.zoomValue}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => onZoomChange(Math.min(4, zoom + 0.25))} title="Phóng to" style={styles.iconBtn}>
          <ZoomIn size={14} />
        </button>

        <span style={styles.stripDivider} />

        {/* Master volume — chỉnh âm lượng đồng bộ cho TẤT CẢ track cùng lúc,
            thay vì phải kéo thanh VOL từng track riêng ở panel Tracks. Chỉ
            ảnh hưởng output lúc phát (masterGainRef trong midi-editor.tsx),
            không ghi vào snapshot/track.volume của từng track. */}
        <div style={styles.masterVolumeGroup} title="Âm lượng chung cho tất cả track">
          {masterVolume === 0 ? (
            <VolumeX size={14} color={DC.textMuted} />
          ) : (
            <Volume2 size={14} color={DC.textMuted} />
          )}
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

        <span style={styles.stripDivider} />

        <button onClick={onSelectAll} title="Chọn tất cả note (Ctrl+A)" style={styles.ghostBtn}>
          <SquareCheck size={14} />
          All
        </button>
        <button
          onClick={onCopy}
          disabled={!hasSelection}
          title={hasSelection ? "Copy note đã chọn (Ctrl+C)" : "Chọn note trước đã"}
          style={{ ...styles.ghostBtn, opacity: hasSelection ? 1 : 0.4, cursor: hasSelection ? "pointer" : "not-allowed" }}
        >
          <Copy size={14} />
          Copy
        </button>
        <button
          onClick={onPaste}
          disabled={!hasClipboard}
          title={hasClipboard ? "Dán note (Ctrl+V)" : "Chưa có gì để dán"}
          style={{ ...styles.ghostBtn, opacity: hasClipboard ? 1 : 0.4, cursor: hasClipboard ? "pointer" : "not-allowed" }}
        >
          <ClipboardPaste size={14} />
          Paste
        </button>

        <span style={styles.stripDivider} />

        <button
          onClick={onUndo}
          disabled={!canUndo}
          title={canUndo ? "Hoàn tác (Ctrl+Z)" : "Không có gì để hoàn tác"}
          style={{ ...styles.ghostBtn, opacity: canUndo ? 1 : 0.4, cursor: canUndo ? "pointer" : "not-allowed" }}
        >
          <Undo2 size={14} />
          Undo
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title={canRedo ? "Làm lại (Ctrl+Y / Ctrl+Shift+Z)" : "Không có gì để làm lại"}
          style={{ ...styles.ghostBtn, opacity: canRedo ? 1 : 0.4, cursor: canRedo ? "pointer" : "not-allowed" }}
        >
          <Redo2 size={14} />
          Redo
        </button>

        <span style={{ flex: 1 }} />

        {trackLimitWarning && (
          <span style={styles.warning}>Tối đa {maxTracks} track (BR-29)</span>
        )}

        <button onClick={onImportMidi} title="Nhập file MIDI (UC-24)" style={styles.primaryGhostBtn}>
          <Upload size={14} />
          Import MIDI
        </button>
      </div>

      {/* ── Body 3 cột (mockup dòng 201–307) ───────────────────── */}
      <div style={styles.body}>
        <TrackPanel
          tracks={tracks}
          selectedTrackId={selectedTrackId}
          onSelectTrack={onSelectTrack}
          onAddTrack={onAddTrack}
          onToggleMute={onToggleMute}
          onToggleSolo={onToggleSolo}
          onDeleteTrack={onDeleteTrack}
          onAssignInstrument={onAssignInstrument}
          onSetTrackColor={onSetTrackColor}
          onSetTrackLabel={onSetTrackLabel}
          onSetTrackVolume={onSetTrackVolume}
          canAddTrack={canAddTrack}
        />

        <div style={styles.rollWrap}>
          <PianoRoll
            ref={pianoRollRef}
            notes={notes}
            tracks={tracks}
            selectedTrackId={selectedTrackId}
            tool={tool}
            zoom={zoom}
            ppq={ppq}
            gridDivision={gridDivision}
            playheadTick={playheadTick}
            onNotesChange={onNotesChange}
            selectedNoteIds={selectedNoteIds}
            onSelectedNotesChange={onSelectedNotesChange}
            isPlaying={isPlaying}
            onSeek={onSeek}
            theme="redesign"
          />
        </div>

        <HistoryPanel
          branchName={branchLabel}
          saveStatus={saveStatus}
          trackCount={tracks.length}
          noteCount={notes.length}
          vc={vc}
          onRequestRestore={openRestoreDialog}
        />
      </div>

      {/* ── Footer (mockup dòng 309–315) — chỉ số liệu THẬT ───── */}
      <footer style={styles.footer}>
        <span style={styles.footerItem}>
          <span
            style={{
              ...styles.footerDot,
              background:
                saveStatus === "saved" ? DC.success : saveStatus === "saving" ? DC.warning : DC.danger,
            }}
          />
          {saveStatus === "saved" ? "Đã lưu nháp" : saveStatus === "saving" ? "Đang lưu…" : "Chưa lưu"}
        </span>
        <span>
          BPM <strong style={styles.footerStrong}>{tempo}</strong>
        </span>
        <span>
          NHỊP <strong style={styles.footerStrong}>{timeSignature.join("/")}</strong>
        </span>
        <span style={{ marginLeft: "auto" }}>
          {notes.length} note · {tracks.length}/{maxTracks} track
        </span>
      </footer>

      {/* ── Hộp thoại Version Control ──────────────────────────── */}
      {commitOpen && (
        <CommitDialog
          snapshot={snapshot}
          headSnapshot={vc.headCommit?.snapshot ?? null}
          submitting={vc.committing}
          error={vc.commitError}
          onSubmit={(message) => void submitCommit(message)}
          onClose={() => setCommitOpen(false)}
        />
      )}

      {restoreTarget && (
        <RestoreDialog
          commit={restoreTarget}
          hasUnsavedChanges={saveStatus !== "saved"}
          submitting={vc.restoring}
          error={vc.restoreError}
          onConfirm={() => void confirmRestore()}
          onClose={() => setRestoreTarget(null)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: DC.pageBg,
    color: DC.text,
    overflow: "hidden",
  },
  header: {
    height: DC_SIZE.headerH,
    flexShrink: 0,
    background: DC.surface,
    borderBottom: `1px solid ${DC.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 20px",
    gap: 16,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  projectName: {
    fontWeight: 700,
    fontSize: 15,
    color: DC.text,
    maxWidth: 260,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  branchChip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: DC.pageBg,
    border: `1px solid ${DC.border}`,
    borderRadius: 8,
    padding: "7px 11px",
    flexShrink: 0,
  },
  branchName: { fontFamily: DC.mono, fontSize: 13, fontWeight: 600 },
  transport: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: DC.pageBg,
    border: `1px solid ${DC.border}`,
    borderRadius: 10,
    padding: 5,
    flexShrink: 0,
  },
  transportBtn: {
    display: "flex",
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    borderRadius: 7,
    background: "transparent",
    cursor: "pointer",
    padding: 0,
  },
  transportDivider: { width: 1, height: 20, background: DC.border, flexShrink: 0 },
  headerRight: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 },
  commitBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: DC.accent,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 15px",
    fontWeight: 600,
    fontSize: 13,
  },
  backBtn: {
    background: DC.surface,
    border: `1px solid ${DC.border}`,
    borderRadius: 8,
    padding: "9px 13px",
    fontWeight: 600,
    fontSize: 13,
    color: DC.text,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  toolStrip: {
    height: DC_SIZE.toolStripH,
    flexShrink: 0,
    background: DC.surface,
    borderBottom: `1px solid ${DC.border}`,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "0 20px",
    overflowX: "auto",
  },
  segment: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    background: DC.pageBg,
    border: `1px solid ${DC.border}`,
    borderRadius: 9,
    padding: 3,
    flexShrink: 0,
  },
  segmentBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: "none",
    borderRadius: 6,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  stripDivider: { width: 1, height: 22, background: DC.border, margin: "0 6px", flexShrink: 0 },
  stripLabel: {
    font: `700 10px ${DC.mono}`,
    letterSpacing: ".08em",
    color: DC.textMuted,
    flexShrink: 0,
  },
  ghostBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: DC.border,
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: DC.text,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  primaryGhostBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: DC.accentSoft,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: 8,
    padding: "6px 11px",
    fontSize: 12,
    fontWeight: 600,
    color: DC.accent,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  iconBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    background: "transparent",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: DC.border,
    borderRadius: 8,
    color: DC.text,
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
  },
  zoomValue: {
    font: `600 11px ${DC.mono}`,
    color: DC.textMuted,
    width: 40,
    textAlign: "center",
    flexShrink: 0,
  },
  masterVolumeGroup: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    flexShrink: 0,
  },
  masterVolumeSlider: {
    width: 72,
    accentColor: DC.accent,
    cursor: "pointer",
  },
  masterVolumeValue: {
    font: `600 11px ${DC.mono}`,
    color: DC.textMuted,
    width: 34,
    textAlign: "right",
    flexShrink: 0,
  },
  warning: {
    fontSize: 12,
    fontWeight: 600,
    color: DC.danger,
    background: DC.dangerSoft,
    border: `1px solid ${DC.dangerBorder}`,
    borderRadius: 7,
    padding: "5px 9px",
    flexShrink: 0,
  },
  body: { flex: 1, display: "flex", overflow: "hidden", minHeight: 0 },
  rollWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    background: DC.surface,
    overflow: "hidden",
  },
  footer: {
    height: DC_SIZE.footerH,
    flexShrink: 0,
    background: DC.surface,
    borderTop: `1px solid ${DC.border}`,
    display: "flex",
    alignItems: "center",
    gap: 22,
    padding: "0 18px",
    font: `500 11.5px ${DC.mono}`,
    color: DC.textMuted,
  },
  footerItem: { display: "flex", alignItems: "center", gap: 7 },
  footerDot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  footerStrong: { color: DC.text, fontWeight: 600 },
};
