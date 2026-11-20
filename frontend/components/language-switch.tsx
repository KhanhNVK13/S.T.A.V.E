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
      className={`inline-flex h-8 shrink-0 items-center rounded-full border border-border-strong p-0.5 ${className}`}
    >
      {LANGS.map((l) => {
        const active = l === lang;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            aria-label={`${SHORT[l]} ${t(l === "en" ? "lang.en" : "lang.vi")}`}
            title={t(l === "en" ? "lang.en" : "lang.vi")}
            onClick={() => setLang(l)}
            className={`h-full rounded-full px-2.5 text-xs font-semibold tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
              active ? "bg-foreground text-background" : "text-muted hover:text-foreground"
            }`}
          >
            {SHORT[l]}
          </button>
        );
      })}
    </div>
  );
}
