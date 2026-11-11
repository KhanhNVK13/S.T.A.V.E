"use client";

import { useCallback, useEffect, useState } from "react";
import { Music2 } from "lucide-react";
import { getTheoryInsight, type TheoryInsightResult } from "../../lib/api-client";
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { useI18n } from "../../context/i18n-context";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { SkyLoading } from "./sky-state";

function confidenceKey(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.75) return "medium";
  return "low";
}

const CONFIDENCE_VARIANT = {
  high: "success",
  medium: "warning",
  low: "neutral",
} as const;

export function TheoryInsightCard({
  projectId,
  commitId,
}: {
  projectId: string;
  commitId?: string;
}) {
  const { t, lang } = useI18n();
  const requestKey = `${projectId}:${commitId ?? ""}:${lang}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    result: TheoryInsightResult | null;
    error: ErrorSource | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTheoryInsight(projectId, lang, commitId)
      .then((result) => {
        if (!cancelled) setState({ key: requestKey, result, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ key: requestKey, result: null, error: errorSource(err, "ti.loadFail") });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, commitId, lang, requestKey, attempt]);

  const retry = useCallback(() => {
    setState(null);
    setAttempt((n) => n + 1);
  }, []);

  const current = state && state.key === requestKey ? state : null;

  return (
    <section
      data-testid="theory-insight-card"
      aria-labelledby="ti-title"
      className="mt-5 rounded-card border border-border bg-surface"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Music2 className="h-4 w-4 text-muted" aria-hidden />
        <h2 id="ti-title" className="text-[13px] font-semibold">
          {t("ti.title")}
        </h2>
      </div>
      <div className="px-4 py-3 text-[13px]">
        {!current ? (
          <SkyLoading compact label={t("ti.loading")} />
        ) : current.error || !current.result ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <span className="text-danger">{renderError(current.error)}</span>
            <Button type="button" variant="secondary" onClick={retry}>
              {t("ti.retry")}
            </Button>
          </div>
        ) : (
          <InsightBody result={current.result} />
        )}
      </div>
    </section>
  );
}

function InsightBody({ result }: { result: TheoryInsightResult }) {
  const { t } = useI18n();
  const { tonality, chords, truncated, explanation } = result;
  const hasChords = chords.some((c) => c.chord !== null);

  if (!tonality && chords.length === 0 && !truncated) {
    return <p className="text-muted">{t("ti.empty")}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{t("ti.key")}</span>
        {tonality ? (
          <>
            <span data-testid="ti-key" className="font-semibold text-foreground">
              {t(tonality.mode === "major" ? "ti.key.major" : "ti.key.minor", {
                tonic: tonality.tonic,
              })}
            </span>
            <Badge variant={CONFIDENCE_VARIANT[confidenceKey(tonality.confidence)]}>
              {t("ti.confidence")}: {t(`ti.confidence.${confidenceKey(tonality.confidence)}`)}
            </Badge>
          </>
        ) : (
          <span className="text-muted">{t("ti.noKey")}</span>
        )}
      </div>

      {truncated ? (
        <p className="text-xs text-muted">{t("ti.truncated")}</p>
      ) : (
        <div>
          <p className="mb-1.5 text-xs text-muted">{t("ti.chords")}</p>
          {hasChords ? (
            <ol data-testid="ti-chords" className="flex flex-wrap gap-1.5">
              {chords.map(({ bar, chord }) => (
                <li
                  key={bar}
                  className="rounded-card border border-border bg-surface-subtle px-2 py-1 text-xs"
                >
                  <span className="text-muted">{t("ti.bar", { n: bar })}</span>{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {chord ?? <span className="font-sans font-normal text-muted">{t("ti.noChord")}</span>}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted">{t("ti.noChords")}</p>
          )}
        </div>
      )}

      {explanation && (
        <div className="border-t border-border pt-2">
          <p className="text-xs leading-relaxed text-muted">{explanation}</p>
          <p className="mt-1 text-xs text-muted">{t("ti.auto")}</p>
        </div>
      )}
    </div>
  );
}
