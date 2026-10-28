import { cloneElement, isValidElement, useId } from "react";
import type { ReactElement, ReactNode } from "react";

export const INPUT_CLASS =
  "rounded-md border border-border bg-background px-2.5 py-2 text-base sm:text-[13px] placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-muted disabled:bg-surface-subtle disabled:text-muted";

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
      <span className="text-xs font-semibold">{label}</span>
      {error ? withErrorProps(children, errorId) : children}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </label>
  );
}
