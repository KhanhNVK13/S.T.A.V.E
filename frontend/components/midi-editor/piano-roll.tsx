/**
 * piano-roll.tsx
 * Canvas-based piano roll implementing:
 *   UC-25: Add note  — Pencil tool: mousedown → draw note
 *   UC-26: Edit note — Pointer tool: drag to move, drag right-edge to resize
 *   UC-27: Delete    — Eraser tool click OR right-click any note
 *   UC-32: Copy      — Ctrl+A select all, click/shift-click to select notes
 */
"use client";

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { DraftNote, DraftTrack } from "@stave/shared-types";
import type { ToolMode, GridDivision } from "./midi-toolbar";

// ── Constants ──────────────────────────────────────────────────
const PITCH_COUNT = 128;
const RESIZE_HANDLE_PX = 6; // px at right edge = resize zone

/**
 * Hình học + bảng màu theo biến thể UI.
 *
 * "classic" giữ nguyên đúng số liệu/màu đang chạy trên UI gốc — không được
 * đổi. "redesign" lấy từ mã nguồn thiết kế thật (docs/STAVE design component
 * sample/.../STAVE.dc.html, screen "editor" dòng 232–257: hàng 22px, cột phím
 * 72px, ruler 34px, note bo góc 4px viền #0F2A5C, playhead #B3242E).
 *
 * Chỉ phần VẼ đổi theo theme — toàn bộ hit-test/kéo-thả/chọn vùng bên dưới
 * dùng chung một bộ code, không nhân bản.
 */
const THEMES = {
  classic: {
    rowH: 14,
    keyW: 36,
    headerH: 24,
    noteRadius: 3,
    noteStroke: null as string | null,
    noteTopHighlight: false,
    keyBorder: null as string | null,
    containerBg: "#1e1e24",
    rowBlack: "#1a1a1f",
    rowWhite: "#1e1e24",
    cLine: "rgba(99,102,241,0.08)",
    rowSeparator: "#27272a",
    gridBar: "rgba(255,255,255,0.12)",
    gridBeat: "rgba(255,255,255,0.06)",
    gridStep: "rgba(255,255,255,0.025)",
    rulerBg: "#18181b",
    rulerText: "#52525b",
    keyBlack: "#1c1c22",
    keyWhite: "#2d2d35",
    keyText: "#71717a",
    drawingNote: "#a5b4fc",
    playhead: "#f43f5e",
    selectedBorder: "#ffffff",
    playingGlow: "rgba(255,255,255,0.4)",
    resizeHandle: "rgba(255,255,255,0.25)",
  },
  redesign: {
    rowH: 22,
    keyW: 72,
    headerH: 34,
    noteRadius: 4,
    noteStroke: "#0F2A5C" as string | null,
    noteTopHighlight: true,
    keyBorder: "#E3E4E8" as string | null,
    containerBg: "#ffffff",
    rowBlack: "#FAFAF8",
    rowWhite: "#ffffff",
    cLine: "rgba(29,78,216,0.05)",
    rowSeparator: "#F3F3F1",
    gridBar: "#E6E6E2",
    gridBeat: "#EDEDEA",
    gridStep: "#F5F5F3",
    rulerBg: "#FBFBF9",
    rulerText: "#8A8D93",
    keyBlack: "#E9E9E6",
    keyWhite: "#ffffff",
    keyText: "#8A8D93",
    drawingNote: "#1D4ED8",
    playhead: "#B3242E",
    selectedBorder: "#1F2126",
    playingGlow: "rgba(29,78,216,0.35)",
    resizeHandle: "rgba(255,255,255,0.35)",
  },
} as const;

export type PianoRollTheme = keyof typeof THEMES;

// Piano key helpers
const BLACK_NOTES = new Set([1, 3, 6, 8, 10]); // semitone % 12

