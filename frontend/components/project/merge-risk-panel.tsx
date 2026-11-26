"use client";

import { useCallback, useEffect, useState } from "react";
import { GitMerge, TriangleAlert } from "lucide-react";
import {
  getMergeRisk,
  type AiExplanationSource,
  type MergeRiskLevel,
  type MergeRiskResult,
} from "../../lib/api-client";
import { AiActionButton, AiCallout } from "../ai/ai-ui";
import { Badge } from "../ui/badge";
import { useI18n } from "../../context/i18n-context";

/**
 * Cảnh báo rủi ro hợp nhất — chỉ đọc và giải thích, không chặn thao tác hợp nhất.
 * Số liệu rule-based tải ngay; diễn giải AI gọi theo yêu cầu (bấm nút).
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

    getMergeRisk(sourceBranchId, targetBranchId, lang, { explain: false })
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

  const requestAiExplanation = useCallback(async () => {
    const full = await getMergeRisk(sourceBranchId, targetBranchId, lang, {
      explain: true,
    });
    return {
      explanation: full.explanation,
      explanationSource: full.explanationSource ?? (full.explanation ? "ai" : null),
    };
  }, [sourceBranchId, targetBranchId, lang]);

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

  return (
    <MergeRiskView
      key={requestKey}
      result={state.result}
      onRequestAiExplanation={requestAiExplanation}
    />
  );
}

/** Hiển thị kết quả đã có sẵn (trang pull request nhận số liệu cùng phản hồi chi tiết). */
export function MergeRiskView({
  result,
  onRequestAiExplanation,
}: {
  result: {
    level: MergeRiskLevel;
    metrics: MergeRiskResult["metrics"];
    explanation?: string | null;
    explanationSource?: AiExplanationSource;
  };
  onRequestAiExplanation?: () => Promise<{
    explanation: string | null;
    explanationSource?: AiExplanationSource;
  }>;
}) {
  const { t } = useI18n();
  const { level, metrics } = result;
  const initialExplanation = "explanation" in result ? (result.explanation ?? null) : null;
  const [aiState, setAiState] = useState<{
    explanation: string | null;
    loading: boolean;
    unavailable: boolean;
  }>({
    explanation: initialExplanation,
    loading: false,
    unavailable: false,
  });

  async function requestAi() {
    if (!onRequestAiExplanation) return;
    setAiState((prev) => ({ ...prev, loading: true, unavailable: false }));
    try {
      const res = await onRequestAiExplanation();
      setAiState({
        explanation: res.explanation,
        loading: false,
        unavailable: res.explanation === null,
      });
    } catch {
      setAiState((prev) => ({
        ...prev,
        loading: false,
        unavailable: true,
      }));
    }
  }

  const activeExplanation = aiState.explanation;

  return (
    <div
      data-testid="merge-risk-panel"
      data-level={level}
      className="mt-3 rounded-card border border-border bg-surface-subtle p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-foreground">
            {level === "low" ? (
              <GitMerge size={14} aria-hidden="true" />
            ) : (
              <TriangleAlert size={14} aria-hidden="true" />
            )}
          </span>
          <span className="text-[13px] font-semibold text-foreground">
            {t("mrisk.title")}
          </span>
          <Badge variant={LEVEL_VARIANT[level]}>{t(`mrisk.level.${level}`)}</Badge>
        </div>

        {level !== "low" && onRequestAiExplanation && !activeExplanation && (
          <AiActionButton
            compact
            label={t("mrisk.aiExplain")}
            loading={aiState.loading}
            onClick={() => void requestAi()}
            testId="merge-risk-ai-btn"
          />
        )}
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

      {level === "low" && activeExplanation && (
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          {activeExplanation}{" "}
          <span className="text-xs text-muted/80">({t("mrisk.aiRuleNote")})</span>
        </p>
      )}

      {level !== "low" && (activeExplanation || aiState.loading || aiState.unavailable) && (
        <AiCallout
          className="mt-2.5"
          title={t("mrisk.aiTitle")}
          loading={aiState.loading}
          unavailable={aiState.unavailable && !activeExplanation}
          text={activeExplanation}
          onRegenerate={onRequestAiExplanation ? () => void requestAi() : undefined}
          regenerating={aiState.loading}
          subtitle={t("ai.objectiveNote")}
          testId="merge-risk-ai-callout"
        />
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
