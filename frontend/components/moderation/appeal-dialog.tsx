"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { APPEAL_STATEMENT_MAX_LENGTH, APPEAL_STATEMENT_MIN_LENGTH } from "@stave/shared-types";
import { Button } from "../ui/button";
import { Dialog, DialogActions, DialogError } from "../ui/dialog";
import { Field, INPUT_CLASS } from "../ui/form";
import { ApiError } from "../../lib/api-client";
import { appealRemoval } from "../../lib/appeals-api";
import { useI18n } from "../../context/i18n-context";

export function AppealDialog({
  projectId,
  projectName,
  onClose,
  onSent,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useI18n();
  const [statement, setStatement] = useState("");
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

  const trimmed = statement.trim();
  const tooShort = trimmed.length < APPEAL_STATEMENT_MIN_LENGTH;
  const tooLong = trimmed.length > APPEAL_STATEMENT_MAX_LENGTH;
  const fieldError = touched
    ? tooShort
      ? t("apd.statementHint", { min: APPEAL_STATEMENT_MIN_LENGTH })
      : tooLong
        ? t("rpt.noteTooLong", { max: APPEAL_STATEMENT_MAX_LENGTH })
        : null
    : null;
  const canSubmit = !tooShort && !tooLong && !submitting;

  function messageFor(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 410) return t("apd.errExpired");
      if (err.status === 409) return t("apd.errAlready");
    }
    return t("apd.errGeneric");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await appealRemoval(projectId, trimmed);
      if (!mounted.current) return;
      onSent();
    } catch (err) {
      if (!mounted.current) return;
      setError(messageFor(err));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title={t("apd.title", { name: projectName })}
      className="max-w-lg p-6"
      onClose={onClose}
      closeDisabled={submitting}
      dirty={trimmed.length > 0 && !submitting}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t("apd.intro")}</p>
        <DialogError message={error} />
        <div className="flex flex-col gap-1">
          <Field label={t("apd.statementLabel")} error={fieldError}>
            <textarea
              name="appeal-statement"
              autoComplete="off"
              rows={6}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              onBlur={() => setTouched(true)}
              disabled={submitting}
              data-autofocus
              className={`${INPUT_CLASS} resize-y`}
            />
          </Field>
          <p className={`self-end text-xs ${tooLong ? "text-danger" : "text-muted"}`}>
            {t("apd.counter", { n: trimmed.length, max: APPEAL_STATEMENT_MAX_LENGTH })}
          </p>
        </div>
        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {t("apd.cancel")}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? t("apd.submitting") : t("apd.submit")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
