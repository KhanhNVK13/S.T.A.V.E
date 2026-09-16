import type { ReactNode } from "react";

type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger" | "metal";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "border-border bg-surface-subtle text-muted",
  info: "border-transparent bg-accent-muted text-accent",
  success: "border-transparent bg-success-muted text-success",
  warning: "border-transparent bg-warning-muted text-warning",
  danger: "border-transparent bg-danger-muted text-danger",
  metal: "border-transparent bg-metal-muted text-metal",
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
      className={`inline-flex w-max items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold leading-[17px] ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
