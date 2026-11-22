"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import {
  MODERATION_NOTE_MAX_LENGTH,
  MODERATION_NOTE_MIN_LENGTH,
  type CopyrightTakedownContext,
} from "@stave/shared-types";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogActions, DialogError } from "../../../components/ui/dialog";
import { Field, INPUT_CLASS } from "../../../components/ui/form";
import { ApiError } from "../../../lib/api-client";
import { copyrightTakedown, getCopyrightContext } from "../../../lib/admin-reports-api";
import { useI18n } from "../../../context/i18n-context";

type ContextState =
  | { kind: "loading" }
  | { kind: "ready"; data: CopyrightTakedownContext }
  | { kind: "error"; status: number | null };

const REPEAT_INFRINGER_THRESHOLD = 3;

export function CopyrightTakedownDialog({
  projectId,
  projectName,
  onClose,
  onRemoved,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onRemoved: (removedForks: number) => void;
}) {
  const { t, locale } = useI18n();
  const [context, setContext] = useState<ContextState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
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
    getCopyrightContext(projectId)
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
  const canSubmit = context.kind === "ready" && !reasonTooShort && !reasonTooLong && !submitting;

  function toggleSound(id: string) {
    setSoundIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  function messageFor(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 409 && /no open reports/i.test(err.message)) return t("cpr.errNoClaim");
      if (err.status === 404 || err.status === 409) return t("cpr.errAlready");
      if (err.status === 403) return t("cpr.errNoClaim");
    }
    return t("cpr.errGeneric");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await copyrightTakedown(projectId, { reason: trimmed, removeSoundIds: soundIds });
      if (!mounted.current) return;
      onRemoved(result.removedForks);
    } catch (err) {
      if (!mounted.current) return;
      setError(messageFor(err));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title={t("cpr.title")}
      titleClassName="text-danger"
      role="alertdialog"
      className="max-w-2xl p-6"
      onClose={onClose}
      closeDisabled={submitting}
    >
      {context.kind === "loading" && (
        <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent" /> {t("cpr.loading")}
        </p>
      )}

      {context.kind === "error" && (
        <>
          <DialogError message={context.status === 403 ? t("cpr.errNoClaim") : t("cpr.loadError")} />
          <DialogActions>
            <Button variant="ghost" onClick={onClose}>
              {t("ui.close")}
            </Button>
            {context.status !== 403 && (
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
          <p className="text-sm text-muted">
            <strong className="text-foreground">{projectName}</strong>. {t("cpr.intro")}
          </p>
          <DialogError message={error} />

          <section aria-labelledby="cpr-claims" className="flex flex-col gap-2">
            <h3 id="cpr-claims" className="text-xs font-semibold tracking-wide">
              {t("cpr.claimsTitle")}
            </h3>
            {context.data.claims.length === 0 && <p className="text-xs text-muted">{t("cpr.noClaimDetails")}</p>}
            <ul className="flex max-h-48 flex-col gap-3 overflow-y-auto rounded-card border border-border bg-surface-subtle/60 p-3 empty:hidden">
              {context.data.claims.map((claim) => (
                <li key={claim.reportId} className="flex min-w-0 flex-col gap-1 break-words text-[13px]">
                  <span className="font-medium">
                    {t("cpr.claimant", { name: claim.claimantName })} ({t(`cpr.role.${claim.claimantRole}`)})
                  </span>
                  <span className="text-muted">
                    <span className="font-medium text-foreground">{t("cpr.work")}:</span> {claim.workDescription}
                  </span>
                  <span className="text-muted">
                    <span className="font-medium text-foreground">{t("cpr.evidence")}:</span> {claim.evidence}
                  </span>
                  <time dateTime={claim.createdAt} className="font-mono text-xs text-muted">
                    {new Date(claim.createdAt).toLocaleDateString(locale, { dateStyle: "medium" })}
                  </time>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="cpr-forks" className="flex flex-col gap-1.5">
            <h3 id="cpr-forks" className="text-xs font-semibold tracking-wide">
              {t("cpr.forksTitle")}
            </h3>
            {context.data.forks.length === 0 ? (
              <p className="text-xs text-muted">{t("cpr.forksNone")}</p>
            ) : (
              <ul className="flex max-h-32 list-disc flex-col gap-0.5 overflow-y-auto pl-5 text-xs text-muted">
                {context.data.forks.map((fork) => (
                  <li key={fork.projectId} className="break-words">
                    {t("cpr.forkOwner", { name: fork.name, owner: fork.ownerDisplayName ?? "—" })}
                  </li>
                ))}
              </ul>
            )}
            {context.data.forksTruncated && <p className="text-xs text-muted">{t("cpr.forksMore")}</p>}
          </section>

          <p className="text-xs text-muted">
            {context.data.priorTakedowns === 0
              ? t("cpr.priorNone")
              : t("cpr.prior", { n: context.data.priorTakedowns })}
          </p>
          {context.data.priorTakedowns >= REPEAT_INFRINGER_THRESHOLD && (
            <p role="status" className="text-xs text-warning-foreground">
              {t("cpr.priorWarn")}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <Field label={t("cpr.reasonLabel")} error={reasonError}>
              <textarea
                name="takedown-reason"
                autoComplete="off"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder={t("cpr.reasonHint", { min: MODERATION_NOTE_MIN_LENGTH })}
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
              <legend className="px-1 text-xs font-semibold tracking-wide">{t("cpr.soundsLegend")}</legend>
              <p className="text-xs text-muted">{t("rpt.rmSoundsWarn")}</p>
              {context.data.sounds.map((sound) => (
                <label key={sound.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="takedown-sound"
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

          <p className="text-xs text-muted">{t("cpr.retention", { n: context.data.retentionDays })}</p>

          <DialogActions>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting} data-autofocus>
              {t("cpr.cancel")}
            </Button>
            <Button type="submit" variant="danger" disabled={submitting}>
              {submitting ? t("cpr.confirming") : t("cpr.confirm")}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
}
