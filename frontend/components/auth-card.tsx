import type { ReactNode } from "react";
import { Logo } from "./ui/logo";
import { MiniRoll } from "./ui/mini-roll";

/**
 * Khung 2 cột cho 4 trang xác thực: cột trái là mảng thương hiệu (ẩn trên
 * mobile), cột phải là form. Khác hẳn layout phần còn lại của app (nội dung
 * trong PageHeader) — xem CLAUDE.md 4.7.
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
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="hidden flex-col justify-center border-r border-border bg-surface-subtle p-[9%] lg:flex">
        <Logo />
        <p className="mt-6 max-w-[360px] text-[28px] font-bold leading-[1.25]">
          Quản lý phiên bản cho bản nhạc đang hình thành.
        </p>
        <MiniRoll className="mt-5 w-full max-w-[540px] rounded-card border border-border" />
      </div>

      <div className="mx-auto w-full max-w-[430px] px-6 py-12 sm:px-11">
        <div className="mb-6 lg:hidden">
          <Logo />
        </div>
        {eyebrow && (
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">{eyebrow}</p>
        )}
        {title && <h1 className="my-1 text-[23px] font-semibold tracking-tight">{title}</h1>}
        {description && <p className="mb-6 text-xs text-muted">{description}</p>}
        {children}
      </div>
    </div>
  );
}

export function AuthField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold">{label}</span>
      {children}
    </label>
  );
}

export const AUTH_INPUT_CLASS =
  "h-[37px] rounded-md border border-border bg-background px-2.5 text-xs placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-muted";

export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] text-muted">hoặc</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[37px] w-full items-center justify-center gap-2 rounded-md border border-border bg-surface text-xs font-semibold hover:bg-surface-subtle"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24">
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
      Đăng nhập với Google
    </button>
  );
}
