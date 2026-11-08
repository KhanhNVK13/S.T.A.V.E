"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { withErrorProps } from "./ui/form";
import { Logo } from "./ui/logo";
import { LanguageSwitch } from "./language-switch";
import { useT } from "../context/i18n-context";

const STARS: [number, number][] = [
  [30, 150],
  [100, 110],
  [170, 130],
  [250, 70],
  [330, 90],
  [410, 40],
];

function Constellation({ className = "" }: { className?: string }) {
  const haloId = useId();
  return (
    <svg aria-hidden viewBox="0 0 460 200" className={className}>
      <defs>
        <radialGradient id={haloId}>
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[60, 80, 100, 120, 140].map((y) => (
        <line key={y} x1="0" x2="460" y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
      ))}
      <polyline
        points={STARS.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="1.2"
      />
      {STARS.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="16" fill={`url(#${haloId})`} />
          <circle cx={x} cy={y} r="3" fill="var(--foreground)" />
        </g>
      ))}
    </svg>
  );
}

/**
 * Khung 2 cột cho 4 trang xác thực: cột trái là mảng thương hiệu (ẩn trên
 * mobile), cột phải là thẻ form. Thẻ dùng nền bề mặt hơi trong suốt để nền sao
 * của theme tối lộ ra phía sau (không làm mờ), kèm một vòng sáng nhỏ ở góc.
 */
export function AuthCard({
  title,
  eyebrow,
  description,
  children,
}: {
  title?: string;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="hidden flex-col justify-center border-r border-border bg-surface-subtle/50 p-[9%] lg:flex">
        <Logo />
        <p className="mt-6 max-w-[360px] text-[28px] font-bold leading-[1.25]">
          {t("auth.tagline")}
        </p>
        <Constellation className="mt-6 w-full max-w-[540px]" />
      </div>

      <div className="mx-auto w-full max-w-[430px] px-6 py-12 sm:px-11">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="lg:hidden">
            <Logo />
          </div>
          <LanguageSwitch className="ml-auto" />
        </div>
        <div className="relative rounded-card border border-border bg-surface/80 p-6 motion-safe:transition-[opacity,transform] motion-safe:duration-[800ms] motion-safe:ease-out starting:translate-y-3 starting:opacity-0">
          <span
            aria-hidden
            className="absolute -top-1 right-6 h-2 w-2 rounded-full bg-accent shadow-[0_0_14px_5px_var(--accent)]"
          />
          {eyebrow && (
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">{eyebrow}</p>
          )}
          {title && <h1 className="my-1 text-[23px] font-semibold tracking-tight">{title}</h1>}
          {description && <p className="mb-6 text-xs text-muted">{description}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

export function AuthField({
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
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </label>
  );
}

export const AUTH_INPUT_CLASS =
  "h-10 rounded-md border border-border-strong bg-background px-2.5 text-base sm:h-[37px] sm:text-[13px] placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-muted";

export function AuthDivider() {
  const t = useT();
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted">{t("auth.or")}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Logo thương hiệu Google: bốn màu cố định theo quy định thương hiệu, chỉ khai ở đây. */
function GoogleLogo() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.92l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.38l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.62l4 3.1C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}

export function GoogleButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[37px] w-full items-center justify-center gap-2 rounded-md border border-border-strong bg-surface text-xs font-semibold hover:bg-surface-subtle"
    >
      <GoogleLogo />
      {t("auth.google")}
    </button>
  );
}
