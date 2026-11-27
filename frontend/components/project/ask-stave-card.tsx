"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { Lock, MessageSquareText, Sparkles } from "lucide-react";
import Link from "next/link";
import { useI18n } from "../../context/i18n-context";
import { askProjectHistory, type AskProjectResult } from "../../lib/api-ask-stave";
import { getMySubscription } from "../../lib/api-billing";
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import type { TKey } from "../../lib/i18n";
import { AiActionButton, AiBadge, AiCallout } from "../ai/ai-ui";
import { Badge } from "../ui/badge";
import { Button, buttonClass } from "../ui/button";
import { INPUT_CLASS } from "../ui/form";
import { SkyLoading } from "./sky-state";

const QUICK_QUESTION_KEYS: readonly TKey[] = [
  "askAi.chipCompare",
  "askAi.chipChords",
  "askAi.chipComments",
];

const TOOL_LABEL_KEYS: Record<string, TKey> = {
  list_branches: "askAi.tool.list_branches",
  compare_branches: "askAi.tool.compare_branches",
  get_theory_range: "askAi.tool.get_theory_range",
  summarize_comments: "askAi.tool.summarize_comments",
  get_recent_commits: "askAi.tool.get_recent_commits",
};

const MIN_QUESTION_LENGTH = 2;
const MAX_QUESTION_LENGTH = 400;

type SubscriptionState =
  | { status: "loading" }
  | { status: "ready"; hasPaidAccess: boolean }
  | { status: "error"; error: ErrorSource };

