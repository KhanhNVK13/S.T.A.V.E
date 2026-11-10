"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASONS, type ReportReason } from "@stave/shared-types";
import { Button } from "../ui/button";
import { Dialog, DialogActions, DialogError } from "../ui/dialog";
import { Field, INPUT_CLASS } from "../ui/form";
import { ApiError } from "../../lib/api-client";
import { reportProject } from "../../lib/report-api";
import { useI18n } from "../../context/i18n-context";
import { REPORT_REASON_LABEL_KEYS } from "./reason-labels";

interface ReportDialogProps {
  projectId: string;
  reason: ReportReason | null;
  details: string;
  onReasonChange: (reason: ReportReason) => void;
  onDetailsChange: (details: string) => void;
  onClose: () => void;
  onSent: () => void;
}

export function ReportDialog({
  projectId,
  reason,
  details,
  onReasonChange,
  onDetailsChange,
  onClose,
  onSent,
}: ReportDialogProps) {
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const trimmed = details.trim();
  const tooLong = trimmed.length > REPORT_DETAILS_MAX_LENGTH;
  const canSubmit = reason !== null && !tooLong && !submitting;

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
      await reportProject(projectId, trimmed ? { reason, details: trimmed } : { reason });
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
