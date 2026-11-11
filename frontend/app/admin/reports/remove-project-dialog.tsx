"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import {
  MODERATION_NOTE_MAX_LENGTH,
  MODERATION_NOTE_MIN_LENGTH,
  MODERATION_POLICIES,
  type ModerationPolicy,
  type ReportRemovalContext,
} from "@stave/shared-types";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogActions, DialogError } from "../../../components/ui/dialog";
import { Field, INPUT_CLASS } from "../../../components/ui/form";
import { MODERATION_POLICY_LABEL_KEYS } from "../../../components/moderation/policy-labels";
import { ApiError } from "../../../lib/api-client";
import { getRemovalContext, removeReportedProject } from "../../../lib/admin-reports-api";
import { useI18n } from "../../../context/i18n-context";

type ContextState =
  | { kind: "loading" }
  | { kind: "ready"; data: ReportRemovalContext }
  | { kind: "error"; status: number | null };

export function RemoveProjectDialog({
  projectId,
  projectName,
  onClose,
  onRemoved,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const { t } = useI18n();
  const [context, setContext] = useState<ContextState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [policy, setPolicy] = useState<ModerationPolicy | null>(null);
  const [reason, setReason] = useState("");
  const [soundIds, setSoundIds] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getRemovalContext(projectId)
      .then((data) => {
        if (!cancelled) setContext({ kind: "ready", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setContext({ kind: "error", status: err instanceof ApiError ? err.status : null });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, attempt]);

  const trimmed = reason.trim();
  const reasonTooShort = trimmed.length < MODERATION_NOTE_MIN_LENGTH;
  const reasonTooLong = trimmed.length > MODERATION_NOTE_MAX_LENGTH;
  const reasonError = touched
    ? reasonTooShort
      ? t("rpt.noteTooShort", { min: MODERATION_NOTE_MIN_LENGTH })
      : reasonTooLong
        ? t("rpt.noteTooLong", { max: MODERATION_NOTE_MAX_LENGTH })
        : null
    : null;
  const canSubmit =
    context.kind === "ready" && policy !== null && !reasonTooShort && !reasonTooLong && !submitting;

  function toggleSound(id: string) {
    setSoundIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  function messageFor(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 404) return t("rpt.rmErrMissing");
      if (err.status === 409) return t("rpt.rmErrState");
    }
    return t("rpt.rmErrGeneric");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit || policy === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await removeReportedProject(projectId, { reason: trimmed, policy, removeSoundIds: soundIds });
      if (!mounted.current) return;
      onRemoved();
    } catch (err) {
      if (!mounted.current) return;
      setError(messageFor(err));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title={t("rpt.rmTitle", { name: projectName })}
      titleClassName="text-danger"
      role="alertdialog"
      className="max-w-lg p-6"
      onClose={onClose}
      closeDisabled={submitting}
    >
      {context.kind === "loading" && (
        <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent" /> {t("rpt.ctxLoading")}
        </p>
      )}

      {context.kind === "error" && (
        <>
          <DialogError
            message={
              context.status === 404
                ? t("rpt.rmErrMissing")
                : context.status === 403
                  ? t("rpt.rmErrState")
                  : t("rpt.ctxFail")
            }
          />
          <DialogActions>
            <Button variant="ghost" onClick={onClose}>
              {t("ui.close")}
            </Button>
            {context.status !== 403 && context.status !== 404 && (
              <Button
                variant="secondary"
                onClick={() => {
                  setContext({ kind: "loading" });
                  setAttempt((n) => n + 1);
                }}
              >
                {t("ui.retry")}
              </Button>
            )}
          </DialogActions>
        </>
      )}

      {context.kind === "ready" && (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <p className="text-sm text-muted">{t("rpt.rmIntro")}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted">
            <li>{t("rpt.rmRetention", { days: context.data.retentionDays })}</li>
            {context.data.forkCount > 0 && <li>{t("rpt.rmForks", { n: context.data.forkCount })}</li>}
          </ul>
          <DialogError message={error} />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold tracking-wide">{t("rpt.rmPolicyLegend")}</legend>
            {MODERATION_POLICIES.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="removal-policy"
                  value={key}
                  checked={policy === key}
                  onChange={() => setPolicy(key)}
                  disabled={submitting}
                  className="accent-accent"
                />
                {t(MODERATION_POLICY_LABEL_KEYS[key])}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-1">
            <Field label={t("rpt.rmReasonLabel")} error={reasonError}>
              <textarea
                name="removal-reason"
                autoComplete="off"
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => setTouched(true)}
                disabled={submitting}
                className={`${INPUT_CLASS} resize-y`}
              />
            </Field>
            <p className={`self-end text-xs ${reasonTooLong ? "text-danger" : "text-muted"}`}>
              {t("rpt.counter", { n: trimmed.length, max: MODERATION_NOTE_MAX_LENGTH })}
            </p>
          </div>

          {context.data.sounds.length > 0 && (
            <fieldset className="flex flex-col gap-2 rounded-card border border-danger/40 bg-danger-muted/40 p-3">
              <legend className="px-1 text-xs font-semibold tracking-wide">{t("rpt.rmSoundsLegend")}</legend>
              <p className="text-xs text-muted">{t("rpt.rmSoundsWarn")}</p>
              {context.data.sounds.map((sound) => (
                <label key={sound.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="removal-sound"
                    checked={soundIds.includes(sound.id)}
                    onChange={() => toggleSound(sound.id)}
                    disabled={submitting}
                    className="accent-accent"
                  />
                  <span className="truncate">{sound.name}</span>
                </label>
              ))}
            </fieldset>
          )}

          <DialogActions>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting} data-autofocus>
              {t("ui.cancel")}
            </Button>
            <Button type="submit" variant="danger" disabled={submitting}>
              {submitting ? t("ui.processing") : t("rpt.rmConfirm")}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
}
