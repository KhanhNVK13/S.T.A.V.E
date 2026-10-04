"use client";

import React, { useId } from "react";
import { useDialog } from "../../lib/use-dialog";

interface DialogProps {
  open?: boolean;
  title: React.ReactNode;
  titleClassName?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  role?: "dialog" | "alertdialog";
  className?: string;
  children: React.ReactNode;
}

export function Dialog({
  open = true,
  title,
  titleClassName = "text-foreground",
  onClose,
  closeDisabled = false,
  role = "dialog",
  className = "max-w-md p-6",
  children,
}: DialogProps) {
  const titleId = useId();
  const ref = useDialog<HTMLDivElement>({ open, onClose, closeDisabled });
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4 py-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !closeDisabled) onClose();
      }}
    >
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`max-h-full w-full overflow-y-auto rounded-card border border-border bg-surface outline-none ${className}`}
      >
        <h2 id={titleId} className={`mb-4 text-lg font-semibold ${titleClassName}`}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function DialogError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-4 rounded-card bg-danger-muted px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

export function DialogActions({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-3">{children}</div>;
}
