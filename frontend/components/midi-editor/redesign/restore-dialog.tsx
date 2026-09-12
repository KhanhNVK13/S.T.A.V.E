/**
 * redesign/restore-dialog.tsx — UC-46 Restore Previous Version.
 *
 * Hộp thoại xác nhận BẮT BUỘC trước khi khôi phục, vì thao tác này:
 *   1. ghi thêm 1 commit mới vào lịch sử (BR-47 — không xoá gì cả), và
 *   2. ghi đè bản nháp đang mở bằng snapshot của phiên bản được chọn.
 * SRS yêu cầu cảnh báo khi draft còn thay đổi chưa lưu — cảnh báo đó là khối
 * đỏ bên dưới, chỉ hiện khi đúng là còn thay đổi chưa lưu.
 */
"use client";

import React from "react";
import { History } from "lucide-react";
import type { CommitWithAuthor } from "../../../lib/api-client";
import { formatRelativeTime } from "../../../lib/format-date";
import { Modal, ModalActions, ModalError, modalButtonStyles } from "./modal";
import { DC } from "./tokens";

interface RestoreDialogProps {
  commit: CommitWithAuthor;
  /** Bản nháp còn thay đổi chưa lưu xuống server hay không. */
  hasUnsavedChanges: boolean;
  submitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function RestoreDialog({
  commit,
  hasUnsavedChanges,
  submitting,
  error,
  onConfirm,
  onClose,
}: RestoreDialogProps) {
  return (
    <Modal
      title="Khôi phục phiên bản này?"
      onClose={onClose}
      closeDisabled={submitting}
    >
      <div style={styles.commitBox}>
        <div style={styles.commitMessage}>{commit.message}</div>
        <div style={styles.commitMeta}>
          <span style={styles.mono}>{commit.id.slice(0, 8)}</span>
          <span>·</span>
          <span>{formatRelativeTime(commit.created_at)}</span>
          <span>·</span>
          <span>
            {commit.snapshot.tracks.length} track · {commit.snapshot.notes.length} note
          </span>
        </div>
      </div>

      <ul style={styles.list}>
        <li>
          Lịch sử <strong>không bị xoá</strong>: hệ thống tạo thêm 1 commit mới
          mang đúng nội dung của phiên bản này (BR-47).
        </li>
        <li>
          Bản nháp đang mở sẽ được thay bằng nội dung của phiên bản này.
        </li>
      </ul>

      {hasUnsavedChanges && (
        <div style={styles.warn}>
          Bản nháp đang có thay đổi chưa lưu — những thay đổi này sẽ bị ghi đè
          bởi bản khôi phục và không lấy lại được.
        </div>
      )}

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
          onClick={onConfirm}
          disabled={submitting}
          style={{
            ...modalButtonStyles.danger,
            opacity: submitting ? 0.6 : 1,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          <History size={15} />
          {submitting ? "Đang khôi phục…" : "Khôi phục"}
        </button>
      </ModalActions>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  commitBox: {
    background: DC.pageBg,
    border: `1px solid ${DC.border}`,
    borderRadius: 9,
    padding: 12,
  },
  commitMessage: {
    fontSize: 13,
    fontWeight: 600,
    color: DC.text,
    lineHeight: 1.5,
    wordBreak: "break-word",
  },
  commitMeta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
    marginTop: 7,
    fontSize: 11.5,
    color: DC.textMuted,
  },
  mono: { font: `600 11.5px ${DC.mono}`, color: DC.textMuted },
  list: {
    margin: 0,
    paddingLeft: 18,
    display: "flex",
    flexDirection: "column",
    gap: 7,
    fontSize: 12.5,
    lineHeight: 1.6,
    color: DC.text,
  },
  warn: {
    background: DC.dangerSoft,
    border: `1px solid ${DC.dangerBorder}`,
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 12.5,
    lineHeight: 1.55,
    color: DC.danger,
    fontWeight: 600,
  },
};
