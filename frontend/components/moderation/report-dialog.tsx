"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  type ReportReason,
} from "@stave/shared-types";
import { Button } from "../ui/button";
import { Dialog, DialogActions, DialogError } from "../ui/dialog";
import { Field, INPUT_CLASS } from "../ui/form";
import { ApiError } from "../../lib/api-client";
import { reportProject } from "../../lib/report-api";
import { useI18n } from "../../context/i18n-context";
import { REPORT_REASON_LABEL_KEYS } from "./reason-labels";
import { EMPTY_CLAIM, isClaimComplete, toClaim, type ClaimDraft } from "./claim-draft";

interface ReportDialogProps {
  projectId: string;
  reason: ReportReason | null;
  details: string;
  onReasonChange: (reason: ReportReason) => void;
  onDetailsChange: (details: string) => void;
  claim?: ClaimDraft;
  onClaimChange?: (claim: ClaimDraft) => void;
  onClose: () => void;
  onSent: () => void;
}

export function ReportDialog({
  projectId,
  reason,
  details,
  onReasonChange,
  onDetailsChange,
  claim: claimProp,
  onClaimChange,
  onClose,
  onSent,
}: ReportDialogProps) {
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const [localClaim, setLocalClaim] = useState<ClaimDraft>(EMPTY_CLAIM);
  const claim = claimProp ?? localClaim;
  const setClaim = onClaimChange ?? setLocalClaim;
  const isCopyright = reason === "copyright";

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const trimmed = details.trim();
  const tooLong = trimmed.length > REPORT_DETAILS_MAX_LENGTH;
  const canSubmit = reason !== null && !tooLong && !submitting && (!isCopyright || isClaimComplete(claim));

  function messageFor(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 409) return t("rpt.errAlready");
      if (err.status === 403) return t("rpt.errOwn");
      if (err.status === 404) return t("rpt.errNotFound");
    }
    return t("rpt.errGeneric");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || reason === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const copyrightClaim = isCopyright ? (toClaim(claim) ?? undefined) : undefined;
      await reportProject(projectId, {
        reason,
        ...(trimmed ? { details: trimmed } : {}),
        ...(copyrightClaim ? { copyrightClaim } : {}),
      });
      if (!mounted.current) return;
      onSent();
    } catch (err) {
      if (!mounted.current) return;
      setError(messageFor(err));
      setSubmitting(false);
    }
  }

  return (
    <Dialog title={t("rpt.dialogTitle")} onClose={onClose} closeDisabled={submitting}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t("rpt.intro")}</p>
        <DialogError message={error} />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-semibold tracking-wide">{t("rpt.reasonLegend")}</legend>
          {REPORT_REASONS.map(({ key }) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="report-reason"
                value={key}
                checked={reason === key}
                onChange={() => onReasonChange(key)}
                disabled={submitting}
                className="accent-accent"
              />
              {t(REPORT_REASON_LABEL_KEYS[key])}
            </label>
          ))}
        </fieldset>

        {isCopyright && <ClaimFields claim={claim} onChange={setClaim} disabled={submitting} />}

        <div className="flex flex-col gap-1">
          <Field
            label={t("rpt.detailsLabel")}
            error={tooLong ? t("rpt.detailsTooLong", { max: REPORT_DETAILS_MAX_LENGTH }) : null}
          >
            <textarea
              name="details"
              autoComplete="off"
              rows={4}
              value={details}
              onChange={(e) => onDetailsChange(e.target.value)}
              placeholder={t("rpt.detailsPlaceholder")}
              disabled={submitting}
              className={`${INPUT_CLASS} resize-y`}
            />
          </Field>
          <p className={`self-end text-xs ${tooLong ? "text-danger" : "text-muted"}`}>
            {t("rpt.counter", { n: trimmed.length, max: REPORT_DETAILS_MAX_LENGTH })}
          </p>
        </div>

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {t("rpt.cancel")}
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? t("rpt.submitting") : t("rpt.submit")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function ClaimFields({
  claim,
  onChange,
  disabled,
}: {
  claim: ClaimDraft;
  onChange: (claim: ClaimDraft) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const set = (patch: Partial<ClaimDraft>) => onChange({ ...claim, ...patch });

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface-subtle p-3">
      <p className="text-xs text-muted">{t("rpt.claim.intro")}</p>
      <Field label={t("rpt.claim.name")}>
        <input
          name="claimant-name"
          autoComplete="name"
          value={claim.claimantName}
          onChange={(e) => set({ claimantName: e.target.value })}
          disabled={disabled}
          className={INPUT_CLASS}
        />
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-xs font-semibold tracking-wide">{t("rpt.claim.role")}</legend>
        {(["owner", "agent"] as const).map((role) => (
          <label key={role} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="claimant-role"
              checked={claim.claimantRole === role}
              onChange={() => set({ claimantRole: role })}
              disabled={disabled}
              className="accent-accent"
            />
            {t(role === "owner" ? "rpt.claim.roleOwner" : "rpt.claim.roleAgent")}
          </label>
        ))}
      </fieldset>
      <Field label={t("rpt.claim.work")}>
        <textarea
          name="claim-work"
          placeholder={t("rpt.claim.workHint")}
          autoComplete="off"
          rows={2}
          value={claim.workDescription}
          onChange={(e) => set({ workDescription: e.target.value })}
          disabled={disabled}
          className={`${INPUT_CLASS} resize-y`}
        />
      </Field>
      <Field label={t("rpt.claim.evidence")}>
        <textarea
          name="claim-evidence"
          placeholder={t("rpt.claim.evidenceHint")}
          autoComplete="off"
          rows={2}
          value={claim.evidence}
          onChange={(e) => set({ evidence: e.target.value })}
          disabled={disabled}
          className={`${INPUT_CLASS} resize-y`}
        />
      </Field>
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          name="claim-good-faith"
          checked={claim.goodFaith}
          onChange={(e) => set({ goodFaith: e.target.checked })}
          disabled={disabled}
          className="mt-0.5 accent-accent"
        />
        <span>{t("rpt.claim.goodFaith")}</span>
      </label>
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          name="claim-accuracy"
          checked={claim.accuracy}
          onChange={(e) => set({ accuracy: e.target.checked })}
          disabled={disabled}
          className="mt-0.5 accent-accent"
        />
        <span>{t("rpt.claim.accuracy")}</span>
      </label>
    </div>
  );
}
