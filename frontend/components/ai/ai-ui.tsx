"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useI18n } from "../../context/i18n-context";

export function AiBadge({
  label,
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex h-[22px] w-max items-center gap-1 whitespace-nowrap rounded-full border border-violet/35 bg-violet-muted px-2.5 text-xs font-medium text-violet ${className}`}
    >
      <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
      {label ?? t("ai.badge")}
    </span>
  );
}

export function AiActionButton({
  label,
  loadingLabel,
  loading = false,
  disabled = false,
  compact = false,
  onClick,
  className = "",
  title,
  testId,
}: {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onClick: () => void;
  className?: string;
  title?: string;
  testId?: string;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border border-violet/45 bg-violet-muted/70 font-medium text-violet transition-colors hover:bg-violet-muted disabled:cursor-not-allowed disabled:opacity-50 ${
        compact ? "h-7 px-3 text-xs" : "h-9 px-4 text-[13px]"
      } ${className}`}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{loading ? (loadingLabel ?? t("ai.analyzing")) : label}</span>
    </button>
  );
}

function renderLines(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const allBullets =
    lines.length > 1 && lines.every((line) => /^[-•*]\s+/.test(line));
  if (allBullets) {
    return (
      <ul className="space-y-1.5 text-[13px] leading-relaxed text-foreground">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet" aria-hidden="true" />
            <span>{line.replace(/^[-•*]\s+/, "")}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{text}</p>;
}

export function AiCallout({
  title,
  badgeLabel,
  subtitle,
  loading = false,
  loadingLabel,
  unavailable = false,
  unavailableLabel,
  text,
  onRegenerate,
  regenerating = false,
  copyText,
  children,
  className = "",
  testId,
}: {
  title?: string;
  badgeLabel?: string;
  subtitle?: string;
  loading?: boolean;
  loadingLabel?: string;
  unavailable?: boolean;
  unavailableLabel?: string;
  text?: string | null;
  onRegenerate?: () => void;
  regenerating?: boolean;
  copyText?: string | null;
  children?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures cleanly.
    }
  }

  return (
    <div
      data-testid={testId}
      className={`rounded-card border border-violet/30 border-l-2 border-l-violet bg-violet-muted/25 p-3.5 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <AiBadge label={badgeLabel} />
          {title && <span className="text-[13px] font-semibold text-foreground">{title}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {copyText && !loading && (
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-surface/60 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              {copied ? (
                <Check className="h-3 w-3 text-success-foreground" aria-hidden="true" />
              ) : (
                <Copy className="h-3 w-3" aria-hidden="true" />
              )}
              {copied ? t("ai.copied") : t("ai.copy")}
            </button>
          )}
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={loading || regenerating}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-violet/35 bg-surface/60 px-2.5 text-xs font-medium text-violet transition-colors hover:bg-violet-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3 w-3 ${loading || regenerating ? "animate-spin motion-reduce:animate-none" : ""}`}
                aria-hidden="true"
              />
              {t("ai.regenerate")}
            </button>
          )}
        </div>
      </div>

      <div aria-live="polite" className="mt-2.5">
        {loading ? (
          <p role="status" className="flex items-center gap-2 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none text-violet" aria-hidden="true" />
            {loadingLabel ?? t("ai.analyzing")}
          </p>
        ) : unavailable ? (
          <p className="text-xs text-muted">{unavailableLabel ?? t("ai.unavailable")}</p>
        ) : (
          <>
            {text && renderLines(text)}
            {children}
          </>
        )}
      </div>

      {subtitle && !loading && (
        <p className="mt-2 border-t border-violet/20 pt-2 text-xs text-muted">{subtitle}</p>
      )}
    </div>
  );
}
