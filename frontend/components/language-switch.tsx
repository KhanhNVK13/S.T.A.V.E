"use client";

import { LANGS, type Lang } from "../lib/i18n";
import { useI18n } from "../context/i18n-context";

const SHORT: Record<Lang, string> = { en: "EN", vi: "VI" };

export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("lang.group")}
      className={`inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-surface-subtle p-0.5 ${className}`}
    >
      {LANGS.map((l) => {
        const active = l === lang;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            aria-label={t(l === "en" ? "lang.en" : "lang.vi")}
            title={t(l === "en" ? "lang.en" : "lang.vi")}
            onClick={() => setLang(l)}
            className={`h-full rounded px-2 text-xs font-bold tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
              active ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {SHORT[l]}
          </button>
        );
      })}
    </div>
  );
}
