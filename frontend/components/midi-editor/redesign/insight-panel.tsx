/**
 * redesign/insight-panel.tsx — UC-72 Music Theory Insight.
 *
 * Panel trái "Insight": nêu những gì ĐÃ CÓ trong bản nhạc (tông, tiến
 * trình hợp âm, kết) bằng lib/music-theory (hàm thuần, chạy trong trình
 * duyệt). CHỈ mô tả — không bao giờ gợi ý sửa hay đánh giá (BR-82).
 *
 * - Kết quả nhận tông nói bằng giọng "có vẻ là ..." (không khẳng định);
 *   đoạn rất ngắn (dưới 4 ô nhịp có nốt) hiện cảnh báo độ tin cậy thấp.
 * - Làm mới khi đang sửa (3.1): chạy lại sau 500 ms không có thay đổi.
 * - Bỏ một insight (4.1): ẩn cho dự án này, lưu localStorage khoá
 *   `stave_insight_dismissed_<projectId>` (bọc try/catch — trình duyệt có
 *   thể chặn); tải lại trang vẫn giữ.
 * - Chọn một insight (5): nút "Đi tới ô nhịp" đưa đầu phát tới ô nhịp đó
 *   (seek qua piano-roll-geometry của Đức — không tự viết lại hệ số).
 * - Không đụng nốt nào của dự án.
 */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Lightbulb, MapPin, X } from "lucide-react";
import type { DraftMeta, DraftNote, DraftTrack } from "@stave/shared-types";
import { DRAFT_SCHEMA_VERSION } from "@stave/shared-types";
import { analyze, ticksPerBar, type Insight } from "../../../lib/music-theory";
import { DC } from "./tokens";

interface InsightPanelProps {
  projectId: string;
  notes: DraftNote[];
  tracks: DraftTrack[];
  meta: DraftMeta;
  /** Đưa playhead tới ô nhịp (bar, 1-indexed). */
  onJumpToBar: (bar: number) => void;
}

/** Đủ 4 ô nhịp có nốt mới coi độ tin cậy nhận tông là bình thường. */
const CONFIDENT_NOTE_BARS = 4;

const DISMISS_KEY = (projectId: string) => `stave_insight_dismissed_${projectId}`;

function readDismissed(projectId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY(projectId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === "string")) : new Set();
  } catch {
    // localStorage có thể bị chặn (private mode / quota) — coi như chưa bỏ gì.
    return new Set();
  }
}

function writeDismissed(projectId: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(DISMISS_KEY(projectId), JSON.stringify([...ids]));
  } catch {
    // Bỏ qua: dismiss chỉ sống trong phiên này.
  }
}

function buildSnapshot(
  notes: DraftNote[],
  tracks: DraftTrack[],
  meta: DraftMeta,
): Parameters<typeof analyze>[0] {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    meta,
    tracks,
    notes,
  };
}

function InsightRow({
  insight,
  onDismiss,
  onJumpToBar,
}: {
  insight: Insight;
  onDismiss: (id: string) => void;
  onJumpToBar: (bar: number) => void;
}) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHead}>
        <span style={styles.cardTitle}>{insight.title}</span>
        <button
          style={styles.dismissBtn}
          onClick={() => onDismiss(insight.id)}
          title="Bỏ insight này cho dự án hiện tại"
          aria-label={`Bỏ ${insight.title}`}
        >
          <X size={11} />
        </button>
      </div>
      <p style={styles.cardDesc}>{insight.description}</p>
      {insight.alternatives && insight.alternatives.length > 0 && (
        <p style={styles.cardAlt}>
          Khả năng khác: {insight.alternatives.join(" hoặc ")}
        </p>
      )}
      {insight.fromBar !== null && insight.toBar !== null && (
        <button
          style={styles.jumpBtn}
          onClick={() => onJumpToBar(insight.fromBar!)}
          title={
            insight.fromBar === insight.toBar
              ? `Đưa đầu phát tới ô nhịp ${insight.fromBar}`
              : `Đưa đầu phát tới ô nhịp ${insight.fromBar} (vùng ${insight.fromBar}–${insight.toBar})`
          }
        >
          <MapPin size={12} />
          Đi tới ô nhịp {insight.fromBar === insight.toBar ? insight.fromBar : `${insight.fromBar}–${insight.toBar}`}
        </button>
      )}
    </div>
  );
}

