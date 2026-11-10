"use client";

import { useEffect, useState } from "react";
import { GitMerge, TriangleAlert } from "lucide-react";
import {
  getMergeRisk,
  type MergeRiskLevel,
  type MergeRiskResult,
} from "../../lib/api-client";
import { Badge } from "../ui/badge";
import { useI18n } from "../../context/i18n-context";

/**
 * UC-71 — cảnh báo rủi ro merge. Chỉ đọc và giải thích, KHÔNG chặn việc hợp
 * nhất. Đang tải hoặc tải lỗi thì hiện một dòng trạng thái ngắn (không im
 * lặng, không chặn nút Hợp nhất). Dùng lại được ở trang pull request bằng cách
 * truyền `sourceBranchId` và `targetBranchId`.
 */
export function MergeRiskPanel({
  sourceBranchId,
  targetBranchId,
}: {
  sourceBranchId: string;
  targetBranchId: string;
}) {
  const { t, lang } = useI18n();
  const [state, setState] = useState<{
    key: string;
    result: MergeRiskResult | null;
    failed: boolean;
  } | null>(null);

  const requestKey = `${sourceBranchId}:${targetBranchId}:${lang}`;

  useEffect(() => {
    let cancelled = false;

    getMergeRisk(sourceBranchId, targetBranchId, lang)
      .then((data) => {
        if (!cancelled) setState({ key: requestKey, result: data, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ key: requestKey, result: null, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [sourceBranchId, targetBranchId, requestKey, lang]);

  const stale = !state || state.key !== requestKey;
  if (stale) {
    return (
      <p role="status" className="mt-3 text-xs text-muted">
        {t("mrisk.loading")}
      </p>
    );
  }
  if (state.failed || !state.result) {
    return (
      <p role="status" data-testid="merge-risk-unavailable" className="mt-3 text-xs text-muted">
        {t("mrisk.unavailable")}
      </p>
    );
  }

  const { level, metrics, explanation } = state.result;

  return (
    <div
      data-testid="merge-risk-panel"
      data-level={level}
      className="mt-3 rounded-card border border-border bg-surface-subtle p-3"
    >
      <div className="flex items-center gap-2">
        <span className="text-foreground">
          {level === "low" ? (
            <GitMerge size={14} aria-hidden />
          ) : (
            <TriangleAlert size={14} aria-hidden />
          )}
        </span>
        <span className="text-[13px] font-semibold text-foreground">
          {t("mrisk.title")}
        </span>
        <Badge variant={LEVEL_VARIANT[level]}>{t(`mrisk.level.${level}`)}</Badge>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("mrisk.sourceChanged")}</dt>
          <dd className="font-semibold text-foreground">{metrics.sourceChanged}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("mrisk.targetChanged")}</dt>
          <dd className="font-semibold text-foreground">{metrics.targetChanged}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("mrisk.overlap")}</dt>
          <dd className="font-semibold text-foreground">{metrics.overlap}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("mrisk.conflicts")}</dt>
          <dd className="font-semibold text-foreground">{metrics.conflictsCount}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("mrisk.sourceCommits")}</dt>
          <dd className="font-semibold text-foreground">{metrics.sourceCommits}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("mrisk.targetCommits")}</dt>
          <dd className="font-semibold text-foreground">{metrics.targetCommits}</dd>
        </div>
      </dl>

      {explanation && (
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          {explanation}
        </p>
      )}
    </div>
  );
}

/** Màu badge theo mức rủi ro. */
const LEVEL_VARIANT: Record<MergeRiskLevel, "success" | "warning" | "danger"> = {
  low: "success",
  medium: "warning",
  high: "danger",
};

export default MergeRiskPanel;
