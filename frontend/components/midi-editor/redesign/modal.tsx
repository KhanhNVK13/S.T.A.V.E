/**
 * redesign/modal.tsx
 * Khung dialog dùng chung cho các hộp thoại của bản redesign (Commit UC-42,
 * Restore UC-46). Không có dialog nào trong mockup nên khung này dựng theo
 * đúng token của bản redesign (`tokens.ts`) thay vì bịa style mới.
 *
 * Không dùng `components/ui/*` của phần còn lại app vì chúng là component
 * Tailwind, còn toàn bộ MIDI Editor (cả 2 biến thể) dùng inline style.
 */
"use client";

import React, { useEffect } from "react";
import { DC } from "./tokens";

interface ModalProps {
  title: string;
  /** Escape / bấm nền — bị chặn khi đang gửi request để tránh mất thao tác dở. */
  onClose: () => void;
  closeDisabled?: boolean;
  width?: number;
  children: React.ReactNode;
}

export function Modal({
  title,
  onClose,
  closeDisabled = false,
  width = 460,
  children,
}: ModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !closeDisabled) {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, closeDisabled]);

  return (
    <div
      style={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !closeDisabled) onClose();
      }}
    >
      <div style={{ ...styles.card, width }} role="dialog" aria-label={title}>
        <div style={styles.header}>{title}</div>
        <div style={styles.body}>{children}</div>
      </div>
    </div>
  );
}

/** Hàng nút ở đáy dialog. */
export function ModalActions({ children }: { children: React.ReactNode }) {
  return <div style={styles.actions}>{children}</div>;
}

/** Hộp lỗi đỏ dùng chung trong dialog. */
export function ModalError({ message }: { message: string }) {
  return <div style={styles.error}>{message}</div>;
}

export const modalButtonStyles: Record<string, React.CSSProperties> = {
  primary: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: DC.accent,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  danger: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: DC.danger,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  ghost: {
    background: DC.surface,
    border: `1px solid ${DC.border}`,
    borderRadius: 8,
    padding: "10px 15px",
    fontWeight: 600,
    fontSize: 13,
    color: DC.text,
    cursor: "pointer",
  },
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(20, 22, 27, .45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 50,
  },
  card: {
    maxWidth: "100%",
    maxHeight: "100%",
    overflowY: "auto",
    background: DC.surface,
    border: `1px solid ${DC.border}`,
    borderRadius: 12,
    boxShadow: "0 18px 40px rgba(15, 42, 92, .18)",
  },
  header: {
    padding: "16px 20px",
    borderBottom: `1px solid ${DC.border}`,
    fontSize: 15,
    fontWeight: 700,
    color: DC.text,
  },
  body: { padding: 20, display: "flex", flexDirection: "column", gap: 14 },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 2,
  },
  error: {
    background: DC.dangerSoft,
    border: `1px solid ${DC.dangerBorder}`,
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 12.5,
    lineHeight: 1.5,
    color: DC.danger,
    fontWeight: 600,
  },
};
