"use client";

import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import { useDialog } from "../../lib/use-dialog";
import { useT } from "../../context/i18n-context";

interface DiffDialogShellProps {
  title: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  closeLabel?: string;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function DiffDialogShell({
  title,
  icon,
  onClose,
  closeDisabled = false,
  closeLabel,
  header,
  footer,
  children,
}: DiffDialogShellProps) {
  const t = useT();
  const titleId = useId();
  const ref = useDialog<HTMLDivElement>({ onClose, closeDisabled });

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-background/80 backdrop-blur-sm md:items-center md:p-6">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex h-dvh w-full min-w-0 flex-col overflow-hidden border-border-strong bg-surface outline-none md:h-[min(92vh,900px)] md:max-w-7xl md:rounded-card md:border md:shadow-card"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-surface-subtle/60 px-4 py-3 md:px-6 md:py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold">
              {icon}
              {title}
            </h2>
            {header}
          </div>
          <Button variant="secondary" onClick={onClose} disabled={closeDisabled}>
            <X aria-hidden="true" className="h-3.5 w-3.5" />
            {closeLabel ?? t("ui.close")}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="border-t border-border bg-surface-subtle/60">{footer}</div>}
      </div>
    </div>
  );
}
