/**
 * velocity-lane.tsx
 * Dải chỉnh VELOCITY nằm ngay dưới piano roll: mỗi note là 1 cột, cao thấp
 * theo velocity; kéo cột lên/xuống để đổi độ mạnh nhẹ của note.
 *
 * ĐỐI CHIẾU TÀI LIỆU (bắt buộc trước khi làm tính năng — xem PROJECT_STATE):
 * Report 3 KHÔNG có use case nào cho việc chỉnh velocity. UC-26 (Edit note)
 * chỉ nói tới pitch/timing/length. Nhưng 2 business rule lại mặc định là có:
 *   - BR-27: "a note must have ... a velocity between 1 and 127".
 *   - BR-28: "Any operation that changes an existing note in place — moving,
 *     resizing, quantising, or **adjusting its velocity** — keeps the note's
 *     identifier".
 * Tức đây là lỗ hổng trong danh sách UC chứ không phải chức năng bị loại bỏ
 * (note import từ file MIDI mang velocity thật, không có dải này thì vĩnh
 * viễn không sửa được). Màn hình này hiện thực đúng 2 rule trên; cần bổ sung
 * 1 UC vào Report 3 — xem ghi chú ở PROJECT_STATE.
 *
 * Dải KHÔNG có thanh cuộn ngang riêng: nó bám theo `scrollX` mà piano roll
 * báo ra, để hai lưới luôn thẳng cột với nhau. Cuộn ngang vẫn làm ở piano roll.
 */
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DraftNote, DraftTrack } from "@stave/shared-types";
import { resolveCssColors } from "../../lib/resolve-css-colors";
import { PIANO_ROLL_KEY_WIDTH, pxPerTickFor } from "./piano-roll";

/** Chiều cao cả dải, kể cả vạch chia. Đủ để phân biệt 127 mức mà không lấn piano roll. */
export const VELOCITY_LANE_HEIGHT = 104;

/** BR-27: velocity hợp lệ là 1..127 (0 nghĩa là note off trong MIDI). */
const VELOCITY_MIN = 1;
const VELOCITY_MAX = 127;

/** Chừa mép trên/dưới để cột velocity 127 không dính sát viền. */
const PAD_TOP = 10;
const PAD_BOTTOM = 8;

/** Bề rộng tối đa của 1 cột — note dài không được vẽ thành mảng lớn che note sau. */
const BAR_MAX_W = 13;
const BAR_MIN_W = 3;

const LANE_COLOR_SPEC = {
  bg: "var(--surface)",
  border: "var(--border)",
  gridLine: "color-mix(in oklab, var(--border) 45%, var(--surface))",
  axisText: "var(--muted-foreground)",
  labelBg: "var(--surface-subtle)",
  selectedBorder: "var(--foreground)",
} as const;

function clampVelocity(v: number): number {
  return Math.max(VELOCITY_MIN, Math.min(VELOCITY_MAX, Math.round(v)));
}

interface VelocityLaneProps {
  notes: DraftNote[];
  tracks: DraftTrack[];
  /** Vị trí cuộn ngang của piano roll — dải này chỉ bám theo, không tự cuộn. */
  scrollX: number;
  zoom: number;
  selectedNoteIds: Set<string>;
  onNotesChange: (notes: DraftNote[]) => void;
  /** Chỉ đọc khi người xem không có quyền sửa (chưa dùng — để sẵn cho collaborator view-only). */
  readOnly?: boolean;
}

