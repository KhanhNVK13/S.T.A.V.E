"use client";

import React, { useEffect } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

export type ToastVariant = "info" | "success" | "warning" | "danger";

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  onDismiss: () => void;
  /** ms trước khi tự đóng; 0 = không tự đóng. Mặc định 4000. */
  duration?: number;
}

const ICONS: Record<ToastVariant, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: TriangleAlert,
};

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  info: "border-accent-600/30 bg-accent-50 text-accent-700",
  success: "border-success-600/30 bg-success-50 text-success-700",
  warning: "border-warning-600/30 bg-warning-50 text-warning-700",
  danger: "border-danger-600/30 bg-danger-50 text-danger-700",
};

/**
 * Popup thông báo ngắn dùng chung trong app — thay cho `window.alert()` gốc
 * của trình duyệt (chặn cả tab, không theo design system, không thể tuỳ biến
 * giao diện). Tự đóng sau `duration` ms; người dùng cũng có thể bấm X để
 * đóng ngay.
 */
export function Toast({ message, variant = "info", onDismiss, duration = 4000 }: ToastProps) {
  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  const Icon = ICONS[variant];

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-card border px-4 py-3 text-sm shadow-card ${VARIANT_CLASSES[variant]}`}
        role="status"
      >
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="flex-1">{message}</p>
        <button
          onClick={onDismiss}
          className="shrink-0 opacity-60 hover:opacity-100"
          aria-label="Đóng thông báo"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
