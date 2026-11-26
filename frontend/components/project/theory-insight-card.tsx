"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { CheckCircle2, Music2, TriangleAlert } from "lucide-react";
import {
  getTheoryInsight,
  type TheoryInsightResult,
  type TheoryTonality,
} from "../../lib/api-client";
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { useI18n } from "../../context/i18n-context";
import { AiActionButton, AiCallout } from "../ai/ai-ui";
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

function formatTonality(
  t: ReturnType<typeof useI18n>["t"],
  tonality: TheoryTonality,
): string {
  return t(tonality.mode === "major" ? "ti.key.major" : "ti.key.minor", {
    tonic: tonality.tonic,
  });
}

export function TheoryInsightCard({
  projectId,
  commitId,
}: {
  projectId: string;
  commitId?: string;
}) {
  const { t, lang } = useI18n();
  const titleId = useId();
  const requestKey = `${projectId}:${commitId ?? ""}:${lang}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    result: TheoryInsightResult | null;
    error: ErrorSource | null;
  } | null>(null);
  const [aiState, setAiState] = useState<{
    key: string;
    loading: boolean;
    explanation: string | null;
    unavailable: boolean;
  }>({ key: "", loading: false, explanation: null, unavailable: false });

  useEffect(() => {
    let cancelled = false;
    getTheoryInsight(projectId, lang, commitId, { explain: false })
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

  const requestAi = useCallback(async () => {
    setAiState({ key: requestKey, loading: true, explanation: null, unavailable: false });
    try {
      const full = await getTheoryInsight(projectId, lang, commitId, { explain: true });
      setAiState({
        key: requestKey,
        loading: false,
        explanation: full.explanation,
        unavailable: full.explanation === null,
      });
    } catch {
      setAiState({
        key: requestKey,
        loading: false,
        explanation: null,
        unavailable: true,
      });
    }
  }, [projectId, lang, commitId, requestKey]);

  const current = state && state.key === requestKey ? state : null;
  const currentAi = aiState.key === requestKey ? aiState : null;
  const result = current?.result ?? null;
  const hasAnalysisContent = Boolean(
    result &&
      (result.tonality !== null ||
        result.chords.some((c) => c.chord !== null)),
  );

  return (
    <section
      data-testid="theory-insight-card"
      aria-labelledby={titleId}
      className="mt-5 rounded-card border border-border bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Music2 className="h-4 w-4 text-muted" aria-hidden="true" />
          <h2 id={titleId} className="text-[13px] font-semibold">
            {t("ti.title")}
          </h2>
          <span className="font-mono text-xs text-muted">{t("ti.method")}</span>
        </div>
        {hasAnalysisContent && (
          <AiActionButton
            compact
            label={t("ti.aiExplain")}
            loading={currentAi?.loading ?? false}
            onClick={() => void requestAi()}
            testId="ti-ai-btn"
          />
        )}
      </div>
      <div aria-live="polite" className="px-4 py-3 text-[13px]">
        {!current ? (
          <SkyLoading compact label={t("ti.loading")} />
        ) : current.error || !result ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <span className="text-danger">{renderError(current.error)}</span>
            <Button type="button" variant="secondary" onClick={retry}>
              {t("ti.retry")}
            </Button>
          </div>
        ) : (
          <InsightBody
            result={result}
            aiState={currentAi}
            onRegenerateAi={() => void requestAi()}
          />
        )}
      </div>
    </section>
  );
}

function InsightBody({
  result,
  aiState,
  onRegenerateAi,
}: {
  result: TheoryInsightResult;
  aiState: {
    loading: boolean;
    explanation: string | null;
    unavailable: boolean;
  } | null;
  onRegenerateAi: () => void;
}) {
  const { t } = useI18n();
  const {
    tonality,
    alternativeTonality,
    chords,
    cadences = [],
    profile,
    integrity,
    truncated,
    explanation: initialExplanation,
  } = result;
  const hasChords = chords.some((c) => c.chord !== null);
  const aiExplanation = aiState ? aiState.explanation : initialExplanation;
  const showAiCallout = Boolean(
    aiState?.loading || aiState?.unavailable || aiExplanation,
  );

  if (
    !tonality &&
    chords.length === 0 &&
    !truncated &&
    (!profile || profile.totalNotes === 0)
  ) {
    return <p className="text-muted">{t("ti.empty")}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{t("ti.key")}</span>
        {tonality ? (
          <>
            <span data-testid="ti-key" className="font-semibold text-foreground">
              {formatTonality(t, tonality)}
            </span>
            <span className="font-mono text-xs text-muted">
              (r={tonality.confidence.toFixed(2)})
            </span>
            <Badge variant={CONFIDENCE_VARIANT[confidenceKey(tonality.confidence)]}>
              {t("ti.confidence")}: {t(`ti.confidence.${confidenceKey(tonality.confidence)}`)}
            </Badge>
            {alternativeTonality && (
              <Badge variant="neutral">
                {t("ti.altKey")}: {formatTonality(t, alternativeTonality)} (r={alternativeTonality.confidence.toFixed(2)})
              </Badge>
            )}
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
              {chords.map(({ bar, chord, roman }) => (
                <li
                  key={bar}
                  className="rounded-card border border-border bg-surface-subtle px-2 py-1 text-xs"
                >
                  <span className="text-muted">{t("ti.bar", { n: bar })}</span>{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {chord ?? <span className="font-sans font-normal text-muted">{t("ti.noChord")}</span>}
                  </span>
                  {roman && (
                    <span className="ml-1 font-mono text-xs text-teal">{roman}</span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted">{t("ti.noChords")}</p>
          )}
        </div>
      )}

      {cadences.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-muted">{t("ti.cadences")}</p>
          <ul data-testid="ti-cadences" className="flex flex-wrap gap-1.5">
            {cadences.map((c, idx) => (
              <li
                key={`${c.type}-${c.fromBar}-${idx}`}
                className="inline-flex items-center gap-1.5 rounded-card border border-border bg-surface-subtle px-2.5 py-1 text-xs"
              >
                <span className="font-medium text-foreground">
                  {t(`ti.cadence.${c.type}`)}
                </span>
                <span className="font-mono text-teal">
                  {c.fromRoman}→{c.toRoman}
                </span>
                <span className="text-muted">
                  ({t("ti.cadenceBars", { from: c.fromBar, to: c.toBar })})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {profile && profile.totalNotes > 0 && (
        <div data-testid="ti-profile" className="border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {t("ti.profileTitle")}
          </p>
          <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t("ti.profileTempoMeter")}</dt>
              <dd className="font-mono text-foreground">
                {profile.tempo} BPM · {profile.timeSignature[0]}/{profile.timeSignature[1]}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t("ti.profileLength")}</dt>
              <dd className="font-mono text-foreground">
                {t("ti.profileLengthVal", { bars: profile.totalBars, notes: profile.totalNotes })}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t("ti.profileTracks")}</dt>
              <dd className="font-mono text-foreground">
                {t("ti.profileTracksVal", {
                  pitched: profile.pitchedTrackCount,
                  drums: profile.percussionTrackCount,
                })}
              </dd>
            </div>
            {profile.pitchRange && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t("ti.profileRange")}</dt>
                <dd className="font-mono text-foreground">
                  {profile.pitchRange.lowest}–{profile.pitchRange.highest}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t("ti.profileDensity")}</dt>
              <dd className="font-mono text-foreground">
                {profile.densestBar
                  ? t("ti.profileDensityVal", {
                      avg: profile.averageNotesPerBar,
                      bar: profile.densestBar.bar,
                      count: profile.densestBar.noteCount,
                    })
                  : t("ti.profileDensitySimple", { avg: profile.averageNotesPerBar })}
              </dd>
            </div>
            {profile.velocity && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t("ti.profileVelocity")}</dt>
                <dd className="font-mono text-foreground">
                  {t("ti.profileVelocityVal", {
                    min: profile.velocity.min,
                    max: profile.velocity.max,
                    avg: profile.velocity.average,
                  })}
                </dd>
              </div>
            )}
            {profile.scaleFit && (
              <div className="flex justify-between gap-2 sm:col-span-2">
                <dt className="text-muted">{t("ti.profileScale")}</dt>
                <dd className="font-mono text-foreground">
                  {t("ti.profileScaleVal", {
                    pct: profile.scaleFit.inScalePercent,
                    acc: profile.scaleFit.outOfScaleCount,
                  })}
                  {profile.scaleFit.accidentalPitchClasses.length > 0
                    ? ` (${profile.scaleFit.accidentalPitchClasses.join(", ")})`
                    : ""}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {integrity && (
        <div data-testid="ti-integrity" className="border-t border-border pt-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            {t("ti.integrityTitle")}
          </p>
          {integrity.duplicateCount === 0 && integrity.overlapCount === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-success-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("ti.integrityClean")}
            </p>
          ) : (
            <div className="space-y-1.5 text-xs">
              {integrity.duplicateCount > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 font-medium text-warning-foreground">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t("ti.integrityDuplicates", { n: integrity.duplicateCount })}
                  </p>
                  <p className="mt-0.5 font-mono text-muted">
                    {integrity.duplicateSamples
                      .map((s) => t("ti.integritySample", { bar: s.bar, track: s.trackName, pitch: s.pitchName }))
                      .join(" · ")}
                  </p>
                </div>
              )}
              {integrity.overlapCount > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 font-medium text-warning-foreground">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t("ti.integrityOverlaps", { n: integrity.overlapCount })}
                  </p>
                  <p className="mt-0.5 font-mono text-muted">
                    {integrity.overlapSamples
                      .map((s) => t("ti.integritySample", { bar: s.bar, track: s.trackName, pitch: s.pitchName }))
                      .join(" · ")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showAiCallout && (
        <AiCallout
          title={t("ti.aiTitle")}
          loading={aiState?.loading ?? false}
          loadingLabel={t("ti.aiLoading")}
          unavailable={(aiState?.unavailable ?? false) && !aiExplanation}
          text={aiExplanation}
          onRegenerate={onRegenerateAi}
          regenerating={aiState?.loading ?? false}
          subtitle={t("ai.objectiveNote")}
          testId="ti-ai-callout"
        />
      )}
    </div>
  );
}
