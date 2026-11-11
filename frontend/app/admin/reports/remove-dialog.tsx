"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  REMOVAL_POLICIES,
  REMOVAL_REASON_MAX_LENGTH,
  REMOVAL_REASON_MIN_LENGTH,
  type RemovalImpact,
  type RemovalPolicy,
} from "@stave/shared-types";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogActions, DialogError } from "../../../components/ui/dialog";
import { Field, INPUT_CLASS } from "../../../components/ui/form";
import { ApiError } from "../../../lib/api-client";
import { getRemovalImpact, removeProject } from "../../../lib/admin-reports-api";
import { useI18n } from "../../../context/i18n-context";
import type { TKey } from "../../../lib/i18n";

type ImpactState =
  | { kind: "loading" }
  | { kind: "ready"; data: RemovalImpact }
  | { kind: "error" };

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function RemoveDialog({ projectId, onClose, onRemoved }: { projectId: string; onClose: () => void; onRemoved: () => void }) {
  const { t, locale } = useI18n();
  const [impact, setImpact] = useState<ImpactState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [keptUntil, setKeptUntil] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [policy, setPolicy] = useState<RemovalPolicy | null>(null);
  const [selectedSounds, setSelectedSounds] = useState<ReadonlySet<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    let cancelled = false;
    getRemovalImpact(projectId)
      .then((data) => {
        if (cancelled) return;
        setImpact({ kind: "ready", data });
        // Compute the kept-until moment once, at load, not on every render.
        setKeptUntil(
          data.retentionDays > 0
            ? new Date(Date.now() + data.retentionDays * 86_400_000).toISOString()
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setImpact({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, attempt]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function retryImpact() {
    setImpact({ kind: "loading" });
    setKeptUntil(null);
    setAttempt((n) => n + 1);
  }

  const trimmed = reason.trim();
  const tooShort = trimmed.length < REMOVAL_REASON_MIN_LENGTH;
  const tooLong = trimmed.length > REMOVAL_REASON_MAX_LENGTH;
  const canSubmit =
    impact.kind === "ready" && policy !== null && !tooShort && !tooLong && !submitting;

  function toggleSound(id: string, checked: boolean) {
    setSelectedSounds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || policy === null) return;
    setSubmitting(true);
    setError(null);
    setConflict(null);
    const removeSoundIds =
      impact.kind === "ready"
        ? impact.data.ownerSounds.filter((sound) => selectedSounds.has(sound.id)).map((sound) => sound.id)
        : [];
    try {
      await removeProject(projectId, { reason: trimmed, policy, removeSoundIds });
      if (!mounted.current) return;
      onRemoved();
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof ApiError && err.status === 409) setConflict(t("rmv.remove409"));
      else setError(t("rmv.removeFail"));
      setSubmitting(false);
    }
  }

  return (
    <Dialog title={t("rmv.removeTitle")} onClose={onClose} closeDisabled={submitting} role="alertdialog" className="max-w-lg">
      {impact.kind === "loading" && (
        <p role="status" className="py-4 text-sm text-muted">{t("ui.loading")}</p>
      )}
      {impact.kind === "error" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-sm text-danger">
          <span>{t("rpt.detailsFail")}</span>
          <Button variant="secondary" onClick={retryImpact}>
            {t("ui.retry")}
          </Button>
        </div>
      )}
      {impact.kind === "ready" && (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <p className="text-sm text-muted">{t("rmv.removeIntro")}</p>
          <DialogError message={error ?? conflict} />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold tracking-wide">{t("rmv.policyLegend")}</legend>
            {REMOVAL_POLICIES.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="remove-policy"
                  value={key}
                  checked={policy === key}
                  onChange={() => setPolicy(key)}
                  disabled={submitting}
                  className="accent-accent"
                />
                {t(`rmv.policy.${key}` as TKey)}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-1">
            <Field
              label={t("rmv.reasonLabel")}
              error={tooShort ? t("rmv.reasonMin", { min: REMOVAL_REASON_MIN_LENGTH }) : tooLong ? t("rmv.reasonTooLong", { max: REMOVAL_REASON_MAX_LENGTH }) : null}
            >
              <textarea
                name="remove-reason"
                autoComplete="off"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("rmv.reasonPlaceholder")}
                disabled={submitting}
                aria-invalid={tooShort || tooLong || undefined}
                className={`${INPUT_CLASS} resize-y`}
              />
            </Field>
            <p className={`self-end text-xs ${tooShort || tooLong ? "text-danger" : "text-muted"}`}>
              {tooShort || tooLong ? "" : t("rpt.counter", { n: trimmed.length, max: REMOVAL_REASON_MAX_LENGTH })}
            </p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold tracking-wide">{t("rmv.soundsLegend")}</legend>
            {impact.data.ownerSounds.length === 0 ? (
              <p className="text-sm text-muted">{t("rmv.soundNone")}</p>
            ) : (
              impact.data.ownerSounds.map((sound) => (
                <label key={sound.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="remove-sound"
                    aria-label={t("rmv.soundSelect", { name: sound.name ?? sound.id })}
                    checked={selectedSounds.has(sound.id)}
                    onChange={(event) => toggleSound(sound.id, event.target.checked)}
                    disabled={submitting}
                    className="h-4 w-4 accent-accent"
                  />
                  {sound.name ?? sound.id}
                </label>
              ))
            )}
          </fieldset>

          <div className="flex flex-col gap-1 text-xs text-muted">
            <span>{t("rmv.forks", { n: impact.data.forkCount })}</span>
            {keptUntil !== null && (
              <span>{t("rmv.retained", { date: formatDate(keptUntil, locale) })}</span>
            )}
            <span className="text-warning-foreground">{t("rmv.ownerTold")}</span>
          </div>

          <DialogActions>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {t("rpt.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {submitting ? t("rmv.removing") : t("rmv.remove")}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
}