export function AskStaveCard({ projectId }: { projectId: string }) {
  const { t, lang } = useI18n();
  const titleId = useId();
  const inputId = useId();

  const [subAttempt, setSubAttempt] = useState(0);
  const [subState, setSubState] = useState<SubscriptionState>({ status: "loading" });

  const [question, setQuestion] = useState("");
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [resultState, setResultState] = useState<{
    projectId: string;
    result: AskProjectResult | null;
    error: ErrorSource | null;
  }>({ projectId, result: null, error: null });
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMySubscription()
      .then((sub) => {
        if (!cancelled) {
          setSubState({ status: "ready", hasPaidAccess: Boolean(sub.hasPaidAccess) });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSubState({
            status: "error",
            error: errorSource(err, "askAi.accessLoadFail"),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [subAttempt]);

  const retrySubscription = useCallback(() => {
    setSubState({ status: "loading" });
    setSubAttempt((n) => n + 1);
  }, []);

  const submitQuestion = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (trimmed.length < MIN_QUESTION_LENGTH) {
        setValidationError(t("askAi.tooShort"));
        return;
      }
      if (trimmed.length > MAX_QUESTION_LENGTH) {
        setValidationError(t("askAi.tooLong"));
        return;
      }

      setValidationError(null);
      setLastQuestion(trimmed);
      setAsking(true);
      setResultState({ projectId, result: null, error: null });

      try {
        const res = await askProjectHistory(projectId, trimmed, lang);
        setResultState({ projectId, result: res, error: null });
      } catch (err) {
        setResultState({
          projectId,
          result: null,
          error: errorSource(err, "askAi.error"),
        });
      } finally {
        setAsking(false);
      }
    },
    [lang, projectId, t],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuestion(question);
  }

  function handleChipClick(sampleText: string) {
    setQuestion(sampleText);
    void submitQuestion(sampleText);
  }

  const activeResult = resultState.projectId === projectId ? resultState : null;
  const answerResult = activeResult?.result ?? null;
  const askError = activeResult?.error ?? null;
  const showCallout = asking || answerResult !== null;

  return (
    <section
      data-testid="ask-stave-card"
      aria-labelledby={titleId}
      className="mt-5 rounded-card border border-border bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-violet" aria-hidden="true" />
          <h2 id={titleId} className="text-[13px] font-semibold">
            {t("askAi.title")}
          </h2>
          <AiBadge />
          <Badge variant="info">{t("askAi.stavePlus")}</Badge>
        </div>
        <span className="text-xs text-muted">{t("askAi.subtitle")}</span>
      </div>

      <div className="px-4 py-3 text-[13px]">
        {subState.status === "loading" ? (
          <SkyLoading compact label={t("askAi.loadingAccess")} />
        ) : subState.status === "error" ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <span className="text-danger">{renderError(subState.error)}</span>
            <Button type="button" variant="secondary" onClick={retrySubscription}>
              {t("ui.retry")}
            </Button>
          </div>
        ) : !subState.hasPaidAccess ? (
          <div
            data-testid="ask-stave-gate"
            className="rounded-card border border-violet/30 bg-violet-muted/20 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <AiBadge label={t("askAi.stavePlus")} />
                  <p className="text-[13px] font-semibold text-foreground">
                    {t("askAi.gateTitle")}
                  </p>
                </div>
                <p className="text-xs leading-relaxed text-muted">{t("askAi.gateDesc")}</p>
              </div>
              <Link
                href={`/plans?feature=ask_stave&returnTo=${encodeURIComponent(`/projects/${projectId}`)}`}
                className={buttonClass("primary")}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {t("askAi.upgrade")}
              </Link>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {QUICK_QUESTION_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled
                  className="inline-flex h-7 cursor-not-allowed items-center gap-1.5 rounded-full border border-border bg-surface-subtle px-3 text-xs text-muted opacity-65"
                >
                  <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{t(key)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor={inputId} className="sr-only">
                {t("askAi.inputLabel")}
              </label>
              <input
                id={inputId}
                name="ask-stave-question"
                autoComplete="off"
                type="text"
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder={t("askAi.placeholder")}
                disabled={asking}
                className={`${INPUT_CLASS} min-w-0 flex-1`}
              />
              <AiActionButton
                label={t("askAi.submit")}
                loadingLabel={t("askAi.submitting")}
                loading={asking}
                disabled={asking}
                onClick={() => void submitQuestion(question)}
                testId="ask-stave-submit"
              />
            </form>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">{t("askAi.quickLabel")}:</span>
              {QUICK_QUESTION_KEYS.map((key) => {
                const text = t(key);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={asking}
                    onClick={() => handleChipClick(text)}
                    className="inline-flex h-7 items-center rounded-full border border-violet/35 bg-violet-muted/40 px-3 text-xs font-medium text-violet transition-colors hover:bg-violet-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {text}
                  </button>
                );
              })}
            </div>

            {(validationError || askError) && (
              <p role="alert" className="text-xs text-danger">
                {validationError ?? renderError(askError)}
              </p>
            )}

            {showCallout && (
              <AiCallout
                title={t("askAi.answerTitle")}
                loading={asking}
                loadingLabel={t("askAi.submitting")}
                unavailable={
                  !asking &&
                  answerResult !== null &&
                  (answerResult.rateLimited || answerResult.answer === null)
                }
                unavailableLabel={
                  answerResult?.rateLimited
                    ? t("askAi.rateLimited")
                    : t("askAi.unavailable")
                }
                text={answerResult?.answer ?? null}
                copyText={answerResult?.answer ?? null}
                onRegenerate={
                  lastQuestion ? () => void submitQuestion(lastQuestion) : undefined
                }
                regenerating={asking}
                subtitle={t("ai.objectiveNote")}
                testId="ask-stave-callout"
              >
                {!asking &&
                  answerResult?.answer &&
                  answerResult.toolsUsed.length > 0 && (
                    <div
                      data-testid="ask-stave-tools"
                      className="mt-3 flex flex-wrap items-center gap-1.5"
                    >
                      <span className="text-xs text-muted">
                        {t("askAi.toolsUsedLabel")}:
                      </span>
                      {answerResult.toolsUsed.map((tool) => {
                        const labelKey = TOOL_LABEL_KEYS[tool];
                        return (
                          <Badge key={tool} variant="info">
                            {labelKey ? t(labelKey) : tool}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
              </AiCallout>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
