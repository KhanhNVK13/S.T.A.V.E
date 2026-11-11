"use client";

import { use, useCallback, useState } from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import {
  getAdminPaymentIssue,
  resolveAdminPaymentIssue,
  type PaymentIssueRemedy,
  type AdminPaymentIssueTransaction,
  type PaymentIssueVerification,
} from "../../../../lib/api-admin-payment-issues";
import { errorSource, renderError, type ErrorSource } from "../../../../lib/error-message";
import { useApiResource } from "../../../../lib/use-api-resource";
import { formatDateTime } from "../../../../lib/format-date";
import { formatVnd } from "../../../../lib/format-vnd";
import { useI18n } from "../../../../context/i18n-context";
import type { TKey } from "../../../../lib/i18n";
import { PageHeader } from "../../../../components/ui/page-header";
import { Card } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { ConfirmDialog } from "../../../../components/ui/confirm-dialog";
import { Field, INPUT_CLASS } from "../../../../components/ui/form";
import { RowList, RowHeader, RowItem, RowTime } from "../../../../components/ui/row-list";

const NOTE_MAX = 1000;

const REMEDY_LABEL: Record<PaymentIssueRemedy, TKey> = {
  extend: "pi.remedy.extend",
  refund: "pi.remedy.refund",
  activate: "pi.remedy.activate",
  dismiss: "pi.remedy.dismiss",
};

const REMEDY_HINT: Record<PaymentIssueRemedy, TKey> = {
  extend: "pi.remedy.extendHint",
  refund: "pi.remedy.refundHint",
  activate: "pi.remedy.activateHint",
  dismiss: "pi.remedy.dismissHint",
};

const KIND_LABEL: Record<AdminPaymentIssueTransaction["kind"], TKey> = {
  charge: "pi.kind.charge",
  refund: "pi.kind.refund",
  compensation: "pi.kind.compensation",
};

const TX_STATUS_LABEL: Record<AdminPaymentIssueTransaction["status"], TKey> = {
  success: "pi.status.success",
  failed: "pi.status.failed",
  pending: "pi.status.pending",
};

