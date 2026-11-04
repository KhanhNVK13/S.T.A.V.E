"use client";

import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, Loader2, Lock, Trash2 } from "lucide-react";
import type {
  AvailableJamProjectDto,
  ConfigureJamEventDto,
  JamEvent,
} from "@stave/shared-types";
import { Dialog, DialogActions } from "../ui/dialog";
import { Button } from "../ui/button";
import { FieldError, INPUT_CLASS } from "../ui/form";
import { adminCancelJamEvent, adminConfigureJamEvent } from "../../lib/api-jam";
import { apiErrorMessage } from "../../lib/error-message";
import { useI18n } from "../../context/i18n-context";

export interface AdminJamConfigDialogProps {
  event: JamEvent;
  projects: AvailableJamProjectDto[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onCancelled?: (message: string) => void;
}

/** `datetime-local` input (local time) → ISO string formatting helper */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function AdminJamConfigDialog({
  event,
  projects,
  onClose,
  onSaved,
  onCancelled,
}: AdminJamConfigDialogProps) {
  const { t, tx } = useI18n();
  const isActive = event.status === "active";
  const isScheduled = event.status === "scheduled";
  const isEndedOrCancelled =
    event.status === "ended" || event.status === "cancelled";

  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description ?? "");
  const [startAt, setStartAt] = useState(toLocalInput(event.scheduled_start_at));
  const [endAt, setEndAt] = useState(toLocalInput(event.scheduled_end_at));
  const [startingProjectId, setStartingProjectId] = useState(
    event.starting_project_id ?? "",
  );
  const [cooldown, setCooldown] = useState<string>(
    event.edit_cooldown_sec == null ? "" : String(event.edit_cooldown_sec),
  );

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const selectedProjectName = useMemo(() => {
    if (!startingProjectId) return t("ac.noProject");
    const found = projects.find((p) => p.id === startingProjectId);
    return found ? found.name : startingProjectId.slice(0, 8);
  }, [startingProjectId, projects, t]);

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!isActive && !name.trim()) {
      nextErrors.name = t("ac.nameRequired");
    }

    if (endAt) {
      const endMs = new Date(endAt).getTime();
      if (Number.isNaN(endMs)) {
        nextErrors.end = t("ac.endInvalid");
      } else if (endMs <= Date.now()) {
        nextErrors.end = t("ac.endTooEarly");
      } else if (!isActive && startAt) {
        const startMs = new Date(startAt).getTime();
        if (!Number.isNaN(startMs) && endMs <= startMs) {
          nextErrors.end = t("ac.endTooEarly");
        }
      }
    } else {
      nextErrors.end = t("ac.endRequired");
    }

    if (!isActive && startAt) {
      const startMs = new Date(startAt).getTime();
      if (Number.isNaN(startMs)) {
        nextErrors.start = t("ac.startInvalid");
      }
    }

    if (cooldown !== "") {
      const c = Number(cooldown);
      if (!Number.isInteger(c) || c < 1 || c > 3600) {
        nextErrors.cooldown = t("ac.cooldownInvalid");
      }
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  async function handleSave() {
    setError(null);
    if (!validate()) return;

    const patch: ConfigureJamEventDto = {};
    if (isActive) {
      // 2.E1 — when active: only extend end time and edit cooldown
      if (endAt) patch.scheduledEndAt = new Date(endAt).toISOString();
      if (cooldown !== "") patch.editCooldownSec = Number(cooldown);
    } else {
      patch.name = name.trim();
      patch.description = description.trim() || undefined;
      if (startAt) patch.scheduledStartAt = new Date(startAt).toISOString();
      if (endAt) patch.scheduledEndAt = new Date(endAt).toISOString();
      patch.startingProjectId = startingProjectId || undefined;
      if (cooldown !== "") patch.editCooldownSec = Number(cooldown);
    }

    setSubmitting(true);
    try {
      await adminConfigureJamEvent(event.id, patch);
      onSaved(t("ac.saved"));
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t("ac.saveFail")));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelEvent() {
    setError(null);
    setCancelling(true);
    try {
      await adminCancelJamEvent(event.id);
      onCancelled?.(
        t("aj.cancelDone", { name: event.name }),
      );
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t("ac.cancelFail")));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Dialog
      title={
        <div className="flex items-center justify-between gap-3 pr-6">
          <div className="flex items-center gap-2">
            <span>{t("ac.title")}</span>
          </div>
          <span className="truncate text-xs font-normal text-muted">
            {event.name}
          </span>
        </div>
      }
      titleClassName="text-foreground text-base"
      onClose={onClose}
      closeDisabled={submitting || cancelling}
      className="max-w-xl p-6"
    >
      {isEndedOrCancelled ? (
        <div className="rounded-card border border-border bg-surface-subtle p-4 text-sm text-muted">
          <p className="font-medium text-foreground">
            {t("ac.endedNoChange")}
          </p>
          <p className="mt-1 text-xs">
            {tx("ac.currentStatus", { status: <strong>{event.status === "ended" ? t("aj.ended") : t("aj.cancelledWord")}</strong> })}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Warning banner for active event */}
          {isActive && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-card border border-warning/30 bg-warning-muted/40 p-3 text-xs text-foreground"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p className="font-semibold text-warning">
                  {t("ac.liveTitle")}
                </p>
                <p className="mt-0.5 text-muted">
                  {t("ac.liveBody")}
                </p>
              </div>
            </div>
          )}

          {/* Form fields */}
          <div className="space-y-3.5">
            {/* Tên sự kiện */}
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="flex items-center justify-between font-medium">
                <span>{t("ac.name")}</span>
                {isActive && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Lock className="h-3 w-3" /> {t("ac.locked")}
                  </span>
                )}
              </span>
              <input
                name="jam-name"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                disabled={isActive}
                placeholder={t("ac.namePlaceholder")}
                aria-label={t("ac.name")}
                className={`${INPUT_CLASS} w-full ${
                  isActive ? "cursor-not-allowed opacity-60 bg-surface-subtle" : ""
                }`}
              />
              {fieldErrors.name && <FieldError>{fieldErrors.name}</FieldError>}
            </label>

            {/* Mô tả (tuỳ chọn) */}
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="flex items-center justify-between font-medium">
                <span>{t("ac.desc")}</span>
                {isActive && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Lock className="h-3 w-3" /> {t("ac.locked")}
                  </span>
                )}
              </span>
              <textarea
                name="jam-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={2000}
                disabled={isActive}
                placeholder={t("ac.descPlaceholder")}
                className={`${INPUT_CLASS} w-full resize-y ${
                  isActive ? "cursor-not-allowed opacity-60 bg-surface-subtle" : ""
                }`}
              />
            </label>

            {/* Khung giờ: Bắt đầu & Kết thúc */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-[13px]">
                <span className="flex items-center justify-between font-medium">
                  <span>{t("ac.start")}</span>
                  {isActive && (
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <Lock className="h-3 w-3" /> {t("ac.started")}
                    </span>
                  )}
                </span>
                <input
                  name="jam-start"
                  autoComplete="off"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  disabled={isActive}
                  className={`${INPUT_CLASS} w-full ${
                    isActive ? "cursor-not-allowed opacity-60 bg-surface-subtle" : ""
                  }`}
                />
                {fieldErrors.start && (
                  <FieldError>{fieldErrors.start}</FieldError>
                )}
              </label>

              <label className="flex flex-col gap-1.5 text-[13px]">
                <span className="flex items-center justify-between font-medium">
                  <span>
                    {isActive ? t("ac.extendEnd") : t("ac.end")}
                  </span>
                  <span className="text-xs text-accent">{t("ac.unlocked")}</span>
                </span>
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

            {/* Dự án khởi đầu */}
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="flex items-center justify-between font-medium">
                <span>{t("ac.startProject")}</span>
                {isActive && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Lock className="h-3 w-3" /> {t("ac.locked")}
                  </span>
                )}
              </span>
              <select
                name="jam-starting-project"
                value={startingProjectId}
                onChange={(e) => setStartingProjectId(e.target.value)}
                disabled={isActive}
                className={`${INPUT_CLASS} w-full ${
                  isActive ? "cursor-not-allowed opacity-60 bg-surface-subtle" : ""
                }`}
              >
                <option value="">{t("ac.emptyOption")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">
                {tx("ac.projectHint", { name: <strong>{selectedProjectName}</strong> })}
              </span>
            </label>

            {/* Cooldown */}
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="flex items-center justify-between font-medium">
                <span>{t("ac.cooldown")}</span>
                <span className="text-xs text-accent">{t("ac.unlocked")}</span>
              </span>
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
              {fieldErrors.cooldown && (
                <FieldError>{fieldErrors.cooldown}</FieldError>
              )}
              <span className="text-xs text-muted">
                {t("ac.cooldownHint")}
              </span>
            </label>
          </div>

          {/* Confirm Cancel Danger Section for Scheduled Events */}
          {isScheduled && (
            <div className="mt-4 rounded-card border border-danger/30 bg-danger-muted/30 p-3.5">
              {!confirmCancel ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-muted">
                    <p className="font-semibold text-danger">{t("ac.cancelHead")}</p>
                    <p>{t("ac.cancelHint")}</p>
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    className="h-7 px-2 text-xs"
                    onClick={() => setConfirmCancel(true)}
                    disabled={submitting || cancelling}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    {t("ac.cancelThis")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <p className="font-semibold text-danger">
                    {t("ac.confirmCancel", { name: event.name })}
                  </p>
                  <p className="text-muted">
                    {tx("ac.confirmCancelBody", { cancelled: <strong>{t("aj.cancelledWord")}</strong> })}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="danger"
                      className="h-7 px-2 text-xs"
                      onClick={() => void handleCancelEvent()}
                      disabled={cancelling}
                    >
                      {cancelling ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          {t("ac.cancellingDots")}
                        </>
                      ) : (
                        t("ac.sure")
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-7 px-2 text-xs"
                      onClick={() => setConfirmCancel(false)}
                      disabled={cancelling}
                    >
                      {t("ac.keep")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error banner role="alert" */}
      {error && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-2 rounded-card border border-danger/30 bg-danger-muted p-3 text-xs text-danger"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="h-7 px-2 text-xs"
            onClick={() => void handleSave()}
            disabled={submitting}
          >
            {t("ui.retry")}
          </Button>
        </div>
      )}

      {/* Dialog actions */}
      <div className="mt-6">
        <DialogActions>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting || cancelling}
          >
            {t("aj.close")}
          </Button>
          {!isEndedOrCancelled && (
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleSave()}
              disabled={submitting || cancelling}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  {t("ac.savingDots")}
                </>
              ) : (
                t("ac.saveChanges")
              )}
            </Button>
          )}
        </DialogActions>
      </div>
    </Dialog>
  );
}
