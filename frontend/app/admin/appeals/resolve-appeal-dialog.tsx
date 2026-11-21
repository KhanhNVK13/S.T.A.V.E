"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MODERATION_NOTE_MAX_LENGTH,
  MODERATION_NOTE_MIN_LENGTH,
  type ModerationAppeal,
} from "@stave/shared-types";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogActions, DialogError } from "../../../components/ui/dialog";
import { Field, INPUT_CLASS } from "../../../components/ui/form";
import { ApiError } from "../../../lib/api-client";
import { resolveAppeal } from "../../../lib/appeals-api";
import { useI18n } from "../../../context/i18n-context";

export function ResolveAppealDialog({
  appeal,
  decision,
  onClose,
  onResolved,
}: {
  appeal: ModerationAppeal;
  decision: "uphold" | "reject";
  onClose: () => void;
  onResolved: (message: string) => void;
}) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
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

  const trimmed = note.trim();
  const tooShort = trimmed.length < MODERATION_NOTE_MIN_LENGTH;
  const tooLong = trimmed.length > MODERATION_NOTE_MAX_LENGTH;
  const fieldError = touched
    ? tooShort
      ? t("aap.noteHint", { min: MODERATION_NOTE_MIN_LENGTH })
      : tooLong
        ? t("rpt.noteTooLong", { max: MODERATION_NOTE_MAX_LENGTH })
        : null
    : null;
  const canSubmit = !tooShort && !tooLong && !submitting;
  const uphold = decision === "uphold";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await resolveAppeal(appeal.id, decision, trimmed);
      if (!mounted.current) return;
      onResolved(uphold ? t("aap.doneUphold") : t("aap.doneReject"));
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof ApiError && err.status === 409 ? t("aap.errResolved") : t("aap.errGeneric"));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title={uphold ? t("aap.confirmUphold") : t("aap.confirmReject")}
      titleClassName={uphold ? "text-foreground" : "text-danger"}
      role="alertdialog"
      className="max-w-lg p-6"
      onClose={onClose}
      closeDisabled={submitting}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <p className="text-sm font-medium">{appeal.projectName ?? t("aap.unknownProject")}</p>
        <DialogError message={error} />
        <div className="flex flex-col gap-1">
          <Field label={t("aap.noteLabel")} error={fieldError}>
            <textarea
              name="appeal-note"
              autoComplete="off"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => setTouched(true)}
              disabled={submitting}
              data-autofocus
              className={`${INPUT_CLASS} resize-y`}
            />
          </Field>
          <p className={`self-end text-xs ${tooLong ? "text-danger" : "text-muted"}`}>
            {t("rpt.counter", { n: trimmed.length, max: MODERATION_NOTE_MAX_LENGTH })}
          </p>
        </div>
        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {t("aap.cancel")}
          </Button>
          <Button type="submit" variant={uphold ? "primary" : "danger"} disabled={submitting}>
            {submitting ? t("aap.submitting") : uphold ? t("aap.uphold") : t("aap.reject")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
