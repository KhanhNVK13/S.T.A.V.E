"use client";

import React, { useId, useState } from "react";
import { useDialog } from "../../lib/use-dialog";
import { useT } from "../../context/i18n-context";
import { Button } from "./button";

interface DialogProps {
  open?: boolean;
  title: React.ReactNode;
  titleClassName?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  dirty?: boolean;
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
  dirty = false,
  role = "dialog",
  className = "max-w-md p-6",
  children,
}: DialogProps) {
  const titleId = useId();
  const t = useT();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const requestClose = () => {
    if (dirty) setConfirmingDiscard(true);
    else onClose();
  };
  const ref = useDialog<HTMLDivElement>({ open, onClose: requestClose, closeDisabled });
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setConfirmingDiscard(false);
  }
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 px-4 py-8"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !closeDisabled) requestClose();
        }}
      >
        <div
          ref={ref}
          role={role}
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`max-h-full w-full overflow-y-auto rounded-card border border-border-strong bg-surface shadow-card outline-none ${className}`}
        >
          <h2 id={titleId} className={`mb-4 text-lg font-semibold ${titleClassName}`}>
            {title}
          </h2>
          {children}
        </div>
      </div>
      {confirmingDiscard && (
        <Dialog
          title={t("ui.discardTitle")}
          role="alertdialog"
          className="max-w-sm p-6"
          onClose={() => setConfirmingDiscard(false)}
        >
          <p className="mb-6 text-[13px] leading-relaxed text-muted">{t("ui.discardMessage")}</p>
          <DialogActions>
            <Button variant="secondary" onClick={() => setConfirmingDiscard(false)}>
              {t("ui.discardKeep")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmingDiscard(false);
                onClose();
              }}
            >
              {t("ui.discardConfirm")}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
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