function isBlackKey(pitch: number) {
  return BLACK_NOTES.has(pitch % 12);
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function pitchName(pitch: number) {
  return NOTE_NAMES[pitch % 12] + Math.floor(pitch / 12 - 1);
}

// ── Types ──────────────────────────────────────────────────────
export interface PianoRollHandle {
  /** Scroll canvas to make a given tick visible */
  scrollToTick: (tick: number) => void;
}

interface DragState {
  type: "move" | "resize" | "draw";
  noteId: string;
  startX: number;
  startY: number;
  origStart: number;
  origDuration: number;
  origPitch: number;
}

interface PianoRollProps {
  notes: DraftNote[];
  tracks: DraftTrack[];
  selectedTrackId: string | null;
  tool: ToolMode;
  zoom: number; // pixels per tick (base = 0.06)
  ppq: number;
  gridDivision: GridDivision;
  playheadTick: number;
  onNotesChange: (notes: DraftNote[]) => void;
  selectedNoteIds: Set<string>;
  onSelectedNotesChange: (ids: Set<string>) => void;
  // UC-37: Playback
  isPlaying: boolean;
  onSeek: (tick: number) => void;
  /** Chỉ ảnh hưởng phần vẽ (màu + hình học). Mặc định giữ đúng UI gốc. */
  theme?: PianoRollTheme;
}

export const PianoRoll = forwardRef<PianoRollHandle, PianoRollProps>(
  function PianoRoll(
    {
      notes,
      tracks,
      selectedTrackId,
      tool,
      zoom,
      ppq,
      gridDivision,
      playheadTick,
      onNotesChange,
      selectedNoteIds,
      onSelectedNotesChange,
      isPlaying,
      onSeek,
      theme = "classic",
    },
    ref,
  ) {
    const pal = THEMES[theme];
    const ROW_H = pal.rowH;
    const KEY_WIDTH = pal.keyW;
    const HEADER_H = pal.headerH;

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [scrollX, setScrollX] = useState(0);
    const [scrollY, setScrollY] = useState((128 - 72) * ROW_H); // start near C5
    const dragRef = useRef<DragState | null>(null);
    const drawNoteRef = useRef<DraftNote | null>(null); // note being drawn
    // Box selection state (UC-32)
    const boxSelectRef = useRef<{ startX: number; startY: number } | null>(null);
    const lastMouseRef = useRef<{ x: number; y: number } | null>(null);

    // px per tick
    const pxPerTick = 0.06 * zoom;
    // ticks per grid step
    const gridStep = ppq / (gridDivision / 4);
    // Snap a tick value to the nearest grid boundary
    const snapToGrid = useCallback(
      (tick: number) => Math.round(tick / gridStep) * gridStep,
      [gridStep],
    );
    // total canvas width (ticks) — 128 bars
    const totalTicks = ppq * 4 * 128;
    const totalWidth = totalTicks * pxPerTick + KEY_WIDTH;
    const totalHeight = PITCH_COUNT * ROW_H + HEADER_H;

    // Scroll imperative handle
    useImperativeHandle(ref, () => ({
      scrollToTick(tick: number) {
        const container = containerRef.current;
        if (!container) return;
        const x = KEY_WIDTH + tick * pxPerTick - container.clientWidth / 2;
        container.scrollLeft = Math.max(0, x);
      },
    }));

    // ── Hit-test: find note at canvas coords ──────────────────
    function hitNote(
      cx: number,
      cy: number,
    ): { note: DraftNote; zone: "body" | "resize" } | null {
      // cx/cy are in canvas coordinate space (0,0 = top-left of canvas)
      const pitch = PITCH_COUNT - 1 - Math.floor((cy - HEADER_H + scrollY) / ROW_H);
      if (pitch < 0 || pitch > 127) return null;

      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        const nx = KEY_WIDTH + n.start * pxPerTick - scrollX;
        const nw = Math.max(4, n.duration * pxPerTick);
        const ny = HEADER_H + (PITCH_COUNT - 1 - n.pitch) * ROW_H - scrollY;

        if (
          cx >= nx &&
          cx <= nx + nw &&
          cy >= ny &&
          cy <= ny + ROW_H
        ) {
          const zone: "body" | "resize" =
            cx >= nx + nw - RESIZE_HANDLE_PX ? "resize" : "body";
          return { note: n, zone };
        }
      }
      return null;
    }

    // ── Canvas rendering ───────────────────────────────────────
    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      // ── Background rows (per pitch) ──────────────────────────
      for (let p = 0; p < PITCH_COUNT; p++) {
        const y = HEADER_H + p * ROW_H - scrollY;
        if (y + ROW_H < 0 || y > H) continue;
        const pitch = PITCH_COUNT - 1 - p;
        const isBlack = isBlackKey(pitch);
        ctx.fillStyle = isBlack ? pal.rowBlack : pal.rowWhite;
        ctx.fillRect(KEY_WIDTH, y, W - KEY_WIDTH, ROW_H);
        // C line highlight
        if (pitch % 12 === 0) {
          ctx.fillStyle = pal.cLine;
          ctx.fillRect(KEY_WIDTH, y, W - KEY_WIDTH, ROW_H);
        }
        // Row separator
        ctx.strokeStyle = pal.rowSeparator;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(KEY_WIDTH, y + ROW_H);
        ctx.lineTo(W, y + ROW_H);
        ctx.stroke();
      }

      // ── Beat/bar vertical grid ───────────────────────────────
      const ticksPerBeat = ppq;
      const ticksPerBar = ppq * 4;
      const firstTick = scrollX / pxPerTick;
      const lastTick = (scrollX + W - KEY_WIDTH) / pxPerTick;

      // grid step lines
      let t = snapToGrid(firstTick);
      while (t <= lastTick) {
        const x = KEY_WIDTH + t * pxPerTick - scrollX;
        const isBeat = t % ticksPerBeat < 1;
        const isBar = t % ticksPerBar < 1;
        ctx.strokeStyle = isBar ? pal.gridBar : isBeat ? pal.gridBeat : pal.gridStep;
        ctx.lineWidth = isBar ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(x, HEADER_H);
        ctx.lineTo(x, H);
        ctx.stroke();
        t += gridStep;
      }

      // ── Ruler header ─────────────────────────────────────────
      ctx.fillStyle = pal.rulerBg;
      ctx.fillRect(KEY_WIDTH, 0, W - KEY_WIDTH, HEADER_H);

      let bar = Math.floor(firstTick / ticksPerBar);
      while (bar * ticksPerBar <= lastTick) {
        const x = KEY_WIDTH + bar * ticksPerBar * pxPerTick - scrollX;
        if (x >= KEY_WIDTH) {
          ctx.fillStyle = pal.rulerText;
          ctx.font = "10px monospace";
          ctx.fillText(`${bar + 1}`, x + 3, HEADER_H - 6);
        }
        bar++;
      }

      // ── Piano keys ───────────────────────────────────────────
      ctx.fillStyle = pal.rulerBg;
      ctx.fillRect(0, 0, KEY_WIDTH, H);

      for (let p = 0; p < PITCH_COUNT; p++) {
        const y = HEADER_H + p * ROW_H - scrollY;
        if (y + ROW_H < 0 || y > H) continue;
        const pitch = PITCH_COUNT - 1 - p;
        const isBlack = isBlackKey(pitch);

        ctx.fillStyle = isBlack ? pal.keyBlack : pal.keyWhite;
        ctx.fillRect(0, y, KEY_WIDTH - 1, ROW_H - 1);

        // Label C notes
        if (pitch % 12 === 0) {
          ctx.fillStyle = pal.keyText;
          ctx.font = "9px monospace";
          ctx.fillText(pitchName(pitch), 2, y + ROW_H - 3);
        }
      }

      // Đường viền ngăn cột phím với vùng lưới (mockup có, UI gốc không —
      // classic để null nên không vẽ, giữ nguyên hình cũ).
      if (pal.keyBorder) {
        ctx.strokeStyle = pal.keyBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(KEY_WIDTH - 0.5, 0);
        ctx.lineTo(KEY_WIDTH - 0.5, H);
        ctx.stroke();
      }

      // ── Notes ────────────────────────────────────────────────
      notes.forEach((n) => {
        const track = tracks.find((t) => t.id === n.trackId);
        const color = track?.color ?? "#6366f1";
        const nx = KEY_WIDTH + n.start * pxPerTick - scrollX;
        const nw = Math.max(4, n.duration * pxPerTick);
        const ny = HEADER_H + (PITCH_COUNT - 1 - n.pitch) * ROW_H - scrollY;

        if (nx + nw < KEY_WIDTH || nx > W || ny + ROW_H < HEADER_H || ny > H)
          return;

        const isSelected = selectedNoteIds.has(n.id);
        // UC-37: Check if note is currently playing (within playhead range)
        const isPlayingNote = isPlaying && n.start <= playheadTick && n.start + n.duration >= playheadTick;

        // Note body
        ctx.fillStyle = color;
        ctx.globalAlpha = track?.muted ? 0.3 : (isSelected || isPlayingNote) ? 1 : 0.85;
        roundRect(ctx, nx, ny + 1, nw - 1, ROW_H - 2, pal.noteRadius);
        ctx.fill();

        // Viền note theo mockup (redesign); classic để null nên bỏ qua.
        if (pal.noteStroke) {
          ctx.strokeStyle = pal.noteStroke;
          ctx.lineWidth = 1;
          roundRect(ctx, nx, ny + 1, nw - 1, ROW_H - 2, pal.noteRadius);
          ctx.stroke();
        }
        // Highlight mỏng ở cạnh trên (mockup: inset 0 1px 0 rgba(255,255,255,.18))
        if (pal.noteTopHighlight && nw > 4) {
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          ctx.fillRect(nx + 1.5, ny + 2, nw - 4, 1);
        }

        // Selected highlight border (UC-32)
        if (isSelected) {
          ctx.strokeStyle = pal.selectedBorder;
          ctx.lineWidth = 1.5;
          roundRect(ctx, nx, ny + 1, nw - 1, ROW_H - 2, pal.noteRadius);
          ctx.stroke();
        }

        // UC-37: Playing note glow effect
        if (isPlayingNote) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
          ctx.fillStyle = pal.playingGlow;
          roundRect(ctx, nx, ny + 1, nw - 1, ROW_H - 2, pal.noteRadius);
          ctx.fill();
          ctx.shadowBlur = 0;
        }


        // Resize handle highlight
        ctx.fillStyle = pal.resizeHandle;
        ctx.fillRect(nx + nw - RESIZE_HANDLE_PX, ny + 1, RESIZE_HANDLE_PX - 1, ROW_H - 2);

        ctx.globalAlpha = 1;
      });

      // ── In-progress draw note ────────────────────────────────
      if (drawNoteRef.current) {
        const n = drawNoteRef.current;
        const nx = KEY_WIDTH + n.start * pxPerTick - scrollX;
        const nw = Math.max(4, n.duration * pxPerTick);
        const ny = HEADER_H + (PITCH_COUNT - 1 - n.pitch) * ROW_H - scrollY;
        ctx.fillStyle = pal.drawingNote;
        ctx.globalAlpha = 0.7;
        roundRect(ctx, nx, ny + 1, nw - 1, ROW_H - 2, pal.noteRadius);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // ── Playhead ─────────────────────────────────────────────
      const phX = KEY_WIDTH + playheadTick * pxPerTick - scrollX;
      if (phX >= KEY_WIDTH && phX <= W) {
        ctx.strokeStyle = pal.playhead;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(phX, 0);
        ctx.lineTo(phX, H);
        ctx.stroke();
      }
      }, [notes, tracks, scrollX, scrollY, pxPerTick, gridStep, ppq, playheadTick, snapToGrid, selectedNoteIds, isPlaying, pal, ROW_H, KEY_WIDTH, HEADER_H]);

    // Re-draw whenever state changes
    useEffect(() => {
      draw();
    }, [draw]);

    // Resize observer
    useEffect(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const ro = new ResizeObserver(() => {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        draw();
      });
      ro.observe(container);
      return () => ro.disconnect();
    }, [draw]);

    // ── Mouse handlers ─────────────────────────────────────────
    function canvasCoords(e: React.MouseEvent<HTMLCanvasElement>) {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
    }

    function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
      const { cx, cy } = canvasCoords(e);

      // UC-37: Click on ruler to seek
      if (cy < HEADER_H) {
        const tick = Math.max(0, (cx - KEY_WIDTH + scrollX) / pxPerTick);
        onSeek(Math.floor(tick));
        return;
      }

      if (e.button === 2) {
        // Right-click → delete
        const hit = hitNote(cx, cy);
        if (hit) {
          onNotesChange(notes.filter((n) => n.id !== hit.note.id));
        }
        return;
      }

      if (tool === "eraser") {
        const hit = hitNote(cx, cy);
        if (hit) {
          onNotesChange(notes.filter((n) => n.id !== hit.note.id));
        }
        return;
      }

      if (tool === "pencil") {
        // Start drawing a new note
        const rawTick = (cx - KEY_WIDTH + scrollX) / pxPerTick;
        const tick = snapToGrid(rawTick);
        const pitch =
          PITCH_COUNT - 1 - Math.floor((cy - HEADER_H + scrollY) / ROW_H);
        if (pitch < 0 || pitch > 127) return;
        if (tick < 0) return;

        const trackId = selectedTrackId ?? tracks[0]?.id;
        if (!trackId) return;

        const newNote: DraftNote = {
          id: crypto.randomUUID(),
          trackId,
          pitch,
          start: tick,
          duration: gridStep,
          velocity: 80,
        };
        drawNoteRef.current = newNote;
        dragRef.current = {
          type: "draw",
          noteId: newNote.id,
          startX: cx,
          startY: cy,
          origStart: tick,
          origDuration: gridStep,
          origPitch: pitch,
        };
        draw();
        return;
      }

      // Pointer tool
      const hit = hitNote(cx, cy);
      if (!hit) {
        // UC-32: Start box selection if click on empty area
        boxSelectRef.current = { startX: cx, startY: cy };
        return;
      }

      // UC-32: Handle note selection
      if (e.shiftKey) {
        // Shift+click: add/remove from selection
        const newSet = new Set(selectedNoteIds);
        if (newSet.has(hit.note.id)) {
          newSet.delete(hit.note.id);
        } else {
          newSet.add(hit.note.id);
        }
        onSelectedNotesChange(newSet);
      } else if (!selectedNoteIds.has(hit.note.id)) {
        // Click on non-selected note: select only this note
        onSelectedNotesChange(new Set([hit.note.id]));
      }

      dragRef.current = {
        type: hit.zone === "resize" ? "resize" : "move",
        noteId: hit.note.id,
        startX: cx,
        startY: cy,
        origStart: hit.note.start,
        origDuration: hit.note.duration,
        origPitch: hit.note.pitch,
      };
    }

    function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
      const drag = dragRef.current;
      const { cx, cy } = canvasCoords(e);
      lastMouseRef.current = { x: cx, y: cy };

      if (!drag) {
        // Update cursor
        if (tool === "pointer") {
          const hit = hitNote(cx, cy);
          if (hit) {
            canvasRef.current!.style.cursor =
              hit.zone === "resize" ? "ew-resize" : "grab";
          } else {
            canvasRef.current!.style.cursor = boxSelectRef.current ? "crosshair" : "default";
          }
        }
        return;
      }

      const dx = cx - drag.startX;
      const dy = cy - drag.startY;

      if (drag.type === "draw") {
        const dn = drawNoteRef.current;
        if (!dn) return;
        const deltaTick = dx / pxPerTick;
        const newDuration = Math.max(gridStep, snapToGrid(drag.origDuration + deltaTick));
        drawNoteRef.current = { ...dn, duration: newDuration };
        draw();
        return;
      }

      if (drag.type === "move") {
        const deltaTick = dx / pxPerTick;
        const deltaPitch = -Math.round(dy / ROW_H);
        const newStart = Math.max(0, snapToGrid(drag.origStart + deltaTick));
        const newPitch = Math.max(0, Math.min(127, drag.origPitch + deltaPitch));
        onNotesChange(
          notes.map((n) =>
            n.id === drag.noteId
              ? { ...n, start: newStart, pitch: newPitch }
              : n,
          ),
        );
        return;
      }

      if (drag.type === "resize") {
        const deltaTick = dx / pxPerTick;
        const newDuration = Math.max(
          gridStep,
          snapToGrid(drag.origDuration + deltaTick),
        );
        onNotesChange(
          notes.map((n) =>
            n.id === drag.noteId ? { ...n, duration: newDuration } : n,
          ),
        );
        return;
      }
    }

    function handleMouseUp() {
      const drag = dragRef.current;
      const last = lastMouseRef.current;

      // UC-32: Commit box selection
      if (boxSelectRef.current && last) {
        const { startX, startY } = boxSelectRef.current;
        const cx = last.x;
        const cy = last.y;
        const minX = Math.min(startX, cx);
        const maxX = Math.max(startX, cx);
        const minY = Math.min(startY, cy);
        const maxY = Math.max(startY, cy);

        // Only commit if box has meaningful size (> 3px)
        if (maxX - minX > 3 || maxY - minY > 3) {
          const boxSelectedIds = new Set<string>();
          notes.forEach((n) => {
            const nx = KEY_WIDTH + n.start * pxPerTick - scrollX;
            const nw = Math.max(4, n.duration * pxPerTick);
            const ny = HEADER_H + (PITCH_COUNT - 1 - n.pitch) * ROW_H - scrollY;

            // Check if note overlaps with box
            if (nx + nw >= minX && nx <= maxX && ny + ROW_H >= minY && ny <= maxY) {
              boxSelectedIds.add(n.id);
            }
          });
          onSelectedNotesChange(boxSelectedIds);
        }
        boxSelectRef.current = null;
      }

      if (drag?.type === "draw" && drawNoteRef.current) {
        // Commit the drawn note
        onNotesChange([...notes, drawNoteRef.current]);
        drawNoteRef.current = null;
        draw();
      }
      dragRef.current = null;
    }

    // The canvas's own onMouseUp only fires when the release happens over
    // the canvas — dragging (or box-selecting) past its edge and releasing
    // outside leaves boxSelectRef/dragRef stuck "active" until the next
    // mousedown. Listening on window as well (mouseup bubbles there from
    // anywhere) guarantees handleMouseUp always runs to clear that state.
    const handleMouseUpRef = useRef(handleMouseUp);
    handleMouseUpRef.current = handleMouseUp;
    useEffect(() => {
      function onWindowMouseUp() {
        handleMouseUpRef.current();
      }
      window.addEventListener("mouseup", onWindowMouseUp);
      return () => window.removeEventListener("mouseup", onWindowMouseUp);
    }, []);

    // Scroll sync from container
    function handleScroll(e: React.UIEvent<HTMLDivElement>) {
      setScrollX(e.currentTarget.scrollLeft);
      setScrollY(e.currentTarget.scrollTop);
    }

    return (
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{ ...styles.container, background: pal.containerBg }}
      >
        {/* Virtual scroll area */}
        <div style={{ width: totalWidth, height: totalHeight, position: "relative" }}>
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              position: "sticky",
              top: 0,
              left: 0,
              cursor: tool === "pencil" ? "crosshair" : tool === "eraser" ? "cell" : "default",
            }}
          />
        </div>
      </div>
    );
  },
);

PianoRoll.displayName = "PianoRoll";

/* ── Helpers ──────────────────────────────────────────────── */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (w < r * 2) r = w / 2;
  if (h < r * 2) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    position: "relative",
  },
};
