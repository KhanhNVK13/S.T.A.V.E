"use client";

import { useState, type FormEvent } from "react";
import { REMOVAL_REASON_MAX_LENGTH } from "@stave/shared-types";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogActions, DialogError } from "../../../components/ui/dialog";
import { Field, INPUT_CLASS } from "../../../components/ui/form";
import { ApiError } from "../../../lib/api-client";
import { restoreProject } from "../../../lib/admin-reports-api";
import { useI18n } from "../../../context/i18n-context";

export function RestoreDialog({ projectId, onClose, onRestored }: { projectId: string; onClose: () => void; onRestored: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);

  const trimmed = reason.trim();
  const tooShort = trimmed.length === 0;
  const tooLong = trimmed.length > REMOVAL_REASON_MAX_LENGTH;
  const canSubmit = !tooShort && !tooLong && !submitting && !gone;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await restoreProject(projectId, trimmed);
      onRestored();
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) setGone(t("rmv.restoreFail"));
      else setError(t("rmv.restoreFail"));
      setSubmitting(false);
    }
  }

  return (
    <Dialog title={t("rmv.restoreTitle")} onClose={onClose} closeDisabled={submitting} className="max-w-lg">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t("rmv.restoreIntro")}</p>
        {gone && (
          <div role="alert" className="rounded-card bg-danger-muted px-3 py-2 text-sm text-danger">
            {gone}
          </div>
        )}
        <DialogError message={error} />

        <div className="flex flex-col gap-1">
          <Field label={t("rmv.restoreReasonLabel")} error={tooShort ? t("rmv.restoreReasonMin") : tooLong ? t("rmv.reasonTooLong", { max: REMOVAL_REASON_MAX_LENGTH }) : null}>
            <textarea
              name="restore-reason"
              autoComplete="off"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("rmv.restoreReasonPlaceholder")}
              disabled={submitting}
              aria-invalid={tooShort || tooLong || undefined}
              className={`${INPUT_CLASS} resize-y`}
            />
          </Field>
          <p className={`self-end text-xs ${tooShort || tooLong ? "text-danger" : "text-muted"}`}>
            {tooShort || tooLong ? "" : t("rpt.counter", { n: trimmed.length, max: REMOVAL_REASON_MAX_LENGTH })}
          </p>
        </div>

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {t("rpt.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {submitting ? t("rmv.restoring") : t("rmv.restore")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
