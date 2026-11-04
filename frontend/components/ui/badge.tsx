import type { ReactNode } from "react";

type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger" | "metal";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "border-border-strong bg-surface-subtle text-muted",
  info: "border-accent/40 bg-accent-muted text-accent",
  success: "border-success/40 bg-success-muted text-success-foreground",
  warning: "border-warning/40 bg-warning-muted text-warning-foreground",
  danger: "border-danger/40 bg-danger-muted text-danger",
  metal: "border-metal/40 bg-metal-muted text-metal-foreground",
};

export function Badge({
  variant = "neutral",
  children,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex w-max items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold leading-[17px] tracking-wide ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
