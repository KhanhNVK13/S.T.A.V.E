"use client";

import { useState } from "react";
import type { StorageCategoryKey, StorageCategoryUsage } from "@stave/shared-types";
import { Button } from "../ui/button";
import { getStorageUsage } from "../../lib/api-client";
import { formatBytes } from "../../lib/format-bytes";
import { useApiResource } from "../../lib/use-api-resource";
import { useI18n } from "../../context/i18n-context";
import type { TKey } from "../../lib/i18n";

const CATEGORY_LABELS: Record<StorageCategoryKey, TKey> = {
  custom_sounds: "sto.cat.custom_sounds",
  audio_sketches: "sto.cat.audio_sketches",
  avatar: "sto.cat.avatar",
};

const WARN_AT_PERCENT = 90;

function CategoryRow({ category }: { category: StorageCategoryUsage }) {
  const { t } = useI18n();
  const label = t(CATEGORY_LABELS[category.key]);
  const hasCap = category.quotaBytes !== null && category.quotaBytes > 0;
  const percent = hasCap ? Math.min(100, (category.usedBytes / (category.quotaBytes as number)) * 100) : 0;

  return (
    <li className="flex flex-col gap-1.5 border-t border-border py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-xs font-semibold">{label}</p>
        <p className="font-mono text-xs tabular-nums text-muted">
          {hasCap
            ? t("sto.usedOf", { used: formatBytes(category.usedBytes), quota: formatBytes(category.quotaBytes as number) })
            : t("sto.used", { used: formatBytes(category.usedBytes) })}
        </p>
      </div>
      {hasCap && (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          className="h-1.5 w-full overflow-hidden rounded-full bg-border"
        >
          <div
            className={`h-full rounded-full ${percent >= WARN_AT_PERCENT ? "bg-warning" : "bg-accent"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      <p className="text-xs text-muted">
        {t("sto.files", { n: category.count })} · {t("sto.maxFile", { size: formatBytes(category.maxFileBytes) })}
        {!hasCap && <> · {t("sto.noCap")}</>}
      </p>
    </li>
  );
}

export function StorageUsageSection() {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const { data, loading, error } = useApiResource(() => getStorageUsage(), [attempt], t("sto.loadError"));

  return (
    <section aria-labelledby="storage-usage-title" className="border-t border-border py-3">
      <h3 id="storage-usage-title" className="text-xs font-semibold">
        {t("sto.title")}
      </h3>
      <p className="mt-1 text-xs text-muted">{t("sto.lead")}</p>

      {loading && (
        <p role="status" className="mt-3 text-xs text-muted">
          {t("sto.loading")}
        </p>
      )}

      {!loading && error && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-xs text-danger">{error}</p>
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            {t("ui.retry")}
          </Button>
        </div>
      )}

      {!loading && data && (
        <>
          <p className="mt-3 text-xs text-muted">
            {data.plan.extraStorageBytes > 0
              ? t("sto.planExtra", { plan: data.plan.name, size: formatBytes(data.plan.extraStorageBytes) })
              : t("sto.planFree", { plan: data.plan.name })}
          </p>
          <ul className="mt-2">
            {data.categories.map((category) => (
              <CategoryRow key={category.key} category={category} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
