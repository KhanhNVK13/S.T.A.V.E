import type { ReactNode } from "react";

type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger" | "metal";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "bg-foreground/10 text-muted",
  info: "bg-teal-muted text-teal",
  success: "bg-success-muted text-success-foreground",
  warning: "bg-warning-muted text-warning-foreground",
  danger: "bg-danger-muted text-danger",
  metal: "bg-metal-muted text-metal-foreground",
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
      className={`inline-flex h-[22px] w-max items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