export function VelocityLane({
  notes,
  tracks,
  scrollX,
  zoom,
  selectedNoteIds,
  onNotesChange,
  readOnly = false,
}: VelocityLaneProps) {
  // Canvas không parse được var()/color-mix() — phải resolve trước, và theo dõi
  // `data-theme` để vẽ lại khi người dùng đổi theme (UC-78). Gán thẳng biểu
  // thức CSS thì canvas im lặng giữ màu cũ (xem CLAUDE.md 4.7).
  const [colors, setColors] = useState(() => resolveCssColors(LANE_COLOR_SPEC));
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setColors(resolveCssColors(LANE_COLOR_SPEC));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const pxPerTick = pxPerTickFor(zoom);
  const KEY_W = PIANO_ROLL_KEY_WIDTH;

  /**
   * Velocity của mọi note đang bị kéo, chụp tại lúc bấm chuột. Cần bản gốc vì
   * các note còn lại trong vùng chọn dịch theo ĐỘ LỆCH của note đang cầm —
   * cộng dồn trên giá trị đang thay đổi sẽ làm sai lệch tăng dần theo từng
   * mousemove và phá vỡ đường cong to-nhỏ người dùng đã dựng.
   */
  const dragRef = useRef<{
    noteId: string;
    originalVelocities: Map<string, number>;
  } | null>(null);

  const trackColors = useMemo(() => {
    const map = new Map<string, string>();
    tracks.forEach((t) => map.set(t.id, t.color));
    return map;
  }, [tracks]);

  /** Toạ độ + kích thước cột của 1 note trong hệ toạ độ canvas. */
  const barRect = useCallback(
    (note: DraftNote, laneH: number) => {
      const x = KEY_W + note.start * pxPerTick - scrollX;
      const noteW = note.duration * pxPerTick;
      const w = Math.max(BAR_MIN_W, Math.min(noteW - 1, BAR_MAX_W));
      const usableH = laneH - PAD_TOP - PAD_BOTTOM;
      const h = (note.velocity / VELOCITY_MAX) * usableH;
      return { x, w, y: laneH - PAD_BOTTOM - h, h };
    },
    [KEY_W, pxPerTick, scrollX],
  );

  /** Đổi vị trí chuột theo trục Y thành velocity. */
  const velocityFromY = useCallback((cy: number, laneH: number) => {
    const usableH = laneH - PAD_TOP - PAD_BOTTOM;
    const ratio = (laneH - PAD_BOTTOM - cy) / usableH;
    return clampVelocity(ratio * VELOCITY_MAX);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    // ── Cột nhãn bên trái, thẳng hàng với cột phím của piano roll ──
    ctx.fillStyle = colors.labelBg;
    ctx.fillRect(0, 0, KEY_W, H);
    ctx.fillStyle = colors.axisText;
    ctx.font = "9px monospace";
    ctx.fillText("VELOCITY", 6, 13);

    // ── Vạch chia ngang tại 127 / 64 / 1 ───────────────────────
    const usableH = H - PAD_TOP - PAD_BOTTOM;
    for (const level of [VELOCITY_MAX, 64, VELOCITY_MIN]) {
      const y = H - PAD_BOTTOM - (level / VELOCITY_MAX) * usableH;
      ctx.strokeStyle = colors.gridLine;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(KEY_W, y + 0.5);
      ctx.lineTo(W, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = colors.axisText;
      ctx.fillText(String(level), 6, y + 3);
    }

    // ── Cột velocity của từng note ─────────────────────────────
    notes.forEach((n) => {
      const { x, w, y, h } = barRect(n, H);
      if (x + w < KEY_W || x > W) return;

      const track = tracks.find((t) => t.id === n.trackId);
      ctx.globalAlpha = track?.muted ? 0.3 : 0.9;
      ctx.fillStyle = trackColors.get(n.trackId) ?? "#6366f1";
      ctx.fillRect(x, y, w, h);

      if (selectedNoteIds.has(n.id)) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colors.selectedBorder;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
      ctx.globalAlpha = 1;
    });

    // Viền ngăn cột nhãn với vùng vẽ — vẽ SAU các cột để cột không đè lên.
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(KEY_W - 0.5, 0);
    ctx.lineTo(KEY_W - 0.5, H);
    ctx.stroke();
  }, [notes, tracks, trackColors, selectedNoteIds, colors, barRect, KEY_W]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ro = new ResizeObserver(() => {
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
      draw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  // ── Tương tác ───────────────────────────────────────────────
  function coords(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
  }

  /** Note có cột nằm dưới con trỏ. Duyệt ngược để lấy cột vẽ trên cùng. */
  function hitBar(cx: number, cy: number, laneH: number): DraftNote | null {
    if (cx < PIANO_ROLL_KEY_WIDTH) return null;
    for (let i = notes.length - 1; i >= 0; i--) {
      const { x, w } = barRect(notes[i], laneH);
      // Chỉ xét trục X: bấm ở bất kỳ độ cao nào trong cột đều đặt được
      // velocity theo đúng vị trí đó, không bắt người dùng trúng đỉnh cột.
      if (cx >= x && cx <= x + w && cy >= 0 && cy <= laneH) return notes[i];
    }
    return null;
  }

  /** Áp velocity mới cho note đang cầm, và dịch đều các note cùng được chọn. */
  const applyVelocity = useCallback(
    (grabbed: DraftNote, nextVelocity: number, originals: Map<string, number>) => {
      const original = originals.get(grabbed.id) ?? grabbed.velocity;
      const delta = nextVelocity - original;

      onNotesChange(
        notes.map((n) => {
          const isGrabbed = n.id === grabbed.id;
          const inSelection = selectedNoteIds.has(grabbed.id) && selectedNoteIds.has(n.id);
          if (!isGrabbed && !inSelection) return n;
          const base = originals.get(n.id) ?? n.velocity;
          const value = clampVelocity(isGrabbed ? nextVelocity : base + delta);
          if (value === n.velocity) return n;
          // BR-28: giữ nguyên `id` — sửa tại chỗ, không xoá rồi tạo note mới.
          return { ...n, velocity: value };
        }),
      );
    },
    [notes, selectedNoteIds, onNotesChange],
  );

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (readOnly || e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { cx, cy } = coords(e);
    const hit = hitBar(cx, cy, canvas.height);
    if (!hit) return;

    const originals = new Map<string, number>();
    notes.forEach((n) => originals.set(n.id, n.velocity));
    dragRef.current = { noteId: hit.id, originalVelocities: originals };
    applyVelocity(hit, velocityFromY(cy, canvas.height), originals);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const drag = dragRef.current;
    if (!canvas) return;

    if (!drag) {
      // Con trỏ đổi hình khi ở trên 1 cột, để người dùng biết chỗ nào kéo được.
      const { cx, cy } = coords(e);
      canvas.style.cursor =
        !readOnly && hitBar(cx, cy, canvas.height) ? "ns-resize" : "default";
      return;
    }

    const grabbed = notes.find((n) => n.id === drag.noteId);
    if (!grabbed) return;
    const { cy } = coords(e);
    applyVelocity(grabbed, velocityFromY(cy, canvas.height), drag.originalVelocities);
  }

  // Thả chuột ngoài canvas (kéo vượt mép) vẫn phải kết thúc thao tác — nghe
  // trên window vì canvas không nhận được sự kiện đó.
  useEffect(() => {
    function onWindowMouseUp() {
      dragRef.current = null;
    }
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{
        height: VELOCITY_LANE_HEIGHT,
        flexShrink: 0,
        borderTop: `1px solid ${colors.border}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onContextMenu={(e) => e.preventDefault()}
        style={{ display: "block" }}
      />
    </div>
  );
}
