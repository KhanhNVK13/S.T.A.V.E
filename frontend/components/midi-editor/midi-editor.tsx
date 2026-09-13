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
 * UC-37: Playback project
 * UC-42/43/44/46: Version Control (chỉ ở biến thể UI redesign — xem
 *   redesign/use-version-control.ts; UI gốc giữ nguyên, không có commit)
 */
"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { DRAFT_SCHEMA_VERSION } from "@stave/shared-types";
import type { DraftNote, DraftSnapshot, DraftTrack } from "@stave/shared-types";
import type { GridDivision, ToolMode } from "./midi-toolbar";
import { MidiToolbar } from "./midi-toolbar";
import { TrackList } from "./track-list";
import { PianoRoll } from "./piano-roll";
import type { PianoRollHandle } from "./piano-roll";
import { EditorRedesign } from "./redesign/editor-redesign";
import {
  getServerUiVariant,
  getUiVariant,
  setUiVariant,
  subscribeUiVariant,
} from "./redesign/ui-variant";
import { getDraft, putDraft } from "../../lib/api-client";
import { parseMidiBuffer } from "../../lib/midi-parser";
import { exportMidiFile } from "../../lib/midi-exporter";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { ExportDialog } from "./export-dialog";
import * as Tone from "tone";
import { scheduleNotes, disposeTrackVoice, type TrackVoice } from "../../lib/tone-synth-engine";

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
  const [isPaused, setIsPaused] = useState(false);
  const [trackLimitWarning, setTrackLimitWarning] = useState(false);
  // UC-32: Selected note IDs for copy
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  // UC-33: Clipboard for paste
  const [clipboard, setClipboard] = useState<DraftNote[] | null>(null);
  // UC-37: Playback state
  const [loopOn, setLoopOn] = useState(false);
  // UC-36: Metronome — click track played alongside notes during playback.
  const [metronomeOn, setMetronomeOn] = useState(false);
  // UC-37: Playback speed — a preview-only multiplier on scheduling time,
  // separate from the project's real tempo (snapshot.meta.tempo). Pitch is
  // unaffected either way since notes are triggered by MIDI pitch, not by
  // resampling audio, so this is a pure "listen faster/slower" aid, not a
  // data change — same reasoning as masterVolume below.
  const [playbackRate, setPlaybackRate] = useState(1);
  // Master volume — chỉnh âm lượng đồng bộ cho TẤT CẢ track cùng lúc, thay vì
  // phải chỉnh từng track riêng. CỐ Ý là control chỉ ảnh hưởng tới output lúc
  // phát (1 GainNode chung, xem startPlayback), KHÔNG ghi vào `track.volume`
  // của từng track — vì snapshot/commit schema (CLAUDE.md 4.2) đã khoá, thêm
  // field mới hoặc mutate hàng loạt `volume` của mọi track sẽ biến 1 thao tác
  // "nghe thử" thành thay đổi dữ liệu thật cần commit, không đúng ý người dùng.
  const [masterVolume, setMasterVolume] = useState(1); // 0..1, mặc định 100%
  // UC-29: track đang chờ xác nhận xoá — thay cho `window.confirm()` gốc của
  // trình duyệt bằng dialog trong app (components/ui/confirm-dialog.tsx).
  const [pendingDeleteTrack, setPendingDeleteTrack] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // UC-38: Export project audio dialog (classic UI only, xem CLAUDE.md
  // mục 5 — redesign vẫn thiếu 1 số UC, giữ đúng quy ước của các UC khác).
  const [showExportDialog, setShowExportDialog] = useState(false);
  // Biến thể giao diện — "classic" là UI gốc (mặc định), "redesign" là bản
  // dựng theo mockup. Nguồn lưu là localStorage, xem redesign/ui-variant.ts.
  const uiVariant = useSyncExternalStore(
    subscribeUiVariant,
    getUiVariant,
    getServerUiVariant,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pianoRollRef = useRef<PianoRollHandle>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tone.js voices (1 PolySynth+Panner per track that has notes to play in
  // this session) created fresh by startPlayback and disposed by stopAudio —
  // mirrors the old "fresh oscillators per Play" lifecycle, just with real
  // Tone.js instruments instead of bare OscillatorNodes (Report 3 §4.1/§4.2
  // specifies Tone.js for in-browser synthesis; the previous engine never
  // actually used it).
  const toneVoicesRef = useRef<TrackVoice[]>([]);
  // Master volume: 1 Tone.Gain chung, đứng giữa mọi panner và Tone.Limiter
  // (xem startPlayback) — chỉnh giá trị này chỉnh âm lượng output của TẤT CẢ
  // track cùng lúc, ngay cả khi đang phát (không cần dừng/phát lại).
  const masterGainRef = useRef<Tone.Gain | null>(null);
  // Chặn clipping khi nhiều note chồng nhau (từng gây rè/nhiễu với oscillator
  // thô cộng thẳng vào destination không giới hạn biên độ).
  const masterLimiterRef = useRef<Tone.Limiter | null>(null);
  const metroSynthRef = useRef<Tone.NoiseSynth | null>(null);
  // UC-37: Refs for playback closure access
  const loopOnRef = useRef(false);
  // Tick that a loop restart (and Stop-then-replay) returns to — set
  // whenever the user presses Play or seeks, not on the internal
  // loop-restart call in startPlayback.
  const loopAnchorRef = useRef(0);
  useEffect(() => {
    loopOnRef.current = loopOn;
  }, [loopOn]);
  // UC-36: ref so the metronome scheduler (a recursive setTimeout closure
  // started once per startPlayback call) can react to the toggle live,
  // instead of only taking effect on the next Play/loop-restart.
  const metronomeOnRef = useRef(false);
  useEffect(() => {
    metronomeOnRef.current = metronomeOn;
  }, [metronomeOn]);
  // UC-36: metronome's own lookahead-scheduler timer, cleared in stopAudio()
  // alongside the playback interval/AudioContext.
  const metronomeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Kéo slider master volume trong lúc đang phát phải nghe thấy thay đổi
  // ngay lập tức, không chỉ áp dụng cho lần Play tiếp theo.
  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = masterVolume;
    }
  }, [masterVolume]);
  // Always holds the latest snapshot so the unmount-flush below (a cleanup
  // closure, which only ever sees the snapshot from its own render) can save
  // the most recent edit instead of whatever was current when it was set up.
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  // ── Undo/Redo (Ctrl+Z / Ctrl+Shift+Z hoặc Ctrl+Y) ────────────
  // Mọi chỉnh sửa (note, track, quantize, paste...) đều đi qua updateSnapshot
  // bên dưới — đúng 1 điểm để ghi lịch sử, không cần sửa gì ở piano-roll.tsx.
  const undoStackRef = useRef<DraftSnapshot[]>([]);
  const redoStackRef = useRef<DraftSnapshot[]>([]);
  const HISTORY_LIMIT = 100;
  // Kéo/resize note bắn onNotesChange liên tục theo từng pixel chuột di
  // chuyển (piano-roll.tsx) — nếu ghi 1 điểm khôi phục cho MỖI lần gọi, 1 lần
  // Ctrl+Z chỉ lùi được vài pixel thay vì lùi nguyên thao tác kéo. Gộp mọi
  // lần gọi liên tiếp trong 1 khoảng lặng ngắn (không thao tác gì thêm) thành
  // đúng 1 điểm khôi phục duy nhất.
  const historyBurstActiveRef = useRef(false);
  const historyBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

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
      } else if (e.key === "z" || e.key === "Z") {
        // Ctrl+Z = undo; Ctrl+Shift+Z = redo (chuẩn Mac/Linux). Ctrl+Y ở dưới
        // phục vụ thói quen Windows.
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        handleRedo();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCopy, handlePaste, handleSelectAll, handleUndo, handleRedo, selectedTrackId, snapshot]);

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
    // Chỉ ghi 1 điểm khôi phục ở lần gọi ĐẦU của mỗi "đợt" thay đổi liên tiếp
    // (xem giải thích ở historyBurstActiveRef) — `snapshot` ở đây là giá trị
    // TRƯỚC khi áp dụng `next`, đúng là trạng thái cần lùi về.
    if (!historyBurstActiveRef.current) {
      undoStackRef.current.push(snapshot);
      if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift();
      redoStackRef.current = [];
      historyBurstActiveRef.current = true;
      setCanUndo(true);
      setCanRedo(false);
    }
    if (historyBurstTimerRef.current) clearTimeout(historyBurstTimerRef.current);
    historyBurstTimerRef.current = setTimeout(() => {
      historyBurstActiveRef.current = false;
    }, 500);

    setSnapshot(next);
    scheduleSave(next);
  }

  // ── Undo/Redo ─────────────────────────────────────────────────
  function handleUndo() {
    if (undoStackRef.current.length === 0) return;
    // Ctrl+Z giữa lúc đang có 1 "đợt" dở dang (VD nửa chừng kéo note) phải
    // lùi về checkpoint của đợt đó ngay, không chờ hết 500ms mới cho phép.
    if (historyBurstTimerRef.current) {
      clearTimeout(historyBurstTimerRef.current);
      historyBurstTimerRef.current = null;
    }
    historyBurstActiveRef.current = false;

    const previous = undoStackRef.current.pop()!;
    redoStackRef.current.push(snapshot);
    if (redoStackRef.current.length > HISTORY_LIMIT) redoStackRef.current.shift();

    setSnapshot(previous);
    scheduleSave(previous);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  }

  function handleRedo() {
    if (redoStackRef.current.length === 0) return;
    if (historyBurstTimerRef.current) {
      clearTimeout(historyBurstTimerRef.current);
      historyBurstTimerRef.current = null;
    }
    historyBurstActiveRef.current = false;

    const nextSnapshot = redoStackRef.current.pop()!;
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift();

    setSnapshot(nextSnapshot);
    scheduleSave(nextSnapshot);
    setCanRedo(redoStackRef.current.length > 0);
    setCanUndo(true);
  }

  // ── Version Control (UC-42/46) — 2 móc nối cho bản redesign ──
  /**
   * Ghi NGAY bản nháp xuống server và huỷ debounce đang chờ.
   * Bắt buộc chạy trước khi tạo commit: backend đọc snapshot từ bảng `drafts`
   * (xem `createCommit` trong lib/api-client.ts), nên thay đổi chưa kịp
   * autosave sẽ không có trong commit. Ném lỗi ra ngoài để nơi gọi dừng lại
   * thay vì commit nhầm bản cũ.
   */
  const flushDraft = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaveStatus("saving");
    try {
      await putDraft(projectId, snapshotRef.current);
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("unsaved");
      throw err;
    }
  }, [projectId]);

  /**
   * Nạp lại editor theo snapshot backend trả về sau khi khôi phục (UC-46).
   * Backend đã đặt draft của branch về đúng snapshot này trong cùng
   * transaction, nên KHÔNG gọi scheduleSave ở đây; ngược lại còn phải huỷ
   * autosave đang chờ vì nó mang snapshot CŨ và sẽ ghi đè ngược lại.
   */
  const applyRestoredSnapshot = useCallback((restored: DraftSnapshot) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    // Khôi phục về 1 commit cũ là một mốc mới, không phải tiếp nối các thay
    // đổi cục bộ trước đó — xoá sạch lịch sử undo/redo để tránh Ctrl+Z lùi
    // ngược qua cả điểm khôi phục, gây rối timeline.
    undoStackRef.current = [];
    redoStackRef.current = [];
    if (historyBurstTimerRef.current) {
      clearTimeout(historyBurstTimerRef.current);
      historyBurstTimerRef.current = null;
    }
    historyBurstActiveRef.current = false;
    setCanUndo(false);
    setCanRedo(false);
    setSnapshot(restored);
    snapshotRef.current = restored;
    setSelectedNoteIds(new Set());
    setSelectedTrackId((prev) =>
      prev && restored.tracks.some((t) => t.id === prev)
        ? prev
        : (restored.tracks[0]?.id ?? null),
    );
    setSaveStatus("saved");
  }, []);

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

  // Âm lượng track — trường `volume` vốn đã có trong snapshot và đã được
  // playback dùng (xem startPlayback), trước đây chưa có UI nào chỉnh. Bản
  // redesign hiện thanh VOL theo mockup nên cần handler này.
  function handleSetTrackVolume(id: string, volume: number) {
    const clamped = Math.min(1, Math.max(0, volume));
    updateSnapshot({
      ...snapshot,
      tracks: snapshot.tracks.map((t) =>
        t.id === id ? { ...t, volume: clamped } : t,
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
  // Xoá track KHÔNG còn bị chặn khi chỉ còn 1 track (BR-30 cũ đã bỏ theo yêu
  // cầu người dùng) — cả 2 UI đã có empty-state "chưa có track nào" sẵn để
  // xử lý đúng trường hợp 0 track.
  function handleDeleteTrack(id: string) {
    const trackName = snapshot.tracks.find((t) => t.id === id)?.name ?? "track này";
    // Mở dialog xác nhận trong app thay vì `window.confirm()` — xoá thật xảy
    // ra ở confirmDeleteTrack() khi người dùng bấm nút xác nhận.
    setPendingDeleteTrack({ id, name: trackName });
  }

  function confirmDeleteTrack() {
    if (!pendingDeleteTrack) return;
    const { id } = pendingDeleteTrack;

    updateSnapshot({
      ...snapshot,
      tracks: snapshot.tracks.filter((t) => t.id !== id),
      notes: snapshot.notes.filter((n) => n.trackId !== id),
    });
    if (selectedTrackId === id) {
      // Select the first remaining track (null nếu vừa xoá track cuối cùng)
      const remaining = snapshot.tracks.filter((t) => t.id !== id);
      setSelectedTrackId(remaining[0]?.id ?? null);
    }
    setPendingDeleteTrack(null);
  }

  function cancelDeleteTrack() {
    setPendingDeleteTrack(null);
  }

  // Master volume — chỉnh 1 lần cho toàn bộ track (xem masterGainRef/effect
  // ở trên); chỉ ảnh hưởng output lúc phát, không ghi vào snapshot.
  function handleMasterVolumeChange(volume: number) {
    setMasterVolume(Math.min(1, Math.max(0, volume)));
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

  // ── UC-39: Export MIDI file ─────────────────────────────────
  function handleExportMidi() {
    const bytes = exportMidiFile(snapshot);
    // Uint8Array isn't a valid BlobPart type on its own in the current DOM
    // lib types — wrap the backing ArrayBuffer instead.
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/[^a-z0-9_\-. ]/gi, "_")}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  // ── Playback (UC-37: instrument, solo, volume, pan, loop, seek) ──────────
  // A single startPlayback(fromTick) drives every entry point (Play, Seek,
  // and the loop-restart at end-of-song) so the auto-stop/loop condition
  // lives in exactly one place — a prior version duplicated this whole
  // function for the loop-restart path, and the copy silently dropped the
  // auto-stop/loop check, so playback ran forever in silence after the
  // first loop or after seeking mid-playback.
  function stopAudio() {
    for (const voice of toneVoicesRef.current) {
      disposeTrackVoice(voice);
    }
    toneVoicesRef.current = [];
    if (metroSynthRef.current) {
      metroSynthRef.current.dispose();
      metroSynthRef.current = null;
    }
    if (masterGainRef.current) {
      masterGainRef.current.dispose();
      masterGainRef.current = null;
    }
    if (masterLimiterRef.current) {
      masterLimiterRef.current.dispose();
      masterLimiterRef.current = null;
    }
    if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
    if (metronomeTimerRef.current) {
      clearTimeout(metronomeTimerRef.current);
      metronomeTimerRef.current = null;
    }
  }

  // ── UC-36: Metronome ──────────────────────────────────────────
  // Same lookahead-scheduler pattern as before (wakes up every
  // SCHEDULE_INTERVAL_MS, queues any click within the next LOOKAHEAD_SEC of
  // Tone's audio clock), just triggering a Tone.NoiseSynth instead of a
  // hand-built noise buffer.
  //
  // `fromTick` anchors the beat count to the song's own tick 0, not to
  // whenever Play was pressed — starting mid-bar still puts the accent
  // click on the correct beat instead of always treating the first click
  // as beat 1. `metronomeOnRef` is read on every scheduled beat (not just
  // once at the top) so toggling Metronome mid-playback takes effect
  // immediately without restarting playback, and downbeat/beat-time math
  // keeps running underneath even while muted so turning it back on
  // doesn't jump out of alignment.
  function scheduleMetronome(startTime: number, fromTick: number) {
    const LOOKAHEAD_SEC = 0.1;
    const SCHEDULE_INTERVAL_MS = 50;
    // Preview speed only — never the value written back to the project.
    const bpm = snapshot.meta.tempo * playbackRate;
    const ppq = snapshot.meta.ppq;
    const secPerBeat = 60 / bpm;
    // Beats per bar — assumes a quarter-note beat (matches how `ppq`/tick
    // math is used everywhere else in this file); compound meters like 6/8
    // would need a different beat unit, out of scope here.
    const beatsPerBar = Math.max(1, snapshot.meta.timeSignature[0] ?? 4);

    const noiseSynth = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
    }).toDestination();
    metroSynthRef.current = noiseSynth;

    let nextBeatIndex = Math.round(fromTick / ppq);
    let nextBeatTime = startTime;

    function scheduleBeat() {
      const now = Tone.now();
      while (nextBeatTime < now + LOOKAHEAD_SEC) {
        if (metronomeOnRef.current) {
          const isDownbeat = nextBeatIndex % beatsPerBar === 0;
          noiseSynth.triggerAttackRelease(0.03, nextBeatTime, isDownbeat ? 0.8 : 0.4);
        }

        nextBeatTime += secPerBeat;
        nextBeatIndex += 1;
      }
      metronomeTimerRef.current = setTimeout(scheduleBeat, SCHEDULE_INTERVAL_MS);
    }

    scheduleBeat();
  }

  async function startPlayback(fromTick: number) {
    stopAudio();
    setIsPlaying(true);
    setIsPaused(false);

    // Tone.js requires the shared AudioContext to be resumed from a user
    // gesture — the click that reached here (Play/Seek/Loop toggle) counts.
    await Tone.start();

    // Preview speed only — never the value written back to the project
    // (see playbackRate declaration above).
    const bpm = snapshot.meta.tempo * playbackRate;
    const ppq = snapshot.meta.ppq;
    const startTime = Tone.now();

    // Master bus: Gain (master volume, live-adjustable — see the effect
    // above) → Limiter → speakers. The limiter is what actually fixes the
    // buzzing/clipping from dense passages: before, every note's Gain
    // summed straight into the destination with nothing capping the total,
    // so overlapping notes could push well past 0 dBFS and hard-clip.
    const limiter = new Tone.Limiter(-1).toDestination();
    const masterGain = new Tone.Gain(masterVolume).connect(limiter);
    masterGainRef.current = masterGain;
    masterLimiterRef.current = limiter;

    // UC-36: Metronome scheduler — runs independently of note playback so
    // it keeps clicking even through silence.
    scheduleMetronome(startTime, fromTick);

    const allNotes = snapshot.notes;
    // UC-37: End tick for auto-stop/loop — end of the last note, or the
    // start position itself when there's nothing to play.
    const endTick = allNotes.length > 0
      ? Math.max(...allNotes.map((n) => n.start + n.duration))
      : fromTick;

    // UC-37: Schedule all notes — instrument (oscillator type), mute/solo,
    // volume, pan all handled by the shared Tone.js engine (also used by
    // UC-38 export, so exported audio matches what Play actually sounds
    // like).
    toneVoicesRef.current = scheduleNotes({
      notes: allNotes,
      tracks: snapshot.tracks,
      ppq,
      bpm,
      startTime,
      fromTick,
      toTick: null,
      destination: masterGain,
    });

    // UC-37: Animate playhead with loop/auto-stop support
    const ticksPerMs = (bpm * ppq) / 60000;
    playTimerRef.current = setInterval(() => {
      const elapsed = (Tone.now() - startTime) * 1000;
      const currentTick = Math.floor(fromTick + elapsed * ticksPerMs);

      if (currentTick >= endTick) {
        if (loopOnRef.current) {
          // Loop back to wherever this playback session was started from
          // (the tick Play or Seek was last invoked with).
          void startPlayback(loopAnchorRef.current);
        } else {
          handleStop();
        }
        return;
      }

      setPlayheadTick(currentTick);
    }, 16);
  }

  function handlePlay() {
    if (isPlaying) return;
    loopAnchorRef.current = playheadTick;
    void startPlayback(playheadTick);
  }

  function handleStop() {
    setIsPlaying(false);
    setIsPaused(false);
    stopAudio();
    setPlayheadTick(0);
  }

  function handlePause() {
    if (!isPlaying) return;
    setIsPlaying(false);
    setIsPaused(true);
    stopAudio();
    // Keep playhead at current position
  }

  function handleToggleLoop() {
    setLoopOn((prev) => !prev);
  }

  // ── UC-36: Metronome + Tempo ──────────────────────────────────
  function handleToggleMetronome() {
    setMetronomeOn((prev) => !prev);
  }

  function handleTempoChange(bpm: number) {
    updateSnapshot({ ...snapshot, meta: { ...snapshot.meta, tempo: bpm } });
  }

  // UC-37: Preview playback speed — takes effect on the next Play/Seek
  // (same as tempo/loop-region changes), not live mid-note.
  function handlePlaybackRateChange(rate: number) {
    setPlaybackRate(rate);
  }

  function handleSeek(tick: number) {
    setPlayheadTick(tick);
    // If currently playing, restart from new position
    if (isPlaying) {
      loopAnchorRef.current = tick;
      void startPlayback(tick);
    }
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

  // Bản UI thứ 2 — dựng theo mockup thiết kế. Dùng CHUNG toàn bộ state/handler
  // ở trên với UI gốc (không tự fetch, không giữ state riêng) nên chuyển qua
  // lại không mất thay đổi đang soạn. UI gốc bên dưới giữ nguyên như cũ.
  if (uiVariant === "redesign") {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mid,.midi"
          style={{ display: "none" }}
          onChange={(e) => void handleFileChange(e)}
        />
        <EditorRedesign
          projectId={projectId}
          projectName={projectName}
          snapshot={snapshot}
          notes={snapshot.notes}
          tracks={snapshot.tracks}
          tempo={snapshot.meta.tempo}
          timeSignature={snapshot.meta.timeSignature}
          ppq={snapshot.meta.ppq}
          tool={tool}
          onToolChange={setTool}
          gridDivision={gridDivision}
          onGridChange={setGridDivision}
          zoom={zoom}
          onZoomChange={setZoom}
          selectedTrackId={selectedTrackId}
          onSelectTrack={setSelectedTrackId}
          selectedNoteIds={selectedNoteIds}
          onSelectedNotesChange={setSelectedNoteIds}
          onNotesChange={handleNotesChange}
          playheadTick={playheadTick}
          pianoRollRef={pianoRollRef}
          onAddTrack={handleAddTrack}
          onToggleMute={handleToggleMute}
          onToggleSolo={handleToggleSolo}
          onDeleteTrack={handleDeleteTrack}
          onAssignInstrument={handleAssignInstrument}
          onSetTrackColor={handleSetTrackColor}
          onSetTrackLabel={handleSetTrackLabel}
          onSetTrackVolume={handleSetTrackVolume}
          canAddTrack={snapshot.tracks.length < MAX_TRACKS}
          maxTracks={MAX_TRACKS}
          trackLimitWarning={trackLimitWarning}
          onQuantize={handleQuantize}
          onImportMidi={handleImportMidi}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onSelectAll={handleSelectAll}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          hasSelection={selectedNoteIds.size > 0}
          hasClipboard={clipboard !== null}
          isPlaying={isPlaying}
          isPaused={isPaused}
          loopOn={loopOn}
          onPlay={handlePlay}
          onPause={handlePause}
          onStop={handleStop}
          onToggleLoop={handleToggleLoop}
          onSeek={handleSeek}
          saveStatus={saveStatus}
          onFlushDraft={flushDraft}
          onSnapshotRestored={applyRestoredSnapshot}
          onBackToClassic={() => setUiVariant("classic")}
          masterVolume={masterVolume}
          onMasterVolumeChange={handleMasterVolumeChange}
        />
        <ConfirmDialog
          open={pendingDeleteTrack !== null}
          title="Xoá track?"
          message={
            <>
              Xoá track <strong>&quot;{pendingDeleteTrack?.name}&quot;</strong>?
              <br />
              Toàn bộ note trong track này cũng sẽ bị xoá. Không thể hoàn tác.
            </>
          }
          confirmLabel="Xoá track"
          danger
          onConfirm={confirmDeleteTrack}
          onCancel={cancelDeleteTrack}
        />
      </>
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
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onPause={handlePause}
        onToggleLoop={handleToggleLoop}
        isPlaying={isPlaying}
        isPaused={isPaused}
        loopOn={loopOn}
        projectName={projectName}
        hasSelection={selectedNoteIds.size > 0}
        hasClipboard={clipboard !== null}
        onOpenRedesign={() => setUiVariant("redesign")}
        masterVolume={masterVolume}
        onMasterVolumeChange={handleMasterVolumeChange}
        tempo={snapshot.meta.tempo}
        onTempoChange={handleTempoChange}
        metronomeOn={metronomeOn}
        onMetronomeToggle={handleToggleMetronome}
        onExportAudio={() => setShowExportDialog(true)}
        onExportMidi={handleExportMidi}
        playbackRate={playbackRate}
        onPlaybackRateChange={handlePlaybackRateChange}
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
          onSetTrackVolume={handleSetTrackVolume}
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
          isPlaying={isPlaying}
          onSeek={handleSeek}
        />
      </div>

      {/* UC-38: Export project audio dialog */}
      {showExportDialog && (
        <ExportDialog
          snapshot={snapshot}
          projectName={projectName}
          onClose={() => setShowExportDialog(false)}
        />
      )}

      <ConfirmDialog
        open={pendingDeleteTrack !== null}
        title="Delete track?"
        message={
          <>
            Delete track &quot;{pendingDeleteTrack?.name}&quot;?
            <br />
            This will also delete all notes in this track. This action cannot be undone.
          </>
        }
        confirmLabel="Delete track"
        danger
        onConfirm={confirmDeleteTrack}
        onCancel={cancelDeleteTrack}
      />
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
