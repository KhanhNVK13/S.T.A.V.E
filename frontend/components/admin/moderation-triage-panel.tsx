"use client";

import { useEffect, useState } from "react";
import { CheckSquare, ShieldAlert, X } from "lucide-react";
import type { ReportStatusFilter } from "@stave/shared-types";
import {
  requestModerationTriage,
  type ModerationTriageCategory,
  type ModerationTriagePriority,
  type ModerationTriageResult,
} from "../../lib/api-moderation-triage";
import { useI18n } from "../../context/i18n-context";
import type { TKey } from "../../lib/i18n";
import { AiCallout } from "../ai/ai-ui";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

const PRIORITY_VARIANT: Record<
  ModerationTriagePriority,
  "danger" | "warning" | "neutral"
> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

const PRIORITY_LABEL_KEYS: Record<ModerationTriagePriority, TKey> = {
  high: "triageAi.priority.high",
  medium: "triageAi.priority.medium",
  low: "triageAi.priority.low",
};

const CATEGORY_LABEL_KEYS: Record<ModerationTriageCategory, TKey> = {
  copyright_claim: "triageAi.category.copyright_claim",
  abusive_language: "triageAi.category.abusive_language",
  inappropriate_content: "triageAi.category.inappropriate_content",
  spam: "triageAi.category.spam",
  insufficient_info: "triageAi.category.insufficient_info",
  other: "triageAi.category.other",
};

export function ModerationTriagePanel({
  projectId,
  status = "open",
  onClose,
}: {
  projectId: string;
  status?: ReportStatusFilter;
  onClose?: () => void;
}) {
  const { t, lang } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    result: ModerationTriageResult | null;
    failed: boolean;
  } | null>(null);

  const requestKey = `${projectId}:${status}:${lang}:${attempt}`;

  useEffect(() => {
    let cancelled = false;
    requestModerationTriage({ projectId, status, lang })
      .then((result) => {
        if (!cancelled) {
          setState({ key: requestKey, result, failed: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ key: requestKey, result: null, failed: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, status, lang, requestKey]);

  const stale = !state || state.key !== requestKey;
  const data = !stale && !state.failed ? state.result : null;
  const failed = !stale && (state.failed || !state.result);

  function regenerate() {
    setAttempt((n) => n + 1);
  }

  const copyText = data?.summary
    ? data.recommendedCheck
      ? `${data.summary}\n\n${t("triageAi.recommendedCheckLabel")}: ${data.recommendedCheck}`
      : data.summary
    : null;

  return (
    <div
      data-testid="moderation-triage-panel"
      data-priority={data?.priority ?? undefined}
    >
      <AiCallout
        title={t("triageAi.title")}
        loading={stale}
        loadingLabel={t("triageAi.loading")}
        onRegenerate={regenerate}
        regenerating={stale}
        copyText={copyText}
        subtitle={t("triageAi.disclaimer")}
        testId="moderation-triage-callout"
      >
        {failed && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-xs text-danger"
          >
            <span>{t("triageAi.error")}</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={regenerate}>
                {t("ui.retry")}
              </Button>
              {onClose && (
                <Button variant="ghost" onClick={onClose}>
                  {t("triageAi.close")}
                </Button>
              )}
            </div>
          </div>
        )}

        {data && (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={PRIORITY_VARIANT[data.priority]}>
                {t(PRIORITY_LABEL_KEYS[data.priority])}
              </Badge>
              {data.categories.map((category) => (
                <Badge key={category} variant="neutral">
                  {t(
                    CATEGORY_LABEL_KEYS[category] ?? "triageAi.category.other",
                  )}
                </Badge>
              ))}
              <span className="text-xs text-muted">
                {t("rpt.reportCount", { n: data.metrics.reportCount })} ·{" "}
                {t("triageAi.distinctReporters", {
                  n: data.metrics.reporterCount,
                })}
              </span>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="ml-auto inline-flex h-7 items-center gap-1 rounded-full border border-border bg-surface/60 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                  {t("triageAi.close")}
                </button>
              )}
            </div>

            {data.summary !== null ? (
              <div className="flex flex-col gap-2">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-muted">
                    {t("triageAi.summaryLabel")}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                    {data.summary}
                  </p>
                </div>
                {data.recommendedCheck && (
                  <div className="flex items-start gap-2 rounded-card border border-violet/20 bg-surface/60 px-3 py-2 text-xs text-foreground">
                    <CheckSquare
                      aria-hidden="true"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet"
                    />
                    <div className="min-w-0 space-y-0.5">
                      <span className="font-semibold">
                        {t("triageAi.recommendedCheckLabel")}:{" "}
                      </span>
                      <span className="break-words">
                        {data.recommendedCheck}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                data-testid="triage-rule-fallback"
                className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface/60 px-3 py-2 text-xs text-muted"
              >
                <ShieldAlert
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-muted"
                />
                <span>{t("triageAi.ruleFallback")}</span>
                <Badge variant="neutral">{t("triageAi.sourceRuleBadge")}</Badge>
              </div>
            )}
          </div>
        )}
      </AiCallout>
    </div>
  );
}
