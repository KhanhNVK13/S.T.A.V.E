/**
 * export-dialog.tsx
 * UC-38: Export project audio (WAV or MP3)
 *
 * Modal dialog that lets the user choose format and sample rate, shows a
 * progress bar while rendering, and triggers a browser download.
 */
"use client";

import React, { useState, useCallback } from "react";
import type { DraftSnapshot } from "@stave/shared-types";
import { exportAudio, exportAudioPerTrack } from "../../lib/audio-exporter";
import { resolveAndLoadCustomSounds } from "../../lib/custom-sound-buffers";
import { buildProjectBundle } from "../../lib/project-bundle";
import { useDialog } from "../../lib/use-dialog";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

interface ExportDialogProps {
  projectId: string;
  snapshot: DraftSnapshot;
  projectName: string;
  onClose: () => void;
}

type ExportFormat = "wav" | "mp3" | "bundle";

type Phase = "idle" | "rendering" | "done" | "error";

const SAMPLE_RATE_OPTIONS = [
  { value: 44100, label: "44.1 kHz (CD quality)" },
  { value: 48000, label: "48 kHz (Studio)" },
  { value: 22050, label: "22.05 kHz (Nhỏ gọn)" },
];

export function ExportDialog({ projectId, snapshot, projectName, onClose }: ExportDialogProps) {
  const [sampleRate, setSampleRate] = useState(44100);
  // Xuất riêng mỗi track thành 1 file WAV thay vì trộn chung — cùng engine,
  // chỉ khác chỗ mỗi lượt render chỉ "solo" đúng 1 track (xem exportAudioPerTrack).
  const [perTrack, setPerTrack] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("wav");
  const [skippedNote, setSkippedNote] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const hasNotes = snapshot.notes.length > 0;
  const safeProjectName = projectName.replace(/[^a-z0-9_\-. ]/gi, "_");

  const handleExport = useCallback(async () => {
    setPhase("rendering");
    setProgress(0);
    setErrorMsg("");
    setSkippedNote("");

    try {
      if (format === "bundle") {
        const bundle = await buildProjectBundle(projectId, projectName, snapshot, {
          sampleRate,
          onProgress: (p) => setProgress(Math.round(p * 100)),
        });
        triggerDownload(bundle.blob, `${safeProjectName}.zip`);
        if (bundle.skippedSounds.length > 0) {
          setSkippedNote(
            `Không đưa được vào gói: ${bundle.skippedSounds.join(", ")} (âm thanh không còn khả dụng).`,
          );
        }
        setPhase("done");
        return;
      }
      const customBuffers = await resolveAndLoadCustomSounds(projectId, snapshot).catch(
        () => new Map<string, AudioBuffer>(),
      );
      if (perTrack) {
        const results = await exportAudioPerTrack(snapshot, {
          sampleRate,
          customBuffers,
          format,
          onProgress: (p) => setProgress(Math.round(p * 100)),
        });
        // Stagger downloads slightly — firing many a.click() in the same tick
        // can get a couple of them silently dropped by the browser's
        // multi-download prompt/limit.
        for (let i = 0; i < results.length; i++) {
          const { track, blob } = results[i];
          const safeTrackName = track.name.replace(/[^a-z0-9_\-. ]/gi, "_");
          setTimeout(() => triggerDownload(blob, `${safeProjectName} - ${safeTrackName}.${format}`), i * 300);
        }
      } else {
        const blob = await exportAudio(snapshot, {
          sampleRate,
          customBuffers,
          format,
          onProgress: (p) => setProgress(Math.round(p * 100)),
        });
        triggerDownload(blob, `${safeProjectName}.${format}`);
      }

      setPhase("done");
    } catch (err) {
      console.error("Export failed:", err);
      setErrorMsg(
        format === "bundle"
          ? "Không tạo được gói .zip, chưa có file nào được tải xuống. Hãy thử lại, hoặc xuất riêng từng loại file."
          : "Không xuất được file âm thanh, chưa có file nào được tải xuống. Dự án có thể quá dài hoặc quá nặng cho trình duyệt: hãy thử sample rate thấp hơn (22.05 kHz) hoặc xuất riêng từng track.",
      );
      setPhase("error");
    }
  }, [projectId, projectName, snapshot, sampleRate, perTrack, format, safeProjectName]);

  const noteCount = snapshot.notes.length;
  const trackCount = snapshot.tracks.filter((t) => !t.muted).length;
  const anySolo = snapshot.tracks.some((t) => t.solo);
  const audibleTrackIds = new Set(
    snapshot.tracks.filter((t) => (anySolo ? t.solo : !t.muted)).map((t) => t.id),
  );
  const hasAudibleContent = snapshot.notes.some((n) => audibleTrackIds.has(n.trackId));
  const isAudioFile = format === "wav" || format === "mp3";
  const blockedByNoAudio = isAudioFile && !hasAudibleContent;
  const rendering = phase === "rendering";
  const dialogRef = useDialog<HTMLDivElement>({ onClose, closeDisabled: rendering });

  return (
    <>
      {/* Backdrop */}
      <div style={styles.backdrop} onClick={() => !rendering && onClose()} />

      {/* Modal */}
      <div
        ref={dialogRef}
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        tabIndex={-1}
      >
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerIcon}>🎵</span>
            <div>
              <h2 id="export-title" style={styles.title}>
                Xuất file âm thanh
              </h2>
              <p style={styles.subtitle}>
                {format === "bundle"
                  ? "Gói .zip: MIDI, WAV và âm thanh riêng"
                  : format === "mp3"
                    ? "Định dạng MP3, nén 192 kbps"
                    : "Định dạng WAV, không nén"}
              </p>
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose} title="Đóng" aria-label="Đóng" disabled={rendering}>
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
          {hasNotes && !hasAudibleContent && isAudioFile && (
            <div role="alert" style={styles.warning}>
              ⚠️ Không có nội dung nghe được: mọi track có nốt đều đang tắt tiếng. Hãy bật tiếng ít nhất một track rồi xuất lại.
            </div>
          )}
          {!perTrack && snapshot.tracks.some((t) => t.solo) && (
            <div style={styles.warning}>
              ⚠️ Đang có track được Solo — file xuất ra chỉ gồm (các) track đó, giống như bạn đang nghe.
            </div>
          )}

          {/* Sample rate selector */}
          <div style={styles.section}>
            <span id="export-sample-rate" style={styles.sectionLabel}>Sample rate</span>
            <div style={styles.srRow} role="group" aria-labelledby="export-sample-rate">
              {SAMPLE_RATE_OPTIONS.map((sr) => (
                <button
                  key={sr.value}
                  onClick={() => setSampleRate(sr.value)}
                  disabled={phase === "rendering"}
                  title={`Xuất ở ${sr.label}`}
                  aria-pressed={sampleRate === sr.value}
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

          <div style={styles.section}>
            <span id="export-format" style={styles.sectionLabel}>Định dạng</span>
            <div style={styles.srRow} role="group" aria-labelledby="export-format">
              {([
                { value: "wav", label: "WAV (âm thanh)" },
                { value: "mp3", label: "MP3 (nén, nhẹ hơn)" },
                { value: "bundle", label: "Gói .zip (MIDI + WAV + âm thanh riêng)" },
              ] as const).map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value)}
                  disabled={phase === "rendering"}
                  aria-pressed={format === f.value}
                  style={{
                    ...styles.srBtn,
                    ...(format === f.value ? styles.srBtnActive : {}),
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Per-track export */}
          {isAudioFile && (
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={perTrack}
              onChange={(e) => setPerTrack(e.target.checked)}
              disabled={phase === "rendering"}
            />
            <span>
              Xuất riêng từng track ({trackCount} file {format.toUpperCase()} thay vì 1 file trộn chung)
            </span>
          </label>
          )}

          {/* Progress / Status */}
          {phase === "rendering" && (
            <div style={styles.progressSection}>
              <div style={styles.progressHeader}>
                <span style={styles.progressLabel}>Đang render âm thanh…</span>
                <span style={styles.progressPct}>{progress}%</span>
              </div>
              <div
                style={styles.progressTrack}
                role="progressbar"
                aria-label="Tiến độ render"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div style={{ ...styles.progressBar, width: `${progress}%` }} />
              </div>
              <p style={styles.progressHint}>
                Vui lòng chờ — đang tổng hợp {noteCount} note qua OfflineAudioContext…
              </p>
            </div>
          )}

          {phase === "done" && (
            <div style={styles.successBox}>
              ✅ Xuất thành công!{" "}
              {format === "bundle"
                ? "Gói .zip đã"
                : perTrack
                  ? `${trackCount} file ${format.toUpperCase()} đã`
                  : `File ${format.toUpperCase()} đã`}{" "}
              được tải về máy bạn.
              {skippedNote && <div>{skippedNote}</div>}
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
            title={phase === "done" ? "Đóng cửa sổ" : "Huỷ, không xuất file"}
          >
            {phase === "done" ? "Đóng" : "Huỷ"}
          </button>
          <button
            style={{
              ...styles.exportBtn,
              ...(phase === "rendering" || blockedByNoAudio ? styles.exportBtnDisabled : {}),
            }}
            onClick={() => void handleExport()}
            disabled={phase === "rendering" || blockedByNoAudio}
            title={
              format === "bundle"
                ? "Xuất một gói .zip gồm MIDI, WAV và các âm thanh riêng"
                : perTrack
                  ? `Xuất ${trackCount} file ${format.toUpperCase()} riêng biệt`
                  : `Xuất 1 file ${format.toUpperCase()} trộn chung tất cả track`
            }
          >
            {phase === "rendering" ? (
              <>
                <span style={styles.spinner} />
                Đang render…
              </>
            ) : phase === "done" ? (
              "↓ Xuất lại"
            ) : format === "bundle" ? (
              "↓ Xuất gói .zip"
            ) : perTrack ? (
              `↓ Xuất ${trackCount} track`
            ) : (
              `↓ Xuất ${format.toUpperCase()}`
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
    background: "color-mix(in oklab, var(--foreground) 40%, transparent)",
    backdropFilter: "blur(4px)",
    zIndex: 50,
  },
  modal: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "min(520px, 95vw)",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    boxShadow: "0 24px 60px color-mix(in oklab, var(--foreground) 22%, transparent)",
    zIndex: 51,
    outline: "none",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
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
    color: "var(--foreground)",
  },
  subtitle: {
    margin: 0,
    fontSize: 11,
    color: "var(--muted-foreground)",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "var(--muted-foreground)",
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
    background: "var(--surface-subtle)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 12,
  },
  summaryItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  summaryLabel: {
    fontSize: 11,
    color: "var(--muted-foreground)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryValue: {
    fontSize: 13,
    color: "var(--foreground)",
    fontWeight: 600,
  },
  warning: {
    fontSize: 12,
    color: "var(--warning-foreground)",
    background: "var(--warning-muted)",
    border: "1px solid color-mix(in oklab, var(--warning) 35%, transparent)",
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
    color: "var(--muted-foreground)",
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
    border: "1px solid var(--border)",
    background: "var(--surface-subtle)",
    color: "var(--muted-foreground)",
    cursor: "pointer",
  },
  srBtnActive: {
    borderColor: "var(--success)",
    background: "var(--success-muted)",
    color: "var(--success-foreground)",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "var(--foreground)",
    cursor: "pointer",
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
    color: "var(--muted-foreground)",
  },
  progressLabel: {},
  progressPct: {
    fontWeight: 700,
    color: "var(--success-foreground)",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    background: "var(--border)",
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    background: "var(--success)",
    transition: "width 0.15s linear",
  },
  progressHint: {
    margin: 0,
    fontSize: 11,
    color: "var(--muted-foreground)",
  },
  successBox: {
    fontSize: 12,
    color: "var(--success-foreground)",
    background: "var(--success-muted)",
    border: "1px solid color-mix(in oklab, var(--success) 35%, transparent)",
    borderRadius: 8,
    padding: "8px 10px",
  },
  errorBox: {
    fontSize: 12,
    color: "var(--danger)",
    background: "var(--danger-muted)",
    border: "1px solid color-mix(in oklab, var(--danger) 35%, transparent)",
    borderRadius: 8,
    padding: "8px 10px",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    padding: "14px 20px",
    borderTop: "1px solid var(--border)",
  },
  cancelBtn: {
    padding: "8px 14px",
    fontSize: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--muted-foreground)",
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
    border: "1px solid var(--success)",
    background: "var(--success)",
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
    border: "2px solid color-mix(in oklab, var(--accent-foreground) 40%, transparent)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    display: "inline-block",
    animation: "spin 0.8s linear infinite",
  },
};
