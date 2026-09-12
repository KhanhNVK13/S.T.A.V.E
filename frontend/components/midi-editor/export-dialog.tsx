/**
 * export-dialog.tsx
 * UC-38: Export project audio (WAV)
 *
 * Modal dialog that lets the user choose sample rate, shows a progress bar
 * while rendering, and triggers a browser download.
 *
 * Only WAV is offered — a real MP3 encoder needs an extra dependency
 * (e.g. lamejs) that hasn't been added yet. Renaming a WAV file to .mp3
 * would silently mislabel the format, so MP3 is left out entirely rather
 * than shown as a working option (see CLAUDE.md §4.7 on placeholders).
 */
"use client";

import React, { useState, useCallback } from "react";
import type { DraftSnapshot } from "@stave/shared-types";
import { exportAudio } from "../../lib/audio-exporter";

interface ExportDialogProps {
  snapshot: DraftSnapshot;
  projectName: string;
  onClose: () => void;
}

type Phase = "idle" | "rendering" | "done" | "error";

const SAMPLE_RATE_OPTIONS = [
  { value: 44100, label: "44.1 kHz (CD quality)" },
  { value: 48000, label: "48 kHz (Studio)" },
  { value: 22050, label: "22.05 kHz (Nhỏ gọn)" },
];

export function ExportDialog({ snapshot, projectName, onClose }: ExportDialogProps) {
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
        sampleRate,
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName.replace(/[^a-z0-9_\-. ]/gi, "_")}.wav`;
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
  }, [snapshot, sampleRate, projectName]);

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
              <p style={styles.subtitle}>UC-38 · Export Audio (WAV)</p>
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
          {snapshot.tracks.some((t) => t.solo) && (
            <div style={styles.warning}>
              ⚠️ Đang có track được Solo — file xuất ra chỉ gồm (các) track đó, giống như bạn đang nghe.
            </div>
          )}

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
              ✅ Xuất thành công! File WAV đã được tải về máy bạn.
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
              "↓ Xuất WAV"
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
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  headerIcon: {
    fontSize: 22,
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: "#f4f4f5",
  },
  subtitle: {
    margin: 0,
    fontSize: 11,
    color: "#71717a",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#71717a",
    fontSize: 16,
    cursor: "pointer",
    padding: 4,
  },
  body: {
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  summary: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    background: "#111113",
    border: "1px solid #27272a",
    borderRadius: 8,
    padding: 12,
  },
  summaryItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  summaryLabel: {
    fontSize: 10,
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryValue: {
    fontSize: 13,
    color: "#e4e4e7",
    fontWeight: 600,
  },
  warning: {
    fontSize: 12,
    color: "#fbbf24",
    background: "rgba(217,119,6,0.12)",
    border: "1px solid rgba(217,119,6,0.35)",
    borderRadius: 8,
    padding: "8px 10px",
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
    letterSpacing: 0.4,
  },
  srRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  srBtn: {
    flex: "1 1 auto",
    padding: "8px 10px",
    fontSize: 12,
    borderRadius: 8,
    border: "1px solid #27272a",
    background: "#111113",
    color: "#a1a1aa",
    cursor: "pointer",
  },
  srBtnActive: {
    borderColor: "#059669",
    background: "rgba(5,150,105,0.15)",
    color: "#34d399",
  },
  progressSection: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#a1a1aa",
  },
  progressLabel: {},
  progressPct: {
    fontWeight: 700,
    color: "#34d399",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    background: "#27272a",
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    background: "#059669",
    transition: "width 0.15s linear",
  },
  progressHint: {
    margin: 0,
    fontSize: 11,
    color: "#71717a",
  },
  successBox: {
    fontSize: 12,
    color: "#4ade80",
    background: "rgba(22,163,74,0.12)",
    border: "1px solid rgba(22,163,74,0.35)",
    borderRadius: 8,
    padding: "8px 10px",
  },
  errorBox: {
    fontSize: 12,
    color: "#f87171",
    background: "rgba(220,38,38,0.12)",
    border: "1px solid rgba(220,38,38,0.35)",
    borderRadius: 8,
    padding: "8px 10px",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    padding: "14px 20px",
    borderTop: "1px solid #27272a",
  },
  cancelBtn: {
    padding: "8px 14px",
    fontSize: 12,
    borderRadius: 8,
    border: "1px solid #27272a",
    background: "transparent",
    color: "#a1a1aa",
    cursor: "pointer",
  },
  exportBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px solid #059669",
    background: "#059669",
    color: "#fff",
    cursor: "pointer",
  },
  exportBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  spinner: {
    width: 12,
    height: 12,
    border: "2px solid rgba(255,255,255,0.4)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    display: "inline-block",
    animation: "spin 0.8s linear infinite",
  },
};
