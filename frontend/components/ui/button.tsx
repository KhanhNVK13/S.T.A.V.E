import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-accent font-semibold text-accent-foreground hover:bg-accent-hover",
  secondary:
    "border border-border-strong bg-transparent font-medium text-foreground hover:border-foreground hover:bg-foreground/10",
  ghost: "border border-transparent font-medium text-muted hover:bg-foreground/10 hover:text-foreground",
  danger: "border border-danger/70 bg-transparent font-medium text-danger hover:bg-danger-muted",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const BASE_CLASS =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] transition-[background-color,border-color,color,transform] duration-200 ease-out motion-reduce:transition-none";

export function buttonClass(variant: ButtonVariant = "primary"): string {
  return `${BASE_CLASS} active:scale-[0.97] motion-reduce:active:scale-100 ${VARIANT_CLASSES[variant]}`;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${BASE_CLASS} active:enabled:scale-[0.97] motion-reduce:active:enabled:scale-100 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
