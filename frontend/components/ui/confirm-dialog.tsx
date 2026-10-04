"use client";

import React from "react";
import { Button } from "./button";
import { Dialog, DialogActions, DialogError } from "./dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Dùng nút variant "danger" cho hành động phá huỷ (xoá, không thể hoàn tác). */
  danger?: boolean;
  loading?: boolean;
  confirmDisabled?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Popup xác nhận dùng chung trong app — thay cho `window.confirm()` gốc của
 * trình duyệt: giao diện không kiểm soát được (không theo design system),
 * chặn toàn bộ tab/thread, và không thể tuỳ biến nút/label.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  danger = false,
  loading = false,
  confirmDisabled = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      closeDisabled={loading}
      role="alertdialog"
      className="max-w-sm p-6"
    >
      <div className="mb-6 text-[13px] leading-relaxed text-muted">{message}</div>
      <DialogError message={error} />
      <DialogActions>
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={loading || confirmDisabled}>
          {loading ? "Đang xử lý…" : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
