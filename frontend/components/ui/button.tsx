import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border border-accent bg-accent text-accent-foreground hover:border-accent-hover hover:bg-accent-hover disabled:opacity-50",
  secondary:
    "border border-border bg-surface hover:border-border-strong hover:bg-surface-subtle disabled:opacity-50",
  ghost: "border border-transparent text-muted hover:bg-surface-subtle hover:text-foreground disabled:opacity-50",
  danger:
    "border border-danger/40 bg-surface text-danger hover:bg-danger-muted disabled:opacity-50",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
