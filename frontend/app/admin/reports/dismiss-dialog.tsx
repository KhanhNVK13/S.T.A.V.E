"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ReportDetail } from "@stave/shared-types";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogActions, DialogError } from "../../../components/ui/dialog";
import { Field, INPUT_CLASS } from "../../../components/ui/form";
import { ApiError } from "../../../lib/api-client";
import { dismissReports } from "../../../lib/admin-reports-api";
import { useI18n } from "../../../context/i18n-context";

const MAX_REASON_LENGTH = 500;

export function DismissDialog({
  projectId,
  reports,
  onClose,
  onDismissed,
}: {
  projectId: string;
  reports: ReportDetail[];
  onClose: () => void;
  onDismissed: () => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(() => new Set(reports.map((report) => report.id)));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(true);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (selected.size === 0 || trimmed.length === 0 || trimmed.length > MAX_REASON_LENGTH) return;
    setSubmitting(true);
    setError(null);
    try {
      await dismissReports(projectId, [...selected], trimmed);
      if (mounted.current) onDismissed();
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof ApiError && err.status === 409 ? t("rpt.dismissConflict") : t("rpt.dismissFail"));
      setSubmitting(false);
    }
  }

  const trimmed = reason.trim();
  const canSubmit = selected.size > 0 && trimmed.length > 0 && trimmed.length <= MAX_REASON_LENGTH && !submitting;

  return (
    <Dialog title={t("rpt.dismissTitle")} onClose={onClose} closeDisabled={submitting} role="alertdialog">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t("rpt.dismissIntro")}</p>
        <DialogError message={error} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-semibold tracking-wide">{t("rpt.dismissSelection")}</legend>
          {reports.map((report) => (
            <label key={report.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(report.id)}
                onChange={() => toggle(report.id)}
                disabled={submitting}
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <span>{report.details || t("rpt.noDetails")}</span>
            </label>
          ))}
        </fieldset>
        <Field label={t("rpt.dismissReason")} error={trimmed.length > MAX_REASON_LENGTH ? t("rpt.dismissReasonTooLong") : null}>
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={submitting}
            className={`${INPUT_CLASS} resize-y`}
            placeholder={t("rpt.dismissReasonPlaceholder")}
          />
        </Field>
        <p className="self-end text-xs text-muted">{trimmed.length}/{MAX_REASON_LENGTH}</p>
        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>{t("rpt.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>{submitting ? t("rpt.dismissing") : t("rpt.dismiss")}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
