import { cloneElement, isValidElement, useId } from "react";
import type { ReactElement, ReactNode } from "react";

export const INPUT_CLASS =
  "rounded-field border border-border-strong bg-surface-subtle/60 px-3 py-2 text-base transition-colors placeholder:text-muted hover:border-foreground/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:bg-surface-subtle disabled:text-muted disabled:hover:border-border-strong sm:text-[13px]";

export function withErrorProps(children: ReactNode, errorId: string): ReactNode {
  if (!isValidElement(children)) return children;
  return cloneElement(children as ReactElement<Record<string, unknown>>, {
    "aria-invalid": true,
    "aria-describedby": errorId,
  });
}

export function FieldError({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} role="alert" className="text-xs text-danger">
      {children}
    </p>
  );
}

export function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string | null;
}) {
  const errorId = useId();
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      {error ? withErrorProps(children, errorId) : children}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </label>
  );
}
