/**
 * redesign/track-panel.tsx
 * Panel Tracks của bản UI redesign — dựng theo mockup thật
 * (STAVE.dc.html screen "editor", dòng 203–230): mỗi track là 1 card dọc
 * gồm chấm màu + tên + nút M/S vuông + thanh VOL có thumb tròn.
 *
 * Không dùng lại JSX/style nào của `track-list.tsx` (UI gốc). Toàn bộ dữ liệu
 * và handler đều nhận từ `MidiEditor` — cùng một nguồn state với UI gốc.
 */
"use client";

import React, { useEffect, useRef, useState } from "react";
import type { DraftTrack } from "@stave/shared-types";
import { GM_INSTRUMENTS } from "../../../lib/instruments";
import { DC, DC_SIZE } from "./tokens";

// UC-35 exception 4.E2 — giữ đúng giới hạn của UI gốc.
const MAX_LABEL_LENGTH = 50;

// UC-34 — cùng bảng màu với UI gốc (đây là dữ liệu nghiệp vụ, không phải style).
const TRACK_COLOR_PALETTE = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
  "#f97316", "#84cc16", "#06b6d4", "#a855f7",
];

interface TrackPanelProps {
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
  onSetTrackVolume: (id: string, volume: number) => void;
  canAddTrack: boolean;
}