export default function AdminPaymentIssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t } = useI18n();
  const { id } = use(params);

  const [reloadKey, setReloadKey] = useState(0);

  const [remedy, setRemedy] = useState<PaymentIssueRemedy>("extend");
  const [days, setDays] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundRef, setRefundRef] = useState("");
  const [duplicateOf, setDuplicateOf] = useState("");
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState<ErrorSource | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resolved, setResolved] = useState(false);

  const { data: detail, loading: detailLoading, error: loadError } =
    useApiResource(
      () => getAdminPaymentIssue(id),
      [id, reloadKey],
      t("pi.detailFail"),
    );

  const reverify = useCallback(() => setReloadKey((n) => n + 1), []);

  const unavailable = detail?.verification === "unavailable";

  function chooseRemedy(next: PaymentIssueRemedy) {
    if (unavailable && next !== "dismiss") return;
    setRemedy(next);
  }

  const noteTrimmed = note.trim();
  const noteError =
    noteTrimmed.length === 0
      ? t("pi.noteRequired")
      : note.length > NOTE_MAX
        ? t("pi.noteTooLong", { max: NOTE_MAX })
        : null;

  const refundMax = detail?.transaction?.amount_vnd ?? 0;

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await resolveAdminPaymentIssue(id, {
        remedy,
        note: noteTrimmed,
        days: remedy === "extend" ? Number(days) : undefined,
        refundAmountVnd:
          remedy === "refund" ? Number(refundAmount) : undefined,
        refundRef: remedy === "refund" ? refundRef : undefined,
        duplicateOfIssueId:
          remedy === "dismiss" ? duplicateOf || undefined : undefined,
      });
      setResolved(true);
      setConfirmOpen(false);
      setReloadKey((n) => n + 1);
    } catch (err) {
      setSubmitError(errorSource(err, "pi.resolveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div>
        <PageHeader
          title={t("pi.title")}
          breadcrumbs={[
            { label: t("pi.title"), href: "/admin/payment-issues" },
            { label: id },
          ]}
        />
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-sm text-danger"
        >
          <span>{loadError}</span>
          <Button variant="secondary" onClick={reverify}>
            {t("ui.retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (detailLoading || !detail) {
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 py-16 text-sm text-muted"
      >
        <Loader2
          aria-hidden="true"
          className="h-4 w-4 animate-spin text-accent"
        />{" "}
        {t("ui.loading")}
      </div>
    );
  }

  const { issue, account, timeline } = detail;
  const isResolved = resolved || issue.status === "resolved";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t("pi.title")}
        breadcrumbs={[
          { label: t("pi.back"), href: "/admin/payment-issues" },
          { label: issue.description },
        ]}
      />

      <Card className="mb-5 px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {isResolved ? (
            <Badge variant="success">{t("pi.resolvedBadge")}</Badge>
          ) : (
            <Badge variant="warning">{t("pi.openBadge")}</Badge>
          )}
          <span className="font-mono text-xs text-muted">{issue.id}</span>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-muted">{t("pi.issueId")}</dt>
            <dd className="font-mono text-xs">{issue.id}</dd>
          </div>
          <div>
            <dt className="text-muted">{t("pi.transactionId")}</dt>
            <dd className="font-mono text-xs">{issue.transactionId}</dd>
          </div>
          <div>
            <dt className="text-muted">{t("pi.reportedBy")}</dt>
            <dd className="text-xs">
              {detail.reporter
                ? detail.reporter.display_name || detail.reporter.username
                : t("pi.reportedBySystem")}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t("pi.colCreated")}</dt>
            <dd className="font-mono text-xs">{formatDateTime(issue.createdAt)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">{t("pi.customer")}</dt>
            <dd className="text-xs">
              {account ? (
                <>
                  {account.display_name || account.username}{" "}
                  <span className="text-muted">({account.email ?? "—"})</span>
                </>
              ) : (
                <>
                  <Badge variant="danger">{t("pi.accountDeleted")}</Badge>{" "}
                  <span>
                    {detail.payerName || t("pi.unknownName")} ·{" "}
                    {detail.payerEmail ?? "—"}
                  </span>
                </>
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">{t("pi.descriptionLabel")}</dt>
            <dd className="text-xs">{issue.description}</dd>
          </div>
        </dl>

        {isResolved && (
          <div className="mt-4 rounded-card border border-border bg-surface-subtle px-3 py-2 text-[13px]">
            <span className="font-semibold">
              {t("pi.resolvedWith", {
                remedy: t(REMEDY_LABEL[issue.remedy ?? "dismiss"]),
              })}
            </span>
            {issue.resolvedAt && (
              <div className="mt-1 text-xs text-muted">
                {t("pi.resolvedAt")}: {formatDateTime(issue.resolvedAt)}
              </div>
            )}
            <p className="mt-1 text-xs">{issue.note ?? t("pi.noNote")}</p>
          </div>
        )}
      </Card>

      <Card className="mb-5 px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("pi.verification")}</h2>
          <div className="flex items-center gap-2">
            <VerificationBadge verification={detail.verification} />
            {unavailable && (
              <Button variant="secondary" onClick={reverify}>
                <RotateCw aria-hidden="true" className="h-3.5 w-3.5" />{" "}
                {t("pi.reverify")}
              </Button>
            )}
          </div>
        </div>
        {detail.verificationDetail && (
          <p className="text-xs text-muted">{detail.verificationDetail}</p>
        )}
        {unavailable && (
          <div
            role="alert"
            className="mt-3 flex gap-2 rounded-card bg-danger-muted px-3 py-2 text-[13px] text-danger"
          >
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>{t("pi.verifUnavailableHint")}</span>
          </div>
        )}
      </Card>

      <section className="mb-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
          {t("pi.timeline")}
        </h2>
        {timeline.length === 0 ? (
          <p className="text-[13px] text-muted">{t("pi.timelineEmpty")}</p>
        ) : (
          <RowList cols="md:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_96px_auto]">
            <RowHeader>
              <span>{t("pi.orderCode")}</span>
              <span>{t("pi.amount")}</span>
              <span>{t("pi.txKind")}</span>
              <span>{t("pi.txStatus")}</span>
              <span>{t("pi.colCreated")}</span>
            </RowHeader>
            {timeline.map((row) => (
              <RowItem key={row.id}>
                <span className="font-mono text-xs">
                  {row.order_code ?? "—"}
                  {row.provider_ref && (
                    <span className="ml-2 text-muted">{row.provider_ref}</span>
                  )}
                </span>
                <span className="font-mono text-xs tabular-nums">
                  {formatVnd(row.amount_vnd)}
                </span>
                <span className="text-xs">{t(KIND_LABEL[row.kind])}</span>
                <TxStatusBadge status={row.status} />
                <RowTime>{formatDateTime(row.created_at)}</RowTime>
              </RowItem>
            ))}
          </RowList>
        )}
      </section>

      {!isResolved && (
        <ResolveForm
          unavailable={unavailable}
          remedy={remedy}
          onRemedy={chooseRemedy}
          days={days}
          onDays={setDays}
          refundAmount={refundAmount}
          onRefundAmount={setRefundAmount}
          refundRef={refundRef}
          onRefundRef={setRefundRef}
          duplicateOf={duplicateOf}
          onDuplicateOf={setDuplicateOf}
          note={note}
          onNote={setNote}
          noteError={noteError}
          refundMax={refundMax}
          onOpenConfirm={() => setConfirmOpen(true)}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={t("pi.confirmTitle")}
        message={t("pi.confirmBody")}
        confirmLabel={t("pi.submit")}
        loading={submitting}
        error={renderError(submitError)}
        onConfirm={submit}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function VerificationBadge({
  verification,
}: {
  verification: PaymentIssueVerification;
}) {
  const { t } = useI18n();
  if (verification === "match") {
    return <Badge variant="success">{t("pi.verifMatch")}</Badge>;
  }
  if (verification === "mismatch") {
    return <Badge variant="warning">{t("pi.verifMismatch")}</Badge>;
  }
  if (verification === "skipped") {
    return <Badge variant="neutral">{t("pi.verifSkipped")}</Badge>;
  }
  return <Badge variant="danger">{t("pi.verifUnavailable")}</Badge>;
}

function TxStatusBadge({
  status,
}: {
  status: AdminPaymentIssueTransaction["status"];
}) {
  const { t } = useI18n();
  if (status === "success") {
    return <Badge variant="success">{t(TX_STATUS_LABEL.success)}</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="danger">{t(TX_STATUS_LABEL.failed)}</Badge>;
  }
  return <Badge variant="warning">{t(TX_STATUS_LABEL.pending)}</Badge>;
}

interface ResolveFormProps {
  unavailable: boolean;
  remedy: PaymentIssueRemedy;
  onRemedy: (remedy: PaymentIssueRemedy) => void;
  days: string;
  onDays: (value: string) => void;
  refundAmount: string;
  onRefundAmount: (value: string) => void;
  refundRef: string;
  onRefundRef: (value: string) => void;
  duplicateOf: string;
  onDuplicateOf: (value: string) => void;
  note: string;
  onNote: (value: string) => void;
  noteError: string | null;
  refundMax: number;
  onOpenConfirm: () => void;
}

function ResolveForm({
  unavailable,
  remedy,
  onRemedy,
  days,
  onDays,
  refundAmount,
  onRefundAmount,
  refundRef,
  onRefundRef,
  duplicateOf,
  onDuplicateOf,
  note,
  onNote,
  noteError,
  refundMax,
  onOpenConfirm,
}: ResolveFormProps) {
  const { t } = useI18n();
  const remedies: PaymentIssueRemedy[] = [
    "extend",
    "refund",
    "activate",
    "dismiss",
  ];

  const confirmReady =
    !noteError &&
    (remedy === "extend"
      ? days !== ""
      : remedy === "refund"
        ? refundRef !== "" && refundAmount !== ""
        : remedy === "dismiss"
          ? duplicateOf !== ""
          : true);

  return (
    <Card className="px-4 py-4">
      <h2 className="mb-3 text-sm font-semibold">{t("pi.applyRemedy")}</h2>

      {unavailable && (
        <p
          role="note"
          className="mb-3 rounded-card bg-danger-muted px-3 py-2 text-xs text-danger"
        >
          {t("pi.remedyDisabled")}
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold tracking-wide">
          {t("pi.remedy")}
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {remedies.map((option) => {
            const blocked = unavailable && option !== "dismiss";
            const selected = remedy === option;
            return (
              <label
                key={option}
                className={`flex items-start gap-2 rounded-card border px-3 py-2 text-[13px] ${
                  selected
                    ? "border-accent bg-accent-muted"
                    : "border-border bg-surface"
                } ${blocked ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
              >
                <input
                  type="radio"
                  name="remedy"
                  value={option}
                  checked={selected}
                  disabled={blocked}
                  onChange={() => onRemedy(option)}
                  className="mt-0.5 h-4 w-4 accent-accent"
                />
                <span>
                  <span className="block font-semibold">
                    {t(REMEDY_LABEL[option])}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {t(REMEDY_HINT[option])}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 space-y-3">
        {remedy === "extend" && (
          <Field label={t("pi.days")}>
            <input
              name="days"
              autoComplete="off"
              type="number"
              min={1}
              max={90}
              inputMode="numeric"
              className={INPUT_CLASS}
              placeholder="1–90"
              value={days}
              onChange={(e) => onDays(e.target.value)}
              aria-describedby="pi-days-hint"
            />
            <span id="pi-days-hint" className="text-xs text-muted">
              {t("pi.daysHint")}
            </span>
          </Field>
        )}

        {remedy === "refund" && (
          <>
            <Field label={t("pi.refundAmount")}>
              <input
                name="refund-amount"
                autoComplete="off"
                type="number"
                min={1}
                max={refundMax}
                inputMode="numeric"
                className={INPUT_CLASS}
                placeholder={refundMax ? String(refundMax) : ""}
                value={refundAmount}
                onChange={(e) => onRefundAmount(e.target.value)}
                aria-describedby="pi-refund-amount-hint"
              />
              <span id="pi-refund-amount-hint" className="text-xs text-muted">
                {t("pi.refundAmountHint")}
              </span>
            </Field>
            <Field label={t("pi.refundRef")}>
              <input
                name="refund-ref"
                autoComplete="off"
                type="text"
                className={INPUT_CLASS}
                value={refundRef}
                onChange={(e) => onRefundRef(e.target.value)}
                aria-describedby="pi-refund-ref-hint"
              />
              <span id="pi-refund-ref-hint" className="text-xs text-muted">
                {t("pi.refundRefHint")}
              </span>
            </Field>
          </>
        )}

        {remedy === "dismiss" && (
          <Field label={t("pi.duplicateOf")}>
            <input
              name="duplicate-of"
              autoComplete="off"
              type="text"
              className={INPUT_CLASS}
              placeholder="00000000-0000-0000-0000-000000000000"
              value={duplicateOf}
              onChange={(e) => onDuplicateOf(e.target.value)}
              aria-describedby="pi-dup-hint"
            />
            <span id="pi-dup-hint" className="text-xs text-muted">
              {t("pi.duplicateOfHint")}
            </span>
          </Field>
        )}

        <Field label={t("pi.note")} error={noteError}>
          <textarea
            name="note"
            autoComplete="off"
            className={INPUT_CLASS}
            rows={3}
            value={note}
            onChange={(e) => onNote(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{t("pi.noteHint")}</span>
            <span
              className={`font-mono text-xs ${
                note.length > NOTE_MAX ? "text-danger" : "text-muted"
              }`}
            >
              {t("pi.noteCounter", { n: note.length, max: NOTE_MAX })}
            </span>
          </div>
        </Field>
      </div>

      <div className="mt-4">
        <Button
          onClick={onOpenConfirm}
          disabled={!confirmReady}
          type="button"
        >
          {t("pi.submit")}
        </Button>
      </div>
    </Card>
  );
}
