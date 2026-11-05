import type { ReactNode } from "react";

export type DiffKind = "add" | "remove" | "modify";

export const DIFF_GLYPH: Record<DiffKind, string> = { add: "+", remove: "−", modify: "~" };

export const DIFF_TEXT: Record<DiffKind, string> = {
  add: "text-diff-add-foreground",
  remove: "text-diff-remove-foreground",
  modify: "text-diff-modify-foreground",
};

const BADGE: Record<DiffKind, string> = {
  add: "border-diff-add/40 bg-diff-add-muted text-diff-add-foreground",
  remove: "border-diff-remove/40 bg-diff-remove-muted text-diff-remove-foreground",
  modify: "border-diff-modify/40 bg-diff-modify-muted text-diff-modify-foreground",
};

export function DiffBadge({
  kind,
  signed = true,
  children,
}: {
  kind: DiffKind;
  signed?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex w-max items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold leading-[17px] tracking-wide ${BADGE[kind]}`}
    >
      {signed && (
        <span aria-hidden="true" className="font-mono">
          {DIFF_GLYPH[kind]}
        </span>
      )}
      {children}
    </span>
  );
}