export function TrackPanel({
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
  onSetTrackVolume,
  canAddTrack,
}: TrackPanelProps) {
  const [openInstrumentFor, setOpenInstrumentFor] = useState<string | null>(null);
  // Tìm nhạc cụ — 128 nhạc cụ cuộn tay trong hộp nhỏ rất mất thời gian; lọc
  // theo tên/nhóm nhạc cụ khi gõ. Xoá khi đóng/mở lại dropdown.
  const [instrumentSearch, setInstrumentSearch] = useState("");
  const instrumentSearchRef = useRef<HTMLInputElement>(null);
  const [openColorFor, setOpenColorFor] = useState<string | null>(null);
  const [editingLabelFor, setEditingLabelFor] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const labelInputRef = useRef<HTMLInputElement>(null);
  // Enter/Escape đóng ô nhập → input unmount → bắn blur; cờ này chặn blur
  // lưu đè lên ý định vừa xử lý (giống lý do ở UI gốc, UC-35 alt-flow 3.1).
  const labelIntentHandledRef = useRef(false);

  useEffect(() => {
    if (editingLabelFor !== null && labelInputRef.current) {
      labelIntentHandledRef.current = false;
      labelInputRef.current.focus();
      labelInputRef.current.select();
    }
  }, [editingLabelFor]);

  // Focus ô tìm mỗi lần mở dropdown nhạc cụ — ô tìm đã được xoá rỗng ngay tại
  // nơi mở (xem nút bên dưới), không setState ở đây để tránh cascading
  // render (ESLint react-hooks/set-state-in-effect).
  useEffect(() => {
    if (openInstrumentFor !== null) {
      instrumentSearchRef.current?.focus();
    }
  }, [openInstrumentFor]);

  function commitLabel(trackId: string) {
    const trimmed = labelDraft.trim();
    if (trimmed) onSetTrackLabel(trackId, trimmed);
    labelIntentHandledRef.current = true;
    setEditingLabelFor(null);
  }

  function cancelLabel() {
    labelIntentHandledRef.current = true;
    setEditingLabelFor(null);
  }

  return (
    <aside style={styles.root}>
      <div style={styles.header}>
        <span style={styles.headerLabel}>TRACKS</span>
        <span style={styles.headerCount}>{tracks.length}</span>
      </div>

      <div style={styles.list}>
        {tracks.length === 0 && <div style={styles.empty}>Chưa có track nào</div>}

        {tracks.map((track) => {
          const selected = track.id === selectedTrackId;
          const volumePct = Math.round((track.volume ?? 1) * 100);

          return (
            <div key={track.id}>
              <div
                onClick={() => onSelectTrack(track.id)}
                style={{
                  ...styles.trackCard,
                  background: selected ? DC.accentSoft : "transparent",
                  boxShadow: selected ? `inset 3px 0 0 ${DC.accent}` : "none",
                }}
              >
                {/* Hàng 1 — chấm màu, tên, M / S / xoá */}
                <div style={styles.row}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenColorFor(openColorFor === track.id ? null : track.id);
                    }}
                    title="Đổi màu track (UC-34)"
                    style={{ ...styles.colorDot, background: track.color }}
                  />

                  {editingLabelFor === track.id ? (
                    <span style={styles.labelEditWrap}>
                      <input
                        ref={labelInputRef}
                        type="text"
                        value={labelDraft}
                        maxLength={MAX_LABEL_LENGTH}
                        onChange={(e) => setLabelDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitLabel(track.id);
                          else if (e.key === "Escape") cancelLabel();
                        }}
                        onBlur={() => {
                          if (labelIntentHandledRef.current) return;
                          commitLabel(track.id);
                        }}
                        style={styles.labelInput}
                      />
                      <span style={styles.labelCounter}>
                        {labelDraft.length}/{MAX_LABEL_LENGTH}
                      </span>
                    </span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setLabelDraft(track.name);
                        setEditingLabelFor(track.id);
                      }}
                      title="Đổi tên track (UC-35)"
                      style={styles.trackName}
                    >
                      {track.name}
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMute(track.id);
                    }}
                    title={track.muted ? "Bỏ tắt tiếng" : "Tắt tiếng track"}
                    style={{
                      ...styles.msBtn,
                      background: track.muted ? DC.warning : DC.surface,
                      color: track.muted ? DC.text : DC.textMuted,
                      borderColor: track.muted ? DC.warning : DC.border,
                    }}
                  >
                    M
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSolo(track.id);
                    }}
                    title={track.solo ? "Bỏ solo" : "Solo track"}
                    style={{
                      ...styles.msBtn,
                      background: track.solo ? DC.success : DC.surface,
                      color: track.solo ? "#fff" : DC.textMuted,
                      borderColor: track.solo ? DC.success : DC.border,
                    }}
                  >
                    S
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTrack(track.id);
                    }}
                    title="Xoá track (UC-29)"
                    style={{
                      ...styles.deleteBtn,
                      cursor: "pointer",
                      opacity: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Hàng 2 — nhạc cụ (UC-30) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setInstrumentSearch("");
                    setOpenInstrumentFor(openInstrumentFor === track.id ? null : track.id);
                  }}
                  title={track.instrument ?? "Gán nhạc cụ cho track"}
                  style={styles.instrumentChip}
                >
                  {track.instrument ?? "Chưa gán nhạc cụ"}
                </button>

                {/* Hàng 3 — VOL (mockup dòng 216–223) */}
                <div style={styles.volRow} onClick={(e) => e.stopPropagation()}>
                  <span style={styles.volLabel}>VOL</span>
                  <span style={styles.volTrack}>
                    <span style={{ ...styles.volFill, width: `${volumePct}%` }} />
                    <span style={{ ...styles.volThumb, left: `${volumePct}%` }} />
                    {/* Input thật nằm trong suốt phía trên: giữ nguyên hành vi
                        kéo/bàn phím/a11y của native range, phần nhìn do 2 span
                        ở trên vẽ đúng theo mockup. */}
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={volumePct}
                      onChange={(e) => onSetTrackVolume(track.id, Number(e.target.value) / 100)}
                      aria-label={`Âm lượng track ${track.name}`}
                      style={styles.volInput}
                    />
                  </span>
                  <span style={styles.volValue}>{volumePct}</span>
                </div>
              </div>

              {/* UC-30 — danh sách nhạc cụ */}
              {openInstrumentFor === track.id && (() => {
                const query = instrumentSearch.trim().toLowerCase();
                const filtered = query
                  ? GM_INSTRUMENTS.filter(
                      (i) =>
                        i.name.toLowerCase().includes(query) ||
                        i.category.toLowerCase().includes(query),
                    )
                  : GM_INSTRUMENTS;
                const categories = Array.from(new Set(filtered.map((i) => i.category)));

                return (
                  <div style={styles.dropdown}>
                    <div style={styles.dropdownHead}>
                      <span style={styles.dropdownTitle}>CHỌN NHẠC CỤ</span>
                      <button onClick={() => setOpenInstrumentFor(null)} style={styles.dropdownClose}>
                        ✕
                      </button>
                    </div>
                    <div style={styles.instrumentSearchWrap}>
                      <input
                        ref={instrumentSearchRef}
                        type="text"
                        value={instrumentSearch}
                        onChange={(e) => setInstrumentSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setOpenInstrumentFor(null);
                          } else if (e.key === "Enter" && filtered[0]) {
                            onAssignInstrument(track.id, filtered[0].name);
                            setOpenInstrumentFor(null);
                          }
                        }}
                        placeholder="Tìm nhạc cụ…"
                        style={styles.instrumentSearchInput}
                      />
                    </div>
                    {!query && (
                      <button
                        onClick={() => {
                          onAssignInstrument(track.id, null);
                          setOpenInstrumentFor(null);
                        }}
                        style={{
                          ...styles.instrumentOption,
                          ...(track.instrument === null ? styles.instrumentOptionActive : {}),
                        }}
                      >
                        Không gán (mặc định)
                      </button>
                    )}
                    {categories.map((category) => (
                      <div key={category}>
                        <div style={styles.instrumentCategory}>{category}</div>
                        {filtered
                          .filter((i) => i.category === category)
                          .map((inst) => (
                            <button
                              key={inst.id}
                              onClick={() => {
                                onAssignInstrument(track.id, inst.name);
                                setOpenInstrumentFor(null);
                              }}
                              style={{
                                ...styles.instrumentOption,
                                ...(track.instrument === inst.name ? styles.instrumentOptionActive : {}),
                              }}
                            >
                              {inst.name}
                            </button>
                          ))}
                      </div>
                    ))}
                    {query && filtered.length === 0 && (
                      <div style={styles.instrumentSearchEmpty}>Không tìm thấy nhạc cụ nào</div>
                    )}
                  </div>
                );
              })()}

              {/* UC-34 — bảng màu */}
              {openColorFor === track.id && (
                <div style={styles.dropdown}>
                  <div style={styles.dropdownHead}>
                    <span style={styles.dropdownTitle}>MÀU TRACK</span>
                    <button onClick={() => setOpenColorFor(null)} style={styles.dropdownClose}>
                      ✕
                    </button>
                  </div>
                  <div style={styles.colorGrid}>
                    {TRACK_COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          onSetTrackColor(track.id, color);
                          setOpenColorFor(null);
                        }}
                        title={color}
                        style={{
                          ...styles.colorSwatch,
                          background: color,
                          borderColor: track.color === color ? DC.accentDeep : "transparent",
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

      <button
        onClick={onAddTrack}
        disabled={!canAddTrack}
        title={canAddTrack ? "Thêm track mới (UC-28)" : "Đã đạt tối đa 16 track (BR-29)"}
        style={{
          ...styles.addBtn,
          cursor: canAddTrack ? "pointer" : "not-allowed",
          opacity: canAddTrack ? 1 : 0.5,
        }}
      >
        + Add Track
      </button>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: DC_SIZE.trackPanelW,
    flexShrink: 0,
    background: DC.surface,
    borderRight: `1px solid ${DC.border}`,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    padding: 16,
    borderBottom: `1px solid ${DC.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
  },
  headerLabel: {
    font: `700 11px ${DC.mono}`,
    letterSpacing: ".1em",
    color: DC.textMuted,
  },
  headerCount: {
    font: `600 11px ${DC.mono}`,
    color: DC.textMuted,
  },
  list: { flex: 1, minHeight: 0, overflowY: "auto" },
  empty: {
    padding: "24px 16px",
    fontSize: 13,
    color: DC.textMuted,
    textAlign: "center",
  },
  trackCard: {
    padding: "14px 16px",
    borderBottom: `1px solid ${DC.borderSoft}`,
    display: "flex",
    flexDirection: "column",
    gap: 11,
    cursor: "pointer",
  },
  row: { display: "flex", alignItems: "center", gap: 9 },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    flexShrink: 0,
    border: "none",
    padding: 0,
    cursor: "pointer",
  },
  trackName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: 600,
    color: DC.text,
    background: "none",
    border: "none",
    padding: 0,
    textAlign: "left",
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  labelEditWrap: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  labelInput: {
    width: "100%",
    fontSize: 14,
    fontWeight: 600,
    color: DC.text,
    background: DC.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: DC.accent,
    borderRadius: 6,
    padding: "2px 6px",
    outline: "none",
    boxSizing: "border-box",
  },
  labelCounter: { font: `500 9px ${DC.mono}`, color: DC.textMuted },
  msBtn: {
    width: 27,
    height: 27,
    flexShrink: 0,
    borderRadius: 6,
    font: `700 11px ${DC.mono}`,
    borderWidth: 1,
    borderStyle: "solid",
    cursor: "pointer",
    padding: 0,
  },
  deleteBtn: {
    width: 27,
    height: 27,
    flexShrink: 0,
    borderRadius: 6,
    border: "none",
    background: "none",
    color: DC.textMuted,
    fontSize: 12,
    padding: 0,
  },
  instrumentChip: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    font: `500 10px ${DC.mono}`,
    color: DC.accent,
    background: DC.accentSoft,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: 5,
    padding: "3px 7px",
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  volRow: { display: "flex", alignItems: "center", gap: 10 },
  volLabel: { font: `500 10px ${DC.mono}`, color: DC.textMuted, flexShrink: 0 },
  volTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    background: DC.border,
    position: "relative",
  },
  volFill: {
    display: "block",
    height: "100%",
    background: DC.accent,
    borderRadius: 3,
  },
  volThumb: {
    position: "absolute",
    top: "50%",
    width: 13,
    height: 13,
    background: DC.accentDeep,
    border: "2px solid #fff",
    borderRadius: "50%",
    transform: "translate(-50%,-50%)",
    boxShadow: "0 1px 3px rgba(0,0,0,.22)",
    pointerEvents: "none",
  },
  volInput: {
    position: "absolute",
    inset: "-6px 0",
    width: "100%",
    opacity: 0,
    cursor: "pointer",
    margin: 0,
  },
  volValue: {
    font: `600 11px ${DC.mono}`,
    color: DC.text,
    width: 22,
    textAlign: "right",
    flexShrink: 0,
  },
  dropdown: {
    background: DC.pageBg,
    borderBottom: `1px solid ${DC.border}`,
    maxHeight: 260,
    overflowY: "auto",
    padding: "8px 0",
  },
  dropdownHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px 6px",
  },
  dropdownTitle: { font: `700 10px ${DC.mono}`, letterSpacing: ".08em", color: DC.textMuted },
  dropdownClose: {
    border: "none",
    background: "none",
    color: DC.textMuted,
    cursor: "pointer",
    fontSize: 11,
    padding: 0,
  },
  instrumentSearchWrap: {
    padding: "8px 16px 4px",
  },
  instrumentSearchInput: {
    width: "100%",
    background: DC.pageBg,
    border: `1px solid ${DC.border}`,
    borderRadius: 6,
    padding: "5px 8px",
    fontSize: 11.5,
    color: DC.text,
    outline: "none",
  },
  instrumentSearchEmpty: {
    padding: "10px 16px",
    fontSize: 11.5,
    color: DC.textMuted,
    textAlign: "center",
  },
  instrumentCategory: {
    font: `700 9px ${DC.mono}`,
    letterSpacing: ".08em",
    color: DC.textMuted,
    padding: "8px 16px 3px",
  },
  instrumentOption: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "5px 16px",
    fontSize: 12,
    border: "none",
    background: "none",
    color: DC.text,
    cursor: "pointer",
  },
  instrumentOptionActive: { background: DC.accentSoft, color: DC.accent, fontWeight: 600 },
  colorGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 6,
    padding: "0 16px",
  },
  colorSwatch: {
    width: "100%",
    aspectRatio: "1",
    borderWidth: 2,
    borderStyle: "solid",
    borderRadius: 5,
    cursor: "pointer",
    padding: 0,
  },
  addBtn: {
    margin: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "none",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#D3D5DA",
    color: DC.textMuted,
    borderRadius: 8,
    padding: 10,
    fontWeight: 600,
    fontSize: 13,
    flexShrink: 0,
  },
};
