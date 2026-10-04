/**
 * redesign/editor-redesign.tsx
 * MIDI Editor UI — dựng theo mockup thật
 * (docs/STAVE design component sample/.../STAVE.dc.html, screen "editor").
 * Bản UI gốc (cũ) đã bị xoá hoàn toàn — đây là UI duy nhất còn lại.
 *
 *   - header riêng 60px: branch + transport dạng segmented + Commit
 *   - tool strip riêng cho các công cụ soạn nhạc
 *   - body 3 cột: Tracks | Piano roll | Project History
 *   - footer 34px hiện thông số thật
 *
 * Toàn bộ state/handler nhận từ `MidiEditor`.
 */
"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  CircleHelp,
  ClipboardPaste,
  Copy,
  Download,
  Eraser,
  FileDown,
  FileMusic,
  GitBranch,
  GitCommitHorizontal,
  Lightbulb,
  Magnet,
  Mic,
  MousePointer2,
  Music,
  Pause,
  Pencil,
  MonitorSmartphone,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Repeat,
  Square,
  SquareCheck,
  Timer,
  Undo2,
  Redo2,
  Upload,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import type { DraftNote, DraftSnapshot, DraftTrack } from "@stave/shared-types";
import type { CommitWithAuthor, ResolvedCustomSound } from "../../../lib/api-client";
import type { GridDivision, ToolMode } from "../piano-roll";
import { PianoRoll } from "../piano-roll";
import type { PianoRollHandle } from "../piano-roll";
import { VelocityLane } from "../velocity-lane";
import { Modal } from "./modal";
import { ExportDialog } from "../export-dialog";
import { AudioSketchPanel } from "../../audio-sketch/audio-sketch-panel";
import type { AudioSketchState } from "../../audio-sketch/audio-sketch-panel";
import { ConfirmDialog } from "../../ui/confirm-dialog";
import { CustomSoundsPanel } from "../../custom-sound/custom-sounds-panel";
import { TrackPanel } from "./track-panel";
import { HistoryPanel } from "./history-panel";
import { CommitDialog } from "./commit-dialog";
import { RestoreDialog } from "./restore-dialog";
import { HelpDialog } from "./help-dialog";
import { isDialogOpen } from "../../../lib/use-dialog";
import { useVersionControl } from "./use-version-control";
import { summarizeChanges } from "./change-summary";
import type { SaveStatus } from "../midi-editor";
import { DC, DC_SIZE } from "./tokens";

const NARROW_QUERY = "(max-width: 767px)";
const TIP_KEY = "stave-editor-help-tip-dismissed";

const TOOLS: { id: ToolMode; label: string; Icon: typeof Pencil; title: string }[] = [
  { id: "pointer", label: "Select", Icon: MousePointer2, title: "Chọn & di chuyển note" },
  { id: "pencil", label: "Draw", Icon: Pencil, title: "Vẽ note mới" },
  { id: "eraser", label: "Erase", Icon: Eraser, title: "Xoá note" },
];

const GRIDS: { value: GridDivision; label: string }[] = [
  { value: 4, label: "1/4" },
  { value: 8, label: "1/8" },
  { value: 16, label: "1/16" },
  { value: 32, label: "1/32" },
];

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
  onSetTrackPan: (id: string, pan: number) => void;
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
  saveStatus: SaveStatus;
  saveRetryInSec: number | null;
  onRetrySave: () => void;
  /** Ghi ngay bản nháp xuống server (huỷ debounce) — chạy trước mỗi lần commit. */
  onFlushDraft: () => Promise<void>;
  /** UC-48: đọc bản nháp đang mở để gửi kèm khi chuyển nhánh. */
  onReadSnapshot: () => DraftSnapshot;
  /** Nạp lại editor theo snapshot backend trả về sau khi khôi phục (UC-46). */
  onSnapshotRestored: (snapshot: DraftSnapshot) => void;
  /** 0..1 — âm lượng chung cho TẤT CẢ track (chỉ ảnh hưởng lúc phát, không ghi vào snapshot). */
  masterVolume: number;
  onMasterVolumeChange: (v: number) => void;
  customSounds: Map<string, ResolvedCustomSound>;
  onSetSoundMapping: (trackId: string, pitch: number, soundId: string | null) => void;
  onCustomSoundsChanged: () => void;
  /** UC-36: Tempo (BPM) — ghi thẳng vào snapshot.meta.tempo. */
  onTempoChange: (bpm: number) => void;
  /** UC-36: Metronome click trong lúc phát. */
  metronomeOn: boolean;
  onMetronomeToggle: () => void;
  /** UC-37: Tốc độ nghe thử (preview) — không đổi tempo thật của project. */
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  /** UC-39: Xuất project ra file .mid */
  onExportMidi: () => void;
}

