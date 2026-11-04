"use client";

import { useT } from "../../context/i18n-context";
import { useSpaceScene } from "../space/use-space-scene";

export function HomeWait() {
  const t = useT();
  useSpaceScene("quiet", 0);
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-page px-5 py-8">
      <span className="sr-only">{t("ui.loading")}</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="h-9 w-72 max-w-full animate-pulse rounded-md bg-surface-subtle" />
        <div className="h-24 animate-pulse rounded-card border border-border bg-surface/85" />
        <div className="h-48 animate-pulse rounded-card border border-border bg-surface/85" />
      </div>
    </div>
  );
}
