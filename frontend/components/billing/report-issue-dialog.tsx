"use client";

import { useState } from "react";
import { PAYMENT_ISSUE_DESCRIPTION_MAX, type TransactionHistoryItem } from "@stave/shared-types";
import { reportPaymentIssue } from "../../lib/api-billing";
import { validateIssueDescription } from "../../lib/billing-history";
import { apiErrorMessage } from "../../lib/error-message";
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
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
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
      setSubmitError(apiErrorMessage(err, "Không gửi được sự cố."));
      setSubmitting(false);
    }
  }

  return (
    <Dialog title="Báo sự cố thanh toán" onClose={onClose} closeDisabled={submitting}>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <p className="mb-4 text-[13px] text-muted">
          Giao dịch ngày {formatDate(transaction.createdAt)}, {formatVnd(transaction.amountVnd)}. Quản trị viên sẽ kiểm tra
          và phản hồi qua thông báo.
        </p>
        <Field label="Mô tả sự cố" error={fieldError}>
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
        <DialogError message={submitError} />
        <DialogActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Đang gửi…" : "Gửi sự cố"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