export function InsightPanel({ projectId, notes, tracks, meta: metaProp, onJumpToBar }: InsightPanelProps) {
  // Editor tạo object meta mới ở mỗi lần render (kể cả khi đang phát nhạc);
  // khoá theo giá trị để debounce 500 ms không bị reset liên tục.
  const { tempo, ppq } = metaProp;
  const [numerator, denominator] = metaProp.timeSignature;
  const meta = useMemo<DraftMeta>(
    () => ({ tempo, ppq, timeSignature: [numerator, denominator] }),
    [tempo, ppq, numerator, denominator],
  );

  // 4.1: bỏ insight — lưu theo dự án (khoá stave_insight_dismissed_<projectId>).
  // Component được render với key=projectId nên initializer chạy lại khi đổi project.
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed(projectId));

  // 3.1: debounce 500 ms khi đang sửa. `computed` giữ cả result lẫn "vùng dữ liệu"
  // đã phân tích; `stale` (dưới, tính trong render) = dữ liệu đã đổi mà result
  // chưa kịp chạy lại. Chỉ setState trong callback async (setTimeout) — đúng
  // react-hooks/set-state-in-effect.
  const [computed, setComputed] = useState<{
    result: ReturnType<typeof analyze>;
    notes: DraftNote[];
    tracks: DraftTrack[];
    meta: DraftMeta;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setComputed({
        result: analyze(buildSnapshot(notes, tracks, meta)),
        notes,
        tracks,
        meta,
      });
    }, 500);
    return () => clearTimeout(t);
  }, [notes, tracks, meta, projectId]);

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeDismissed(projectId, next);
      return next;
    });
  }

  const result = computed?.result ?? null;
  const stale =
    computed !== null &&
    (computed.notes !== notes || computed.tracks !== tracks || computed.meta !== meta);

  const noteBarCount = useMemo(() => {
    const tpb = ticksPerBar(meta);
    return new Set(notes.map((n) => Math.floor(n.start / tpb) + 1)).size;
  }, [notes, meta]);

  const insights = (result?.insights ?? []).filter((i) => !dismissed.has(i.id));
  const keyInsight = insights.find((i) => i.kind === "key");
  const progressions = insights.filter((i) => i.kind === "progression");
  const cadences = insights.filter((i) => i.kind === "cadence");
  const lowConfidence =
    result !== null && !result.insufficient && noteBarCount < CONFIDENT_NOTE_BARS;

  return (
    <aside style={styles.root}>
      <div style={styles.header}>
        <div style={styles.title}>
          <Lightbulb size={15} color={DC.accent} /> Insight
        </div>
        <p style={styles.subtitle}>
          Nhận diện tông, tiến trình hợp âm và kết trong bản nhạc — chỉ mô tả
          những gì đã có, không gợi ý sửa.
        </p>
      </div>

      <div style={styles.body}>
        {result === null ? (
          stale ? (
            <p style={styles.stateText}>Đang cập nhật…</p>
          ) : (
            <p style={styles.stateText}>Đang phân tích…</p>
          )
        ) : result.insufficient ? (
          <div style={styles.stateBox}>
            <Lightbulb size={20} color={DC.textMuted} />
            <p style={styles.stateTitle}>Chưa đủ nốt để nhận diện</p>
            <p style={styles.stateText}>
              Thêm nốt vào ít nhất 2 ô nhịp để panel chỉ ra tông, tiến trình
              hợp âm và kết.
            </p>
          </div>
        ) : (
          <>
            {lowConfidence && (
              <div style={styles.confidenceNote}>
                Đoạn mới {noteBarCount} ô nhịp (dưới {CONFIDENT_NOTE_BARS}) — nhận
                tông có thể chưa chắc.
              </div>
            )}

            {keyInsight ? (
              <InsightRow
                insight={{
                  ...keyInsight,
                  // Kết quả nhận tông không khẳng định — nói "có vẻ là".
                  title: keyInsight.title.replace(/^Tông: /, "Tông: có vẻ là "),
                }}
                onDismiss={dismiss}
                onJumpToBar={onJumpToBar}
              />
            ) : (
              <p style={styles.stateText}>Chưa nhận ra tông nào rõ ràng.</p>
            )}

            <div style={styles.sectionLabel}>Tiến trình hợp âm</div>
            {progressions.length === 0 ? (
              <p style={styles.stateText}>
                Chưa nhận ra mẫu nào (I–V–vi–IV, vi–IV–I–V, ii–V–I…).
              </p>
            ) : (
              progressions.map((i) => (
                <InsightRow key={i.id} insight={i} onDismiss={dismiss} onJumpToBar={onJumpToBar} />
              ))
            )}

            <div style={styles.sectionLabel}>Kết (cadence)</div>
            {cadences.length === 0 ? (
              <p style={styles.stateText}>
                Không thấy kết điển hình (V–I, IV–I, V–vi) ở cuối.
              </p>
            ) : (
              cadences.map((i) => (
                <InsightRow key={i.id} insight={i} onDismiss={dismiss} onJumpToBar={onJumpToBar} />
              ))
            )}
          </>
        )}
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: 300,
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
    flexShrink: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: DC.text,
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 7,
  },
  subtitle: {
    fontSize: 11.5,
    lineHeight: 1.5,
    color: DC.textMuted,
    margin: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  stateBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "24px 16px",
    textAlign: "center",
  },
  stateTitle: { fontSize: 12.5, fontWeight: 700, color: DC.text },
  stateText: { fontSize: 12, lineHeight: 1.55, color: DC.textMuted, margin: 0 },
  confidenceNote: {
    fontSize: 11.5,
    lineHeight: 1.5,
    color: DC.warning,
    background: "color-mix(in oklab, var(--warning) 12%, var(--surface))",
    border: "1px solid color-mix(in oklab, var(--warning) 30%, var(--surface))",
    borderRadius: 8,
    padding: "7px 10px",
    margin: 0,
  },
  sectionLabel: {
    font: `700 11px ${DC.mono}`,
    letterSpacing: ".07em",
    textTransform: "uppercase",
    color: DC.textMuted,
    marginTop: 10,
    marginBottom: 2,
  },
  card: {
    border: `1px solid ${DC.border}`,
    borderRadius: 9,
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  cardHead: { display: "flex", alignItems: "flex-start", gap: 6 },
  cardTitle: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: 600,
    color: DC.text,
    lineHeight: 1.4,
  },
  cardDesc: { fontSize: 11.5, lineHeight: 1.55, color: DC.textMuted, margin: 0 },
  cardAlt: {
    fontSize: 11.5,
    color: DC.accent,
    background: DC.accentSoft,
    borderRadius: 6,
    padding: "4px 8px",
    margin: 0,
  },
  dismissBtn: {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    borderRadius: 5,
    border: "none",
    background: "transparent",
    color: DC.textMuted,
    cursor: "pointer",
  },
  jumpBtn: {
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: DC.accent,
    border: "none",
    borderRadius: 7,
    padding: "5px 10px",
    fontSize: 11.5,
    fontWeight: 600,
    color: "#fff",
    cursor: "pointer",
  },
};