export function EditorRedesign(props: EditorRedesignProps) {
  const {
    projectId, projectName, snapshot, notes, tracks, tempo, timeSignature, ppq,
    tool, onToolChange, gridDivision, onGridChange, zoom, onZoomChange,
    selectedTrackId, onSelectTrack, selectedNoteIds, onSelectedNotesChange,
    onNotesChange, playheadTick, pianoRollRef,
    onAddTrack, onToggleMute, onToggleSolo, onDeleteTrack, onAssignInstrument,
    onSetTrackColor, onSetTrackLabel, onSetTrackVolume, onSetTrackPan, canAddTrack, maxTracks,
    trackLimitWarning,
    onQuantize, onImportMidi, onCopy, onPaste, onSelectAll, hasSelection, hasClipboard,
    onUndo, onRedo, canUndo, canRedo,
    isPlaying, isPaused, loopOn, onPlay, onPause, onStop, onToggleLoop, onSeek,
    saveStatus, saveRetryInSec, onRetrySave, onFlushDraft, onReadSnapshot, onSnapshotRestored,
    masterVolume, onMasterVolumeChange,
    customSounds, onSetSoundMapping, onCustomSoundsChanged,
    onTempoChange, metronomeOn, onMetronomeToggle,
    playbackRate, onPlaybackRateChange, onExportMidi,
  } = props;

  const canStop = isPlaying || isPaused;
  const [showExportAudio, setShowExportAudio] = useState(false);
  // UC-53: trigger theo SRS là "User selects 'Audio sketch' in the MIDI Editor".
  const [showAudioSketch, setShowAudioSketch] = useState(false);
  const [showSoundLibrary, setShowSoundLibrary] = useState(false);

  // ── Version Control (UC-42/43/44/46) ────────────────────────
  const vc = useVersionControl({
    projectId,
    flushDraft: onFlushDraft,
    readSnapshot: onReadSnapshot,
    onSnapshotRestored,
  });
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [sketchState, setSketchState] = useState<AudioSketchState>("idle");
  const [confirmCloseSketch, setConfirmCloseSketch] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<CommitWithAuthor | null>(null);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  // Dải velocity: mặc định HIỆN vì nó là cách duy nhất sửa được velocity
  // (kể cả velocity đọc từ file MIDI import vào). Cho phép ẩn để lấy lại
  // chiều cao khi màn hình thấp.
  const [velocityLaneOpen, setVelocityLaneOpen] = useState(true);
  // Piano roll là nơi duy nhất cuộn ngang; dải velocity chỉ bám theo giá trị
  // này để hai lưới thẳng cột.
  const [rollScrollX, setRollScrollX] = useState(0);
  const [trackPanelOpen, setTrackPanelOpen] = useState(
    () => typeof window === "undefined" || !window.matchMedia(NARROW_QUERY).matches,
  );
  const [historyPanelOpen, setHistoryPanelOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 1280,
  );
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [bpmDraft, setBpmDraft] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(NARROW_QUERY).matches,
  );
  const [narrowDismissed, setNarrowDismissed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tipVisible, setTipVisible] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(TIP_KEY) !== "1";
    } catch {
      return true;
    }
  });

  function dismissTip() {
    setTipVisible(false);
    try {
      window.localStorage.setItem(TIP_KEY, "1");
    } catch {}
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || isDialogOpen()) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      e.preventDefault();
      setHelpOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = () => setIsNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function commitBpm() {
    if (bpmDraft === null) return;
    const v = parseInt(bpmDraft, 10);
    if (!isNaN(v)) onTempoChange(Math.min(300, Math.max(20, v)));
    setBpmDraft(null);
  }

  function runFileAction(action: () => void) {
    setFileMenuOpen(false);
    action();
  }
  const branchLabel = vc.branch?.name ?? "main";
  const uncommittedCount = restoreTarget
    ? vc.headCommit
      ? summarizeChanges(vc.headCommit.snapshot, snapshot).total
      : snapshot.tracks.length + snapshot.notes.length
    : 0;
  const canCommit = vc.branch !== null && !vc.branchLoading;

  const { clearCommitError, clearRestoreError, clearSwitchError } = vc;

  // UC-48. Nhánh mới tạo ở trang tổng quan project chỉ mở được qua đây; danh
  // sách có đúng 1 nhánh thì không có gì để chuyển (backend cũng từ chối).
  const canSwitchBranch = vc.branches.length > 1 && !vc.switching;

  function toggleBranchMenu() {
    clearSwitchError();
    setBranchMenuOpen((open) => !open);
  }

  async function chooseBranch(branchId: string) {
    setBranchMenuOpen(false);
    await vc.switchTo(branchId);
  }

  function openCommitDialog() {
    clearCommitError();
    setCommitOpen(true);
  }

  async function submitCommit(message: string) {
    const ok = await vc.commit(message);
    if (ok) {
      setCommitOpen(false);
      setCommitMessage("");
    }
  }

  function requestCloseSketch() {
    if (sketchState === "reviewing") setConfirmCloseSketch(true);
    else closeSketch();
  }

  function closeSketch() {
    setConfirmCloseSketch(false);
    setSketchState("idle");
    setShowAudioSketch(false);
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
      {isNarrow && !narrowDismissed && (
        <div role="alert" style={styles.narrowNotice}>
          <MonitorSmartphone size={16} />
          <span>Trình soạn nhạc cần màn hình rộng hơn (máy tính hoặc tablet nằm ngang).</span>
          <button type="button" onClick={() => setNarrowDismissed(true)} style={styles.saveErrorBtn}>
            Vẫn tiếp tục
          </button>
        </div>
      )}

      {/* ── Header (mockup dòng 159–199) ───────────────────────── */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <Link
            href={`/projects/${projectId}`}
            title="Về trang dự án (lịch sử, nhánh, cài đặt)"
            aria-label="Về trang dự án"
            style={styles.backLink}
          >
            <ArrowLeft size={16} />
          </Link>
          <span style={styles.projectName} title={projectName}>
            {projectName}
          </span>
          {/* UC-48: chọn nhánh đang mở. Draft của nhánh cũ được backend lưu
              ngay trong lời gọi chuyển, nên không hỏi xác nhận. */}
          <div style={styles.branchWrap}>
            <button
              type="button"
              onClick={toggleBranchMenu}
              disabled={!canSwitchBranch}
              aria-haspopup="listbox"
              aria-expanded={branchMenuOpen}
              title={
                vc.switching
                  ? "Đang chuyển nhánh…"
                  : canSwitchBranch
                    ? "Đổi nhánh đang mở"
                    : "Project chỉ có 1 nhánh — tạo thêm ở trang tổng quan project"
              }
              style={{
                ...styles.branchChip,
                cursor: canSwitchBranch ? "pointer" : "default",
                opacity: vc.switching ? 0.6 : 1,
              }}
            >
              <GitBranch size={14} color={DC.accent} />
              <span style={styles.branchName}>{branchLabel}</span>
              {canSwitchBranch && <ChevronDown size={13} color={DC.textMuted} />}
            </button>

            {branchMenuOpen && (
              <>
                {/* Lớp trong suốt phủ toàn màn hình để bấm ra ngoài là đóng
                    menu — rẻ hơn và chắc chắn hơn nghe sự kiện trên document. */}
                <div
                  style={styles.branchBackdrop}
                  onClick={() => setBranchMenuOpen(false)}
                />
                <div style={styles.branchMenu} role="listbox">
                  {vc.branches.map((b) => {
                    const current = b.id === vc.branch?.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        role="option"
                        aria-selected={current}
                        onClick={() => void chooseBranch(b.id)}
                        style={{
                          ...styles.branchMenuItem,
                          background: current ? DC.accentSoft : "transparent",
                          fontWeight: current ? 700 : 500,
                        }}
                      >
                        <GitBranch
                          size={13}
                          color={current ? DC.accent : DC.textMuted}
                        />
                        <span style={styles.branchMenuName}>{b.name}</span>
                        {b.is_default && (
                          <span style={styles.branchMenuTag}>mặc định</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {vc.switchError && (
              <p role="alert" style={styles.branchError}>
                {vc.switchError}
              </p>
            )}
          </div>
        </div>

        {/* Transport — segmented control đúng mockup dòng 182–192 */}
        <div style={styles.transport}>
          <button
            onClick={onPlay}
            disabled={isPlaying}
            title={isPaused ? "Phát tiếp (Space)" : "Phát (Space)"}
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
            title="Tạm dừng (Space)"
            style={{
              ...styles.transportBtn,
              color: isPlaying ? DC.text : DC.borderSoft,
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
              color: canStop ? DC.text : DC.borderSoft,
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
          <button
            onClick={onMetronomeToggle}
            title={metronomeOn ? "Metronome: ĐANG BẬT" : "Metronome: đang tắt"}
            style={{
              ...styles.transportBtn,
              background: metronomeOn ? DC.accent : "transparent",
              color: metronomeOn ? "#fff" : DC.text,
            }}
          >
            <Timer size={15} />
          </button>
        </div>

        <div style={styles.headerRight}>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title="Trợ giúp: khái niệm và phím tắt (?)"
            aria-label="Help"
            style={styles.iconBtn}
          >
            <CircleHelp size={14} />
          </button>
          <button
            onClick={() => setTrackPanelOpen((open) => !open)}
            title={trackPanelOpen ? "Ẩn panel Tracks" : "Hiện panel Tracks"}
            aria-label="Tracks panel"
            aria-pressed={trackPanelOpen}
            style={styles.iconBtn}
          >
            {trackPanelOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          </button>
          <button
            onClick={() => setHistoryPanelOpen((open) => !open)}
            title={historyPanelOpen ? "Ẩn panel lịch sử" : "Hiện panel lịch sử"}
            aria-label="History panel"
            aria-pressed={historyPanelOpen}
            style={styles.iconBtn}
          >
            {historyPanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          </button>
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
              aria-label="Master volume"
              style={styles.masterVolumeSlider}
            />
            <span style={styles.masterVolumeValue}>{Math.round(masterVolume * 100)}%</span>
          </div>
          <button
            onClick={openCommitDialog}
            disabled={!canCommit}
            title={
              vc.branchError
                ? `Không tải được branch: ${vc.branchError}`
                : vc.branchLoading
                  ? "Đang tải thông tin branch…"
                  : "Ghi lại phiên bản hiện tại"
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
        </div>
      </header>

      {saveStatus === "error" && (
        <div role="alert" style={styles.saveErrorBar}>
          <span>
            <strong>Không lưu được bản nháp.</strong>{" "}
            {saveRetryInSec !== null
              ? `Sẽ tự thử lại sau ${saveRetryInSec} giây.`
              : "Đang thử lại…"}{" "}
            Đừng đóng trang cho tới khi thấy &quot;Đã lưu nháp&quot;.
          </span>
          <button type="button" onClick={onRetrySave} style={styles.saveErrorBtn}>
            Thử lại ngay
          </button>
        </div>
      )}

      {tipVisible && (
        <div role="note" style={styles.tipBar}>
          <Lightbulb size={15} color={DC.accent} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            Mới dùng STAVE? Bản nháp tự lưu; bấm <strong>Commit Changes</strong> để lưu thành
            một phiên bản có thể quay lại. Nhấn <kbd style={styles.tipKbd}>?</kbd> để xem khái
            niệm và phím tắt.
          </span>
          <button type="button" onClick={() => setHelpOpen(true)} style={styles.tipAction}>
            Xem trợ giúp
          </button>
          <button type="button" onClick={dismissTip} aria-label="Ẩn gợi ý" title="Ẩn gợi ý" style={styles.tipClose}>
            <X size={14} />
          </button>
        </div>
      )}

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
        <button onClick={onQuantize} title="Quantize toàn bộ note về lưới" style={styles.ghostBtn}>
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

        {/* Dải velocity — BR-27/BR-28. Report 3 chưa có UC riêng cho việc
            chỉnh velocity, xem ghi chú đầu file velocity-lane.tsx. */}
        <button
          onClick={() => setVelocityLaneOpen((open) => !open)}
          title={
            velocityLaneOpen
              ? "Ẩn dải velocity"
              : "Hiện dải velocity — kéo cột để đổi độ mạnh nhẹ của note"
          }
          aria-pressed={velocityLaneOpen}
          style={{
            ...styles.iconBtn,
            background: velocityLaneOpen ? DC.accentSoft : "transparent",
            color: velocityLaneOpen ? DC.accent : DC.text,
          }}
        >
          <BarChart3 size={14} />
        </button>

        <span style={styles.stripDivider} />

        {/* UC-36: Tempo (BPM) */}
        <div style={styles.bpmGroup} title="Tempo (BPM)">
          <span style={styles.stripLabel}>BPM</span>
          <input
            type="text"
            inputMode="numeric"
            aria-label="Tempo (BPM)"
            value={bpmDraft ?? String(tempo)}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setBpmDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            onBlur={commitBpm}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") setBpmDraft(null);
              else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                onTempoChange(Math.min(300, Math.max(20, tempo + (e.key === "ArrowUp" ? 1 : -1))));
              }
            }}
            style={styles.bpmInput}
          />
        </div>

        <span style={styles.stripDivider} />

        {/* UC-37: Playback speed (preview only, không đổi tempo thật) */}
        <div style={styles.bpmGroup} title="Tốc độ nghe thử — không đổi tempo thật của project">
          <span style={styles.stripLabel}>SPEED</span>
          <select
            aria-label="Playback speed"
            value={playbackRate}
            onChange={(e) => onPlaybackRateChange(Number(e.target.value))}
            style={styles.speedSelect}
          >
            {PLAYBACK_RATES.map((r) => (
              <option key={r} value={r}>{r}×</option>
            ))}
          </select>
        </div>

        <span style={styles.stripDivider} />

        <button onClick={onSelectAll} title="Chọn tất cả note (Ctrl+A)" aria-label="Select all" style={styles.iconBtn}>
          <SquareCheck size={14} />
        </button>
        <button
          onClick={onCopy}
          disabled={!hasSelection}
          title={hasSelection ? "Copy note đã chọn (Ctrl+C)" : "Chọn note trước đã"}
          aria-label="Copy"
          style={{ ...styles.iconBtn, opacity: hasSelection ? 1 : 0.4, cursor: hasSelection ? "pointer" : "not-allowed" }}
        >
          <Copy size={14} />
        </button>
        <button
          onClick={onPaste}
          disabled={!hasClipboard}
          title={hasClipboard ? "Dán note (Ctrl+V)" : "Chưa có gì để dán"}
          aria-label="Paste"
          style={{ ...styles.iconBtn, opacity: hasClipboard ? 1 : 0.4, cursor: hasClipboard ? "pointer" : "not-allowed" }}
        >
          <ClipboardPaste size={14} />
        </button>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title={canUndo ? "Hoàn tác (Ctrl+Z)" : "Không có gì để hoàn tác"}
          aria-label="Undo"
          style={{ ...styles.iconBtn, opacity: canUndo ? 1 : 0.4, cursor: canUndo ? "pointer" : "not-allowed" }}
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title={canRedo ? "Làm lại (Ctrl+Y / Ctrl+Shift+Z)" : "Không có gì để làm lại"}
          aria-label="Redo"
          style={{ ...styles.iconBtn, opacity: canRedo ? 1 : 0.4, cursor: canRedo ? "pointer" : "not-allowed" }}
        >
          <Redo2 size={14} />
        </button>

        <span style={{ flex: 1 }} />

        {trackLimitWarning && (
          <span style={styles.warning}>Tối đa {maxTracks} track</span>
        )}

        <div style={styles.fileMenuWrap}>
          <button
            type="button"
            onClick={() => setFileMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={fileMenuOpen}
            style={styles.ghostBtn}
          >
            <FileMusic size={14} />
            File
            <ChevronDown size={13} />
          </button>
          {fileMenuOpen && (
            <>
              <div style={styles.branchBackdrop} onClick={() => setFileMenuOpen(false)} />
              <div
                role="menu"
                style={styles.fileMenu}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setFileMenuOpen(false);
                }}
              >
                <button role="menuitem" autoFocus onClick={() => runFileAction(onImportMidi)} title="Nhập file MIDI" style={styles.fileMenuItem}>
                  <Upload size={14} /> Import MIDI
                </button>
                <button role="menuitem" onClick={() => runFileAction(onExportMidi)} title="Xuất project ra file .mid" style={styles.fileMenuItem}>
                  <FileDown size={14} /> Export MIDI
                </button>
                <button role="menuitem" onClick={() => runFileAction(() => setShowExportAudio(true))} title="Xuất âm thanh WAV" style={styles.fileMenuItem}>
                  <Download size={14} /> Export Audio
                </button>
                <button role="menuitem" onClick={() => runFileAction(() => setShowAudioSketch(true))} title="Ghi nhanh ý tưởng bằng micro" style={styles.fileMenuItem}>
                  <Mic size={14} /> Audio sketch
                </button>
                <button role="menuitem" onClick={() => runFileAction(() => setShowSoundLibrary(true))} title="Tải lên, ghi âm và quản lý âm thanh riêng" style={styles.fileMenuItem}>
                  <Music size={14} /> Custom sounds
                </button>
              </div>
            </>
          )}
        </div>

      </div>

      {/* ── Body 3 cột (mockup dòng 201–307) ───────────────────── */}
      <div style={styles.body}>
        {trackPanelOpen && (
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
            onSetTrackPan={onSetTrackPan}
            canAddTrack={canAddTrack}
            maxTracks={maxTracks}
          />
        )}

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
            onScrollXChange={setRollScrollX}
          />
          {velocityLaneOpen && (
            <VelocityLane
              notes={notes}
              tracks={tracks}
              scrollX={rollScrollX}
              zoom={zoom}
              selectedNoteIds={selectedNoteIds}
              onNotesChange={onNotesChange}
            />
          )}
        </div>

        {historyPanelOpen && (
          <HistoryPanel
            branchName={branchLabel}
            saveStatus={saveStatus}
            trackCount={tracks.length}
            noteCount={notes.length}
            vc={vc}
            onRequestRestore={openRestoreDialog}
          />
        )}
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
          {saveStatus === "saved"
            ? "Đã lưu nháp"
            : saveStatus === "saving"
              ? "Đang lưu…"
              : saveStatus === "error"
                ? "Không lưu được"
                : "Chưa lưu"}
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
          message={commitMessage}
          onMessageChange={setCommitMessage}
          onSubmit={(message) => void submitCommit(message)}
          onClose={() => setCommitOpen(false)}
        />
      )}

      {restoreTarget && (
        <RestoreDialog
          commit={restoreTarget}
          hasUnsavedChanges={saveStatus !== "saved"}
          uncommittedCount={uncommittedCount}
          submitting={vc.restoring}
          error={vc.restoreError}
          onConfirm={() => void confirmRestore()}
          onClose={() => setRestoreTarget(null)}
        />
      )}

      {/* UC-38: Export project audio dialog */}
      {showExportAudio && (
        <ExportDialog
          projectId={projectId}
          snapshot={snapshot}
          projectName={projectName}
          onClose={() => setShowExportAudio(false)}
        />
      )}

      {showAudioSketch && (
        <Modal
          title="Audio sketch"
          width={760}
          onClose={requestCloseSketch}
          closeDisabled={sketchState === "recording" || sketchState === "attaching"}
        >
          <AudioSketchPanel projectId={projectId} onStateChange={setSketchState} />
        </Modal>
      )}

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}

      <ConfirmDialog
        open={confirmCloseSketch}
        title="Bỏ bản ghi chưa đính kèm?"
        message="Bản ghi vừa thu chưa được đính kèm vào dự án. Đóng lúc này sẽ mất bản ghi và không lấy lại được."
        confirmLabel="Bỏ bản ghi"
        cancelLabel="Tiếp tục chỉnh"
        danger
        onConfirm={closeSketch}
        onCancel={() => setConfirmCloseSketch(false)}
      />

      {showSoundLibrary && (
        <Modal
          title="Custom sounds"
          width={560}
          onClose={() => setShowSoundLibrary(false)}
        >
          <CustomSoundsPanel
            key={selectedTrackId ?? "none"}
            track={tracks.find((t) => t.id === selectedTrackId) ?? null}
            defaultPitch={
              notes.find((n) => selectedNoteIds.has(n.id) && n.trackId === selectedTrackId)?.pitch ?? 60
            }
            customSounds={customSounds}
            onSetSoundMapping={onSetSoundMapping}
            onLibraryChange={onCustomSoundsChanged}
          />
        </Modal>
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
    // Là <button> nên phải ép lại màu/cỡ chữ: mặc định của trình duyệt là
    // font hệ thống nhỏ hơn, không phải font của app.
    color: DC.text,
    fontSize: 13,
  },
  branchName: { fontFamily: DC.mono, fontSize: 13, fontWeight: 600 },
  branchWrap: { position: "relative", flexShrink: 0 },
  branchBackdrop: { position: "fixed", inset: 0, zIndex: 40 },
  branchMenu: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    zIndex: 41,
    minWidth: 220,
    maxHeight: 280,
    overflowY: "auto",
    background: DC.surface,
    border: `1px solid ${DC.border}`,
    borderRadius: 8,
    padding: 4,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  branchMenuItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "7px 9px",
    border: "none",
    borderRadius: 6,
    color: DC.text,
    fontSize: 13,
    textAlign: "left",
    cursor: "pointer",
  },
  branchMenuName: {
    fontFamily: DC.mono,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  branchMenuTag: {
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: DC.textMuted,
    border: `1px solid ${DC.borderSoft}`,
    borderRadius: 999,
    padding: "1px 6px",
    flexShrink: 0,
  },
  branchError: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    zIndex: 41,
    margin: 0,
    minWidth: 220,
    maxWidth: 320,
    background: DC.dangerSoft,
    border: `1px solid ${DC.dangerBorder}`,
    color: DC.danger,
    borderRadius: 8,
    padding: "7px 10px",
    fontSize: 12,
  },
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
  toolStrip: {
    minHeight: DC_SIZE.toolStripH,
    flexShrink: 0,
    background: DC.surface,
    borderBottom: `1px solid ${DC.border}`,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 5,
    rowGap: 6,
    padding: "8px 16px",
  },
  backLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 8,
    border: `1px solid ${DC.border}`,
    color: DC.textMuted,
    flexShrink: 0,
  },
  fileMenuWrap: { position: "relative", flexShrink: 0 },
  fileMenu: {
    position: "absolute",
    right: 0,
    top: "calc(100% + 6px)",
    zIndex: 41,
    minWidth: 190,
    display: "flex",
    flexDirection: "column",
    padding: 4,
    background: DC.surface,
    border: `1px solid ${DC.border}`,
    borderRadius: 10,
    boxShadow: "0 12px 28px rgba(15, 42, 92, .14)",
  },
  fileMenuItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 7,
    border: "none",
    background: "transparent",
    color: DC.text,
    fontSize: 13,
    fontWeight: 500,
    textAlign: "left",
    cursor: "pointer",
  },
  tipBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 16px",
    background: DC.surface,
    borderBottom: `1px solid ${DC.border}`,
    color: DC.text,
    fontSize: 13,
    lineHeight: 1.5,
    flexShrink: 0,
  },
  tipKbd: {
    padding: "0 5px",
    border: `1px solid ${DC.border}`,
    borderRadius: 4,
    font: `600 12px ${DC.mono}`,
    background: DC.pageBg,
  },
  tipAction: {
    flexShrink: 0,
    padding: "4px 10px",
    borderRadius: 7,
    border: `1px solid ${DC.border}`,
    background: DC.surface,
    color: DC.accent,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  tipClose: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: DC.textMuted,
    cursor: "pointer",
  },
  narrowNotice: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 16px",
    background: DC.pageBg,
    borderBottom: `1px solid ${DC.border}`,
    color: DC.text,
    fontSize: 13,
    lineHeight: 1.5,
    flexShrink: 0,
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
  stripDivider: { width: 1, height: 22, background: DC.border, margin: "0 3px", flexShrink: 0 },
  stripLabel: {
    font: `700 11px ${DC.mono}`,
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
  bpmGroup: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  bpmInput: {
    width: 52,
    textAlign: "center",
    padding: "4px 6px",
    fontSize: 12,
    fontFamily: DC.mono,
    borderRadius: 6,
    border: `1px solid ${DC.border}`,
    background: DC.pageBg,
    color: DC.text,
  },
  speedSelect: {
    padding: "4px 6px",
    fontSize: 12,
    fontFamily: DC.mono,
    borderRadius: 6,
    border: `1px solid ${DC.border}`,
    background: DC.pageBg,
    color: DC.text,
    cursor: "pointer",
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
  saveErrorBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "8px 16px",
    background: DC.dangerSoft,
    borderBottom: `1px solid ${DC.dangerBorder}`,
    color: DC.danger,
    fontSize: 13,
    lineHeight: 1.5,
    flexShrink: 0,
  },
  saveErrorBtn: {
    flexShrink: 0,
    padding: "5px 12px",
    borderRadius: 7,
    border: `1px solid ${DC.dangerBorder}`,
    background: DC.surface,
    color: DC.danger,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  footerItem: { display: "flex", alignItems: "center", gap: 7 },
  footerDot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  footerStrong: { color: DC.text, fontWeight: 600 },
};
