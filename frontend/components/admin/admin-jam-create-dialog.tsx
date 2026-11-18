"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { AvailableJamProjectDto } from "@stave/shared-types";
import { Dialog, DialogActions } from "../ui/dialog";
import { Button } from "../ui/button";
import { FieldError, INPUT_CLASS } from "../ui/form";
import { adminCreateJamEvent } from "../../lib/api-jam";
import { ApiError } from "../../lib/api-client";
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { useI18n } from "../../context/i18n-context";

export interface AdminJamCreateDialogProps {
  projects: AvailableJamProjectDto[];
  onClose: () => void;
  onCreated: (message: string) => void;
}

function isOverlap(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  const body = err.body as { code?: string } | undefined;
  return body?.code === "JAM_OVERLAP_CONFLICT";
}

export function AdminJamCreateDialog({ projects, onClose, onCreated }: AdminJamCreateDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [startingProjectId, setStartingProjectId] = useState("");
  const [cooldown, setCooldown] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<ErrorSource | null>(null);
  const [overlap, setOverlap] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t("ac.nameRequired");
    const startMs = startAt ? new Date(startAt).getTime() : NaN;
    const endMs = endAt ? new Date(endAt).getTime() : NaN;
    if (!startAt) next.start = t("ac.startRequired");
    else if (Number.isNaN(startMs)) next.start = t("ac.startInvalid");
    if (!endAt) next.end = t("ac.endRequired");
    else if (Number.isNaN(endMs)) next.end = t("ac.endInvalid");
    else if (!Number.isNaN(startMs) && endMs <= startMs) next.end = t("ac.endBeforeStart");
    if (cooldown !== "") {
      const value = Number(cooldown);
      if (!Number.isInteger(value) || value < 1 || value > 3600) next.cooldown = t("ac.cooldownInvalid");
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(confirmOverlap: boolean) {
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await adminCreateJamEvent({
        name: name.trim(),
        description: description.trim() || undefined,
        scheduledStartAt: new Date(startAt).toISOString(),
        scheduledEndAt: new Date(endAt).toISOString(),
        startingProjectId: startingProjectId || undefined,
        editCooldownSec: cooldown === "" ? undefined : Number(cooldown),
        confirmOverlap: confirmOverlap || undefined,
      });
      onCreated(t("ac.created", { name: name.trim() }));
      onClose();
    } catch (err) {
      if (isOverlap(err)) setOverlap(true);
      else setError(errorSource(err, "ac.createFail"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title={t("ac.createTitle")}
      titleClassName="text-foreground text-base"
      onClose={onClose}
      closeDisabled={submitting}
      className="max-w-xl p-6"
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
        className="space-y-3.5"
      >
        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">{t("ac.name")}</span>
          <input
            name="jam-name"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder={t("ac.namePlaceholder")}
            className={`${INPUT_CLASS} w-full`}
          />
          {fieldErrors.name && <FieldError>{fieldErrors.name}</FieldError>}
        </label>

        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">{t("ac.desc")}</span>
          <textarea
            name="jam-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={t("ac.descPlaceholder")}
            className={`${INPUT_CLASS} w-full resize-y`}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium">{t("ac.start")}</span>
            <input
              name="jam-start"
              autoComplete="off"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className={`${INPUT_CLASS} w-full`}
            />
            {fieldErrors.start && <FieldError>{fieldErrors.start}</FieldError>}
          </label>
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium">{t("ac.end")}</span>
            <input
              name="jam-end"
              autoComplete="off"
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className={`${INPUT_CLASS} w-full`}
            />
            {fieldErrors.end && <FieldError>{fieldErrors.end}</FieldError>}
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">{t("ac.startProject")}</span>
          <select
            name="jam-starting-project"
            value={startingProjectId}
            onChange={(e) => setStartingProjectId(e.target.value)}
            className={`${INPUT_CLASS} w-full`}
          >
            <option value="">{t("ac.emptyOption")}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">{t("ac.cooldown")}</span>
          <input
            name="jam-cooldown"
            autoComplete="off"
            type="number"
            min={1}
            max={3600}
            value={cooldown}
            onChange={(e) => setCooldown(e.target.value)}
            placeholder="5"
            className={`${INPUT_CLASS} w-full`}
          />
          {fieldErrors.cooldown && <FieldError>{fieldErrors.cooldown}</FieldError>}
        </label>

        {overlap && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-card border border-warning/30 bg-warning-muted/40 p-3 text-xs text-foreground"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="space-y-2">
              <p className="font-semibold">{t("ac.overlapTitle")}</p>
              <p className="text-muted">{t("ac.overlapBody")}</p>
              <div className="flex gap-2">
                <Button type="button" onClick={() => void submit(true)} disabled={submitting}>
                  {t("ac.overlapConfirm")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setOverlap(false)} disabled={submitting}>
                  {t("ac.overlapCancel")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-danger">
            {renderError(error)}
          </p>
        )}

        <DialogActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            {t("ac.keep")}
          </Button>
          <Button type="submit" disabled={submitting || overlap}>
            {submitting && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
            {t("ac.createAction")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
