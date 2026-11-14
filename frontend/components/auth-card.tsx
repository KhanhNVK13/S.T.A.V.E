"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { withErrorProps } from "./ui/form";
import { LanguageSwitch } from "./language-switch";
import { useT } from "../context/i18n-context";

const MAIN: [number, number][] = [
  [40, 150],
  [190, 122],
  [330, 136],
  [470, 94],
  [640, 108],
  [800, 66],
  [960, 94],
  [1130, 52],
];
const BRANCH: [number, number][] = [
  [470, 94],
  [600, 164],
  [760, 178],
  [900, 150],
];

const HALOS = [
  { key: "accent", color: "var(--accent)" },
  { key: "star", color: "var(--foreground)" },
  { key: "branch", color: "var(--teal)" },
] as const;

function Constellation({ className = "" }: { className?: string }) {
  const haloId = useId();
  return (
    <svg aria-hidden="true" viewBox="0 0 1180 230" preserveAspectRatio="xMidYMid slice" className={className}>
      <defs>
        {HALOS.map(({ key, color }) => (
          <radialGradient key={key} id={`${haloId}-${key}`}>
            <stop offset="0" stopColor={color} stopOpacity="0.5" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      {[66, 94, 122, 150, 178].map((y) => (
        <line key={y} x1="0" x2="1180" y1={y} y2={y} className="stroke-foreground/15" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      <polyline
        points={MAIN.map((p) => p.join(",")).join(" ")}
        fill="none"
        className="stroke-foreground/55"
        strokeWidth="1.3"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={BRANCH.map((p) => p.join(",")).join(" ")}
        fill="none"
        className="stroke-teal/70"
        strokeWidth="1.3"
        vectorEffect="non-scaling-stroke"
      />
      {MAIN.map(([x, y], i) => (
        <g key={`m-${x}`} className={i % 3 === 0 ? "text-accent" : "text-foreground"}>
          <circle cx={x} cy={y} r="18" fill={`url(#${haloId}-${i % 3 === 0 ? "accent" : "star"})`} />
          <circle cx={x} cy={y} r="4" fill="currentColor" />
        </g>
      ))}
      {BRANCH.slice(1).map(([x, y]) => (
        <g key={`b-${x}`} className="text-teal">
          <circle cx={x} cy={y} r="16" fill={`url(#${haloId}-branch)`} />
          <circle cx={x} cy={y} r="4" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

/**
 * Khung cho 4 trang xác thực: một thẻ form căn giữa, phía sau là chòm sao trên
 * khuông nhạc chạy ngang màn hình. Thẻ dùng nền bề mặt hơi trong suốt (không
 * làm mờ) để nền sao lộ ra.
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
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-5 py-10 sm:py-14">
      <Constellation className="pointer-events-none absolute inset-x-0 top-1/2 h-[230px] w-full -translate-y-1/2 opacity-90 sm:h-[300px]" />

      <div className="relative w-full max-w-[420px]">
        <div className="mb-4 flex items-center justify-end">
          <LanguageSwitch />
        </div>
        <div className="relative rounded-panel border border-border bg-surface p-6 shadow-card motion-safe:transition-[opacity,transform] motion-safe:duration-500 motion-safe:ease-out starting:translate-y-3 starting:opacity-0 sm:p-8">
          <span aria-hidden="true" className="star-dot absolute -top-1 right-8 text-accent" />
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          {title && <h1 className="mb-1.5 mt-2 text-[28px] font-light leading-tight tracking-[-0.03em]">{title}</h1>}
          {description && <p className="mb-6 text-sm text-muted">{description}</p>}
          {children}
        </div>
        <p className="mt-5 text-center text-[13px] text-muted">{t("auth.tagline")}</p>
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
      <span className="text-[13px] font-medium">{label}</span>
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
  "h-11 rounded-field border border-border-strong bg-background/70 px-3 text-base transition-colors placeholder:text-muted hover:border-foreground/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 sm:h-10 sm:text-sm";

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
      className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-border-strong text-[13px] font-medium transition-colors hover:border-foreground hover:bg-foreground/10"
    >
      <GoogleLogo />
      {t("auth.google")}
    </button>
  );
}
