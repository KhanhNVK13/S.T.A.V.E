"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { MODERATION_NOTE_MAX_LENGTH, MODERATION_NOTE_MIN_LENGTH } from "@stave/shared-types";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogActions, DialogError } from "../../../components/ui/dialog";
import { Field, INPUT_CLASS } from "../../../components/ui/form";
import { ApiError } from "../../../lib/api-client";
import { dismissReports, getReportDetails } from "../../../lib/admin-reports-api";
import { useI18n } from "../../../context/i18n-context";

type IdsState = { kind: "loading" } | { kind: "ready"; ids: string[] } | { kind: "error" };

export function DismissReportsDialog({
  projectId,
  projectName,
  onClose,
  onDismissed,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onDismissed: () => void;
}) {
  const { t } = useI18n();
  const [ids, setIds] = useState<IdsState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [reason, setReason] = useState("");
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
    getReportDetails(projectId, "open")
      .then((items) => {
        if (!cancelled) setIds({ kind: "ready", ids: items.map((item) => item.id) });
      })
      .catch(() => {
        if (!cancelled) setIds({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, attempt]);

  const trimmed = reason.trim();
  const tooShort = trimmed.length < MODERATION_NOTE_MIN_LENGTH;
  const tooLong = trimmed.length > MODERATION_NOTE_MAX_LENGTH;
  const reasonError = touched
    ? tooShort
      ? t("rpt.noteTooShort", { min: MODERATION_NOTE_MIN_LENGTH })
      : tooLong
        ? t("rpt.noteTooLong", { max: MODERATION_NOTE_MAX_LENGTH })
        : null
    : null;
  const canSubmit = ids.kind === "ready" && ids.ids.length > 0 && !tooShort && !tooLong && !submitting;

  function reload() {
    setIds({ kind: "loading" });
    setAttempt((n) => n + 1);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit || ids.kind !== "ready") return;
    setSubmitting(true);
    setError(null);
    try {
      await dismissReports(projectId, { reportIds: ids.ids, reason: trimmed });
      if (!mounted.current) return;
      onDismissed();
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof ApiError && err.status === 409) {
        setError(t("rpt.dismissChanged"));
        reload();
      } else {
        setError(t("rpt.dismissErrGeneric"));
      }
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title={t("rpt.dismissTitle", { name: projectName })}
      className="max-w-md p-6"
      onClose={onClose}
      closeDisabled={submitting}
    >
      {ids.kind === "loading" && (
        <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent" /> {t("rpt.ctxLoading")}
        </p>
      )}

      {ids.kind === "error" && (
        <>
          <DialogError message={t("rpt.dismissLoadFail")} />
          <DialogActions>
            <Button variant="ghost" onClick={onClose}>
              {t("ui.close")}
            </Button>
            <Button variant="secondary" onClick={reload}>
              {t("ui.retry")}
            </Button>
          </DialogActions>
        </>
      )}

      {ids.kind === "ready" && (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <p className="text-sm text-muted">{t("rpt.dismissIntro", { n: ids.ids.length })}</p>
          <DialogError message={error} />
          <div className="flex flex-col gap-1">
            <Field label={t("rpt.dismissReasonLabel")} error={reasonError}>
              <textarea
                name="dismiss-reason"
                data-autofocus
                autoComplete="off"
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => setTouched(true)}
                disabled={submitting}
                className={`${INPUT_CLASS} resize-y`}
              />
            </Field>
            <p className={`self-end text-xs ${tooLong ? "text-danger" : "text-muted"}`}>
              {t("rpt.counter", { n: trimmed.length, max: MODERATION_NOTE_MAX_LENGTH })}
            </p>
          </div>
          <DialogActions>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {t("ui.cancel")}
            </Button>
            <Button type="submit" disabled={submitting || ids.ids.length === 0}>
              {submitting ? t("ui.processing") : t("rpt.dismissConfirm")}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
}
