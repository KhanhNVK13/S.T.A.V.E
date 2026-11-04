/**
 * redesign/restore-dialog.tsx — UC-46 Restore Previous Version.
 *
 * Hộp thoại xác nhận BẮT BUỘC trước khi khôi phục, vì thao tác này:
 *   1. ghi thêm 1 commit mới vào lịch sử (BR-47 — không xoá gì cả), và
 *   2. ghi đè bản nháp đang mở bằng snapshot của phiên bản được chọn.
 * SRS yêu cầu cảnh báo khi draft còn thay đổi chưa lưu hoặc chưa commit — cảnh
 * báo đó là khối đỏ bên dưới.
 */
"use client";

import React from "react";
import { History } from "lucide-react";
import type { CommitWithAuthor } from "../../../lib/api-client";
import { formatRelativeTime } from "../../../lib/format-date";
import { Modal, ModalActions, ModalError, modalButtonStyles } from "./modal";
import { DC } from "./tokens";
import { useI18n } from "../../../context/i18n-context";

interface RestoreDialogProps {
  commit: CommitWithAuthor;
  /** Bản nháp còn thay đổi chưa lưu xuống server hay không. */
  hasUnsavedChanges: boolean;
  uncommittedCount: number;
  submitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function RestoreDialog({
  commit,
  hasUnsavedChanges,
  uncommittedCount,
  submitting,
  error,
  onConfirm,
  onClose,
}: RestoreDialogProps) {
  const { t, tx } = useI18n();
  return (
    <Modal
      title={t("rd.title")}
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
            {t("rd.meta", { tracks: commit.snapshot.tracks.length, notes: commit.snapshot.notes.length })}
          </span>
        </div>
      </div>

      <ul style={styles.list}>
        <li>
          {tx("rd.keep", { strong: <strong>{t("rd.keepStrong")}</strong> })}
        </li>
        <li>
          {t("rd.replace")}
        </li>
      </ul>

      {(hasUnsavedChanges || uncommittedCount > 0) && (
        <div role="alert" style={styles.warn}>
          {uncommittedCount > 0
            ? t("rd.warnUncommitted", { n: uncommittedCount })
            : t("rd.warnUnsaved")}{" "}
          {t("rd.warnTail")}
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
          {t("ui.cancel")}
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
          {submitting ? t("rd.restoring") : t("chist.restore")}
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
    fontSize: 12,
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
