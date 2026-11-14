"use client";

import type { MergeResolutionRecord } from "@stave/shared-types";
import { useT } from "../../context/i18n-context";
import { RESOLUTION_KEYS, summarizeResolutions } from "../../lib/merge-resolutions";

export function MergeResolutionsSummary({ records }: { records: readonly MergeResolutionRecord[] | null | undefined }) {
  const t = useT();
  const { total, counts } = summarizeResolutions(records);
  if (total === 0) return null;
  return (
    <section aria-label={t("mres.title")} className="rounded-card border border-border bg-surface-subtle px-4 py-3">
      <p className="text-xs font-semibold">
        {t("mres.title")} · {t("mres.total", { n: total })}
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {counts.map((c) => (
          <li key={c.choice}>{t(RESOLUTION_KEYS[c.choice], { n: c.n })}</li>
        ))}
      </ul>
    </section>
  );
}
