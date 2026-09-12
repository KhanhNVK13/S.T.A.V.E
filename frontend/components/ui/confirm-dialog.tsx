"use client";

import React from "react";
import { Card } from "./card";
import { Button } from "./button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Dùng nút variant "danger" cho hành động phá huỷ (xoá, không thể hoàn tác). */
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Popup xác nhận dùng chung trong app — thay cho `window.confirm()` gốc của
 * trình duyệt: giao diện không kiểm soát được (không theo design system),
 * chặn toàn bộ tab/thread, và không thể tuỳ biến nút/label.
 *
 * Theo đúng convention overlay đã có sẵn ở `app/projects/page.tsx` (dialog
 * xác nhận lưu trữ) và `app/admin/users/page.tsx` (dialog suspend/xoá):
 * `bg-slate-900/40` phủ toàn màn hình + `Card` trắng căn giữa.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onMouseDown={(e) => {
        // Bấm ra ngoài card để huỷ — không cho phép khi đang xử lý, tránh
        // đóng dở dang một request đang gửi.
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <Card className="w-full max-w-sm p-6" role="alertdialog" aria-modal="true">
        <h3 className="mb-2 text-lg font-semibold text-slate-900">{title}</h3>
        <div className="mb-6 text-sm leading-relaxed text-slate-500">{message}</div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={loading}>
            {loading ? "Đang xử lý..." : confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
