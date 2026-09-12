/**
 * redesign/commit-dialog.tsx — UC-42 Create Commit.
 *
 * Nút "Commit Changes" ở header của bản redesign mở hộp thoại này.
 *
 * Phần tóm tắt thay đổi CHỈ ĐẾM số note/track thêm/xoá/sửa so với commit gần
 * nhất; vẽ diff trực quan lên piano roll là UC-45 (Compare) — phiên sau.
 * Nếu branch chưa có commit nào thì KHÔNG hiện số so sánh (không có gì để so,
 * hiện "0 thay đổi" sẽ gây hiểu nhầm) mà ghi rõ đây là bản ghi đầu tiên.
 */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { GitCommitHorizontal } from "lucide-react";
import type { DraftSnapshot } from "@stave/shared-types";
import { COMMIT_MESSAGE_MAX_LENGTH } from "../../../lib/api-client";
import { summarizeChanges } from "./change-summary";
import type { ChangeCount } from "./change-summary";
import { Modal, ModalActions, ModalError, modalButtonStyles } from "./modal";
import { DC } from "./tokens";

interface CommitDialogProps {
  /** Bản nháp đang mở trên editor — đúng thứ sắp được ghi thành commit. */
  snapshot: DraftSnapshot;
  /** Snapshot của commit gần nhất trên branch; null = branch chưa có commit nào. */
  headSnapshot: DraftSnapshot | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (message: string) => void;
  onClose: () => void;
}

function countLabel(count: ChangeCount): string {
  const parts: string[] = [];
  if (count.added) parts.push(`+${count.added} thêm`);
  if (count.removed) parts.push(`−${count.removed} xoá`);
  if (count.modified) parts.push(`${count.modified} sửa`);
  return parts.length > 0 ? parts.join(" · ") : "không đổi";
}

export function CommitDialog({
  snapshot,
  headSnapshot,
  submitting,
  error,
  onSubmit,
  onClose,
}: CommitDialogProps) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const summary = headSnapshot ? summarizeChanges(headSnapshot, snapshot) : null;
  const trimmed = message.trim();
  // BR-39: 1–200 ký tự. Server vẫn validate lại; chặn ở đây chỉ để đỡ 1 vòng mạng.
  const canSubmit =
    trimmed.length > 0 &&
    message.length <= COMMIT_MESSAGE_MAX_LENGTH &&
    !submitting;

  return (
    <Modal title="Commit Changes" onClose={onClose} closeDisabled={submitting}>
      {/* ── Tóm tắt thay đổi ───────────────────────────────── */}
      <div style={styles.summaryBox}>
        {summary === null ? (
          <>
            <div style={styles.summaryTitle}>Bản ghi phiên bản đầu tiên</div>
            <div style={styles.summaryLine}>
              Branch này chưa có commit nào — toàn bộ bản nháp hiện tại
              ({snapshot.tracks.length} track · {snapshot.notes.length} note)
              sẽ được ghi lại làm mốc đầu tiên.
            </div>
          </>
        ) : (
          <>
            <div style={styles.summaryTitle}>Thay đổi so với commit gần nhất</div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryKey}>Note</span>
              <span style={styles.summaryValue}>{countLabel(summary.notes)}</span>
            </div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryKey}>Track</span>
              <span style={styles.summaryValue}>{countLabel(summary.tracks)}</span>
            </div>
            {summary.metaChanged && (
              <div style={styles.summaryRow}>
                <span style={styles.summaryKey}>Nhịp/Tempo</span>
                <span style={styles.summaryValue}>có thay đổi</span>
              </div>
            )}
            <div style={styles.summaryTotal}>
              Tổng {summary.total} thay đổi · bản nháp hiện có{" "}
              {snapshot.tracks.length} track · {snapshot.notes.length} note
            </div>
            {summary.total === 0 && (
              <div style={styles.summaryWarn}>
                Không phát hiện thay đổi nào so với commit gần nhất — server sẽ
                từ chối commit trùng (BR-40).
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Message ────────────────────────────────────────── */}
      <div>
        <div style={styles.labelRow}>
          <label htmlFor="commit-message" style={styles.label}>
            Nội dung commit
          </label>
          <span
            style={{
              ...styles.counter,
              color:
                message.length > COMMIT_MESSAGE_MAX_LENGTH
                  ? DC.danger
                  : DC.textMuted,
            }}
          >
            {message.length}/{COMMIT_MESSAGE_MAX_LENGTH}
          </span>
        </div>
        <textarea
          id="commit-message"
          ref={inputRef}
          value={message}
          maxLength={COMMIT_MESSAGE_MAX_LENGTH}
          rows={3}
          placeholder="Mô tả thay đổi của phiên bản này…"
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter gửi nhanh; Enter thường vẫn xuống dòng.
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canSubmit) {
              onSubmit(trimmed);
            }
          }}
          style={styles.textarea}
        />
        {trimmed.length === 0 && message.length > 0 && (
          <div style={styles.hint}>Nội dung commit không được để trống.</div>
        )}
      </div>

      {/* Lỗi hiển thị tại chỗ — nội dung đã gõ được giữ nguyên để sửa lại. */}
      {error && <ModalError message={error} />}

      <ModalActions>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          style={{
            ...modalButtonStyles.ghost,
            opacity: submitting ? 0.5 : 1,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          Huỷ
        </button>
        <button
          type="button"
          onClick={() => onSubmit(trimmed)}
          disabled={!canSubmit}
          style={{
            ...modalButtonStyles.primary,
            opacity: canSubmit ? 1 : 0.5,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          <GitCommitHorizontal size={15} />
          {submitting ? "Đang commit…" : "Tạo commit"}
        </button>
      </ModalActions>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  summaryBox: {
    background: DC.pageBg,
    border: `1px solid ${DC.border}`,
    borderRadius: 9,
    padding: 13,
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },
  summaryTitle: { fontSize: 12.5, fontWeight: 700, color: DC.text },
  summaryLine: { fontSize: 12.5, lineHeight: 1.6, color: DC.textMuted },
  summaryRow: { display: "flex", alignItems: "center", gap: 10 },
  summaryKey: {
    font: `700 10px ${DC.mono}`,
    letterSpacing: ".08em",
    color: DC.textMuted,
    width: 76,
    flexShrink: 0,
  },
  summaryValue: { font: `600 12px ${DC.mono}`, color: DC.text },
  summaryTotal: {
    fontSize: 12,
    color: DC.textMuted,
    borderTop: `1px solid ${DC.borderSoft}`,
    paddingTop: 7,
  },
  summaryWarn: { fontSize: 12, fontWeight: 600, color: DC.danger },
  labelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: { fontSize: 12.5, fontWeight: 600, color: DC.text },
  counter: { font: `500 11px ${DC.mono}` },
  textarea: {
    width: "100%",
    resize: "vertical",
    background: DC.surface,
    border: `1px solid ${DC.border}`,
    borderRadius: 8,
    padding: "9px 11px",
    fontSize: 13,
    lineHeight: 1.5,
    color: DC.text,
    fontFamily: "inherit",
    outline: "none",
  },
  hint: { marginTop: 6, fontSize: 12, color: DC.danger, fontWeight: 600 },
};
