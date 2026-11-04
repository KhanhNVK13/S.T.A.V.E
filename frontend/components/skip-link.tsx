"use client";

import { useT } from "../context/i18n-context";

export function SkipLink() {
  const t = useT();
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
    >
      {t("shell.skip")}
    </a>
  );
}
