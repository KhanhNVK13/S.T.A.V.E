/**
 * export-dialog.tsx
 * UC-38: Export project audio (WAV/MP3)
 *
 * Modal dialog that lets the user choose export format and sample rate,
 * shows a progress bar while rendering, and triggers a browser download.
 */
"use client";

import React, { useState, useCallback } from "react";
import type { DraftSnapshot } from "@stave/shared-types";
import { exportAudio, type ExportFormat } from "../../lib/audio-exporter";

interface ExportDialogProps {
  snapshot: DraftSnapshot;
  projectName: string;
  onClose: () => void;
}

type Phase = "idle" | "rendering" | "done" | "error";

const FORMAT_OPTIONS: { value: ExportFormat; label: string; ext: string; desc: string }[] = [
  { value: "wav", label: "WAV", ext: ".wav", desc: "Lossless · Tương thích tốt nhất" },
  { value: "mp3", label: "MP3", ext: ".mp3", desc: "Nén nhỏ hơn · Chất lượng cao" },
];

const SAMPLE_RATE_OPTIONS = [
  { value: 44100, label: "44.1 kHz (CD quality)" },
  { value: 48000, label: "48 kHz (Studio)" },
  { value: 22050, label: "22.05 kHz (Nhỏ gọn)" },
];

export function ExportDialog({ snapshot, projectName, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("wav");
  const [sampleRate, setSampleRate] = useState(44100);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const hasNotes = snapshot.notes.length > 0;

  const handleExport = useCallback(async () => {
    setPhase("rendering");
    setProgress(0);
    setErrorMsg("");

    try {
      const blob = await exportAudio(snapshot, {
        format,
        sampleRate,
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ext = FORMAT_OPTIONS.find((f) => f.value === format)?.ext ?? ".wav";
      a.href = url;
      a.download = `${projectName.replace(/[^a-z0-9_\-. ]/gi, "_")}${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setPhase("done");
    } catch (err) {
      console.error("Export failed:", err);
      setErrorMsg(err instanceof Error ? err.message : "Có lỗi khi xuất file.");
      setPhase("error");
    }
  }, [snapshot, format, sampleRate, projectName]);

  const noteCount = snapshot.notes.length;
  const trackCount = snapshot.tracks.filter((t) => !t.muted).length;

  return (
    <>
      {/* Backdrop */}
      <div style={styles.backdrop} onClick={onClose} />

      {/* Modal */}
      <div style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="export-title">
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerIcon}>🎵</span>
            <div>
              <h2 id="export-title" style={styles.title}>
                Xuất file âm thanh
              </h2>
              <p style={styles.subtitle}>UC-38 · Export Audio (WAV/MP3)</p>
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose} title="Đóng" disabled={phase === "rendering"}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {/* Project summary */}
          <div style={styles.summary}>
            <div style={styles.summaryItem}>
              <span style={styles.summaryLabel}>Dự án</span>
              <span style={styles.summaryValue}>{projectName}</span>
            </div>
            <div style={styles.summaryItem}>
              <span style={styles.summaryLabel}>Notes</span>
              <span style={styles.summaryValue}>{noteCount}</span>
            </div>
            <div style={styles.summaryItem}>
              <span style={styles.summaryLabel}>Tracks (active)</span>
              <span style={styles.summaryValue}>{trackCount}</span>
            </div>
            <div style={styles.summaryItem}>
              <span style={styles.summaryLabel}>Tempo</span>
              <span style={styles.summaryValue}>{snapshot.meta.tempo} BPM</span>
            </div>
          </div>

          {!hasNotes && (
            <div style={styles.warning}>
              ⚠️ Dự án chưa có note nào — file xuất ra sẽ là im lặng.
            </div>
          )}

          {/* Format selector */}
          <div style={styles.section}>
            <label style={styles.sectionLabel}>Định dạng xuất</label>
            <div style={styles.formatRow}>
              {FORMAT_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value)}
                  disabled={phase === "rendering"}
                  style={{
                    ...styles.formatBtn,
                    ...(format === f.value ? styles.formatBtnActive : {}),
                  }}
                >
                  <span style={styles.formatLabel}>{f.label}</span>
                  <span style={styles.formatDesc}>{f.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sample rate selector */}
          <div style={styles.section}>
            <label style={styles.sectionLabel}>Sample rate</label>
            <div style={styles.srRow}>
              {SAMPLE_RATE_OPTIONS.map((sr) => (
                <button
                  key={sr.value}
                  onClick={() => setSampleRate(sr.value)}
                  disabled={phase === "rendering"}
                  style={{
                    ...styles.srBtn,
                    ...(sampleRate === sr.value ? styles.srBtnActive : {}),
                  }}
                >
                  {sr.label}
                </button>
              ))}
            </div>
          </div>

          {/* Progress / Status */}
          {phase === "rendering" && (
            <div style={styles.progressSection}>
              <div style={styles.progressHeader}>
                <span style={styles.progressLabel}>Đang render âm thanh…</span>
                <span style={styles.progressPct}>{progress}%</span>
              </div>
              <div style={styles.progressTrack}>
                <div style={{ ...styles.progressBar, width: `${progress}%` }} />
              </div>
              <p style={styles.progressHint}>
                Vui lòng chờ — đang tổng hợp {noteCount} note qua OfflineAudioContext…
              </p>
            </div>
          )}

          {phase === "done" && (
            <div style={styles.successBox}>
              ✅ Xuất thành công! File đã được tải về máy bạn.
            </div>
          )}

          {phase === "error" && (
            <div style={styles.errorBox}>
              ❌ {errorMsg || "Có lỗi khi xuất file. Vui lòng thử lại."}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button
            style={styles.cancelBtn}
            onClick={onClose}
            disabled={phase === "rendering"}
          >
            {phase === "done" ? "Đóng" : "Huỷ"}
          </button>
          <button
            style={{
              ...styles.exportBtn,
              ...(phase === "rendering" ? styles.exportBtnDisabled : {}),
            }}
            onClick={() => void handleExport()}
            disabled={phase === "rendering"}
          >
            {phase === "rendering" ? (
              <>
                <span style={styles.spinner} />
                Đang render…
              </>
            ) : phase === "done" ? (
              "↓ Xuất lại"
            ) : (
              `↓ Xuất ${FORMAT_OPTIONS.find((f) => f.value === format)?.label ?? "WAV"}`
            )}
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Styles ─────────────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    backdropFilter: "blur(4px)",
    zIndex: 1000,
  },
  modal: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "min(520px, 95vw)",
    background: "#18181b",
    border: "1px solid #27272a",
    borderRadius: 12,
    boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
    zIndex: 1001,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid #27272a",
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    fontSize: 28,
    lineHeight: 1,
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "#f4f4f5",
    letterSpacing: "-0.01em",
  },
  subtitle: {
    margin: "2px 0 0",
    fontSize: 11,
    color: "#6366f1",
    fontFamily: "monospace",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#71717a",
    cursor: "pointer",
    fontSize: 16,
    padding: "4px 8px",
    borderRadius: 6,
    lineHeight: 1,
    transition: "color 0.15s",
  },
  body: {
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    overflowY: "auto",
  },
  summary: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    padding: "12px",
    background: "#0f0f11",
    borderRadius: 8,
    border: "1px solid #27272a",
  },
  summaryItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  summaryLabel: {
    fontSize: 10,
    color: "#52525b",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: 600,
    color: "#d4d4d8",
  },
  warning: {
    padding: "10px 14px",
    background: "rgba(245,158,11,0.1)",
    border: "1px solid rgba(245,158,11,0.3)",
    borderRadius: 8,
    fontSize: 12,
    color: "#fbbf24",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#a1a1aa",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  formatRow: {
    display: "flex",
    gap: 8,
  },
  formatBtn: {
    flex: 1,
    padding: "10px 14px",
    background: "#0f0f11",
    border: "1px solid #27272a",
    borderRadius: 8,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    textAlign: "left",
    transition: "border-color 0.15s, background 0.15s",
  },
  formatBtnActive: {
    background: "rgba(99,102,241,0.12)",
    borderColor: "#6366f1",
  },
  formatLabel: {
    fontSize: 16,
    fontWeight: 700,
    color: "#e4e4e7",
    display: "block",
  },
  formatDesc: {
    fontSize: 11,
    color: "#71717a",
    display: "block",
  },
  srRow: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  srBtn: {
    padding: "8px 12px",
    background: "#0f0f11",
    border: "1px solid #27272a",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    color: "#a1a1aa",
    textAlign: "left",
    transition: "border-color 0.15s, color 0.15s",
  },
  srBtnActive: {
    borderColor: "#6366f1",
    color: "#818cf8",
    background: "rgba(99,102,241,0.08)",
  },
  progressSection: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    fontSize: 12,
    color: "#a1a1aa",
  },
  progressPct: {
    fontSize: 12,
    fontWeight: 700,
    color: "#6366f1",
    fontFamily: "monospace",
  },
  progressTrack: {
    height: 6,
    background: "#27272a",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
    borderRadius: 3,
    transition: "width 0.2s ease",
  },
  progressHint: {
    fontSize: 11,
    color: "#52525b",
    margin: 0,
  },
  successBox: {
    padding: "10px 14px",
    background: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.3)",
    borderRadius: 8,
    fontSize: 13,
    color: "#4ade80",
    fontWeight: 600,
  },
  errorBox: {
    padding: "10px 14px",
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 8,
    fontSize: 13,
    color: "#f87171",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    padding: "14px 20px",
    borderTop: "1px solid #27272a",
    background: "#0f0f11",
  },
  cancelBtn: {
    padding: "8px 16px",
    background: "transparent",
    border: "1px solid #27272a",
    borderRadius: 8,
    color: "#a1a1aa",
    cursor: "pointer",
    fontSize: 13,
    transition: "border-color 0.15s",
  },
  exportBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 20px",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    boxShadow: "0 4px 12px rgba(99,102,241,0.4)",
    transition: "opacity 0.15s",
  },
  exportBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
    boxShadow: "none",
  },
  spinner: {
    width: 12,
    height: 12,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    display: "inline-block",
  },
};
