"use client";

import { useState } from "react";
import { PAYMENT_ISSUE_DESCRIPTION_MAX, type TransactionHistoryItem } from "@stave/shared-types";
import { reportPaymentIssue } from "../../lib/api-billing";
import { validateIssueDescription } from "../../lib/billing-history";
import { useI18n } from "../../context/i18n-context";
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { formatDate } from "../../lib/format-date";
import { formatVnd } from "../../lib/format-vnd";
import { Button } from "../ui/button";
import { Dialog, DialogActions, DialogError } from "../ui/dialog";
import { Field, INPUT_CLASS } from "../ui/form";

interface ReportIssueDialogProps {
  transaction: TransactionHistoryItem;
  text: string;
  onTextChange: (text: string) => void;
  onClose: () => void;
  onReported: () => void;
}

export function ReportIssueDialog({ transaction, text, onTextChange, onClose, onReported }: ReportIssueDialogProps) {
  const { t } = useI18n();
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<ErrorSource | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const length = text.trim().length;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validateIssueDescription(text);
    setFieldError(problem);
    if (problem) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await reportPaymentIssue(transaction.id, text.trim());
      onReported();
    } catch (err) {
      setSubmitError(errorSource(err, "bill.report.failed"));
      setSubmitting(false);
    }
  }

  return (
    <Dialog title={t("bill.report.title")} onClose={onClose} closeDisabled={submitting}>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <p className="mb-4 text-[13px] text-muted">
          {t("bill.report.intro", { date: formatDate(transaction.createdAt), amount: formatVnd(transaction.amountVnd) })}
        </p>
        <Field label={t("bill.report.label")} error={fieldError}>
          <textarea
            data-autofocus
            name="description"
            autoComplete="off"
            rows={5}
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            className={`${INPUT_CLASS} resize-y`}
          />
        </Field>
        <p
          className={`mb-4 mt-1 text-right text-xs ${length > PAYMENT_ISSUE_DESCRIPTION_MAX ? "text-danger" : "text-muted"}`}
        >
          {length}/{PAYMENT_ISSUE_DESCRIPTION_MAX}
        </p>
        <DialogError message={renderError(submitError)} />
        <DialogActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            {t("bill.report.cancel")}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? t("bill.report.sending") : t("bill.report.submit")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
