import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border border-accent bg-accent text-accent-foreground hover:border-accent-hover hover:bg-accent-hover disabled:opacity-50",
  secondary:
    "border border-border-strong bg-surface-subtle/60 text-foreground hover:bg-surface-muted disabled:opacity-50",
  ghost: "border border-transparent text-muted hover:bg-surface-subtle hover:text-foreground disabled:opacity-50",
  danger:
    "border border-danger/70 bg-transparent text-danger hover:bg-danger-muted disabled:opacity-50",
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
      className={`inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-semibold transition-[background-color,border-color,color,transform] duration-200 active:enabled:scale-[0.98] motion-reduce:transition-none motion-reduce:active:enabled:scale-100 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
