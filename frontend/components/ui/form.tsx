import type { ReactNode } from "react";

export const INPUT_CLASS =
  "rounded-md border border-border bg-background px-2.5 py-2 text-xs placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-muted disabled:bg-surface-subtle disabled:text-muted";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold">{label}</span>
      {children}
    </label>
  );
}
