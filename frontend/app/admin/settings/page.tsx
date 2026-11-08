"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CUSTOM_SOUND_QUOTA_KEY } from "@stave/shared-types";
import type {
  PlatformSettingItem,
  PlatformSettingsResponse,
  SettingChange,
  SettingErrorCode,
} from "@stave/shared-types";
import { PageHeader } from "../../../components/ui/page-header";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { FieldError, INPUT_CLASS } from "../../../components/ui/form";
import { useI18n } from "../../../context/i18n-context";
import { apiErrorMessage } from "../../../lib/error-message";
import type { TKey } from "../../../lib/i18n";
import {
  getPlatformSettings,
  readReductionRequired,
  readValidationErrors,
  updatePlatformSettings,
} from "../../../lib/admin-settings-api";
import {
  displayRange,
  formatMb,
  isDirty,
  parseFieldDraft,
  toFieldDraft,
  unitLabelKey,
  type FieldDraft,
} from "./settings-form";

type Status = "loading" | "error" | "ready";

const GROUP_LABELS: Record<string, TKey> = {
  limits: "aps.group.limits",
  community: "aps.group.community",
  registration: "aps.group.registration",
  retention: "aps.group.retention",
};

const TEXTS: Record<string, { label: TKey; help: TKey }> = {
  custom_sound_quota_bytes: { label: "aps.label.custom_sound_quota_bytes", help: "aps.help.custom_sound_quota_bytes" },
  price_change_notice_days: { label: "aps.label.price_change_notice_days", help: "aps.help.price_change_notice_days" },
  jam_edit_cooldown_sec: { label: "aps.label.jam_edit_cooldown_sec", help: "aps.help.jam_edit_cooldown_sec" },
  registration_enabled: { label: "aps.label.registration_enabled", help: "aps.help.registration_enabled" },
  moderation_retention_days: { label: "aps.label.moderation_retention_days", help: "aps.help.moderation_retention_days" },
};

interface PendingReduction {
  usedMb: string;
  limitMb: string;
}

function draftsFrom(data: PlatformSettingsResponse): Record<string, FieldDraft> {
  const drafts: Record<string, FieldDraft> = {};
  for (const group of data.groups) {
    for (const item of group.items) drafts[item.key] = toFieldDraft(item, item.value);
  }
  return drafts;
}

function SettingRow({
  item,
  draft,
  error,
  disabled,
  onChange,
}: {
  item: PlatformSettingItem;
  draft: FieldDraft;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: FieldDraft) => void;
}) {
  const { t } = useI18n();
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const helpId = `${baseId}-help`;
  const rangeId = `${baseId}-range`;
  const errorId = `${baseId}-error`;
  const texts = TEXTS[item.key];
  const label = texts ? t(texts.label) : item.key;
  const help = texts ? t(texts.help) : "";
  const range = displayRange(item);
  const unit = t(unitLabelKey(item));

  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="min-w-0 sm:max-w-md">
        {item.type === "boolean" ? (
          <span id={labelId} className="text-[13px] font-semibold">
            {label}
          </span>
        ) : (
          <label id={labelId} htmlFor={`${baseId}-input`} className="text-[13px] font-semibold">
            {label}
          </label>
        )}
        {help && (
          <p id={helpId} className="mt-0.5 text-xs text-muted">
            {help}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5 sm:w-64 sm:shrink-0">
        {item.type === "boolean" ? (
          <div className="flex items-center gap-3">
            <Switch
              checked={draft === true}
              onChange={onChange}
              disabled={disabled}
              labelledBy={labelId}
              describedBy={error ? `${helpId} ${errorId}` : helpId}
            />
            <span aria-hidden="true" className="text-xs text-muted">
              {draft === true ? t("aps.on") : t("aps.off")}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                id={`${baseId}-input`}
                name={item.key}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={typeof draft === "string" ? draft : ""}
                disabled={disabled}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${rangeId} ${errorId}` : rangeId}
                onChange={(e) => onChange(e.target.value)}
                className={`${INPUT_CLASS} w-28`}
              />
              <span className="text-xs text-muted">{unit}</span>
            </div>
            <p id={rangeId} className="text-xs text-muted">
              {t("aps.range", { min: range.min, max: range.max, unit })}
            </p>
          </>
        )}
        {error && <FieldError id={errorId}>{error}</FieldError>}
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<PlatformSettingsResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, FieldDraft>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<PendingReduction | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (): Promise<boolean> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const next = await getPlatformSettings(controller.signal);
      if (controller.signal.aborted) return false;
      setData(next);
      setDrafts(draftsFrom(next));
      setFieldErrors({});
      setStatus("ready");
      return true;
    } catch {
      if (controller.signal.aborted) return false;
      setData(null);
      setStatus("error");
      return false;
    }
  }, []);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const items = data ? data.groups.flatMap((g) => g.items) : [];
  const dirtyKeys = items.filter((item) => isDirty(item, drafts[item.key] ?? "", item.value)).map((item) => item.key);
  const hasChanges = dirtyKeys.length > 0;

  function fieldMessage(item: PlatformSettingItem, code: SettingErrorCode): string {
    const range = displayRange(item);
    const vars = { min: range.min, max: range.max, unit: t(unitLabelKey(item)) };
    if (code === "not_integer") return t("aps.err.notInteger", vars);
    if (code === "out_of_range") return t("aps.err.outOfRange", vars);
    if (code === "not_boolean") return t("aps.err.notBoolean");
    return t("aps.err.generic");
  }

  function discard() {
    if (!data) return;
    setDrafts(draftsFrom(data));
    setFieldErrors({});
    setSaveError(null);
    setSaved(false);
  }

  function setDraft(key: string, value: FieldDraft) {
    setDrafts((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: removed, ...rest } = prev;
      void removed;
      return rest;
    });
    setSaved(false);
  }

  async function submit(confirmReduction: boolean) {
    const errors: Record<string, string> = {};
    const changes: SettingChange[] = [];
    for (const item of items) {
      if (!dirtyKeys.includes(item.key)) continue;
      const parsed = parseFieldDraft(item, drafts[item.key] ?? "");
      if (parsed.ok) changes.push({ key: item.key, value: parsed.value });
      else errors[item.key] = fieldMessage(item, parsed.code);
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || changes.length === 0) return;

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await updatePlatformSettings(confirmReduction ? { changes, confirmReduction: true } : { changes });
      setPending(null);
      if (await load()) setSaved(true);
    } catch (err) {
      const reduction = readReductionRequired(err);
      if (reduction && !confirmReduction) {
        const quota = changes.find((c) => c.key === CUSTOM_SOUND_QUOTA_KEY);
        setPending({
          usedMb: formatMb(reduction.maxUsageBytes),
          limitMb: formatMb(typeof quota?.value === "number" ? quota.value : 0),
        });
        return;
      }
      setPending(null);
      const serverErrors = readValidationErrors(err);
      if (serverErrors) {
        const mapped: Record<string, string> = {};
        let unmatched = false;
        for (const e of serverErrors) {
          const item = items.find((i) => i.key === e.key);
          if (item) mapped[item.key] = fieldMessage(item, e.code);
          else unmatched = true;
        }
        setFieldErrors(mapped);
        if (unmatched) setSaveError(t("aps.err.generic"));
        return;
      }
      setSaveError(apiErrorMessage(err, t("aps.saveFail")));
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title={t("aps.title")} description={t("aps.description")} />

      {saveError && (
        <div role="alert" className="mb-4 rounded-card border border-danger/30 bg-danger-muted px-4 py-3 text-sm text-danger">
          {saveError}
        </div>
      )}

      {status === "loading" && (
        <p role="status" className="py-10 text-center text-sm text-muted">
          {t("ui.loading")}
        </p>
      )}

      {status === "error" && (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/30 bg-danger-muted px-4 py-4 text-sm text-danger">
          <p>{t("aps.loadFail")}</p>
          <Button
            variant="secondary"
            onClick={() => {
              setStatus("loading");
              void load();
            }}
          >
            {t("ui.retry")}
          </Button>
        </div>
      )}

      {status === "ready" && data && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
          className="flex flex-col gap-5"
        >
          {data.groups.map((group) => (
            <Card key={group.group} className="p-5">
              <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-accent">
                {GROUP_LABELS[group.group] ? t(GROUP_LABELS[group.group]) : group.group}
              </h2>
              <div className="mt-1 divide-y divide-border">
                {group.items.map((item) => (
                  <SettingRow
                    key={item.key}
                    item={item}
                    draft={drafts[item.key] ?? ""}
                    error={fieldErrors[item.key]}
                    disabled={saving}
                    onChange={(value) => setDraft(item.key, value)}
                  />
                ))}
              </div>
            </Card>
          ))}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <p role="status" className="mr-auto text-xs text-muted">
              {saved ? t("aps.saved") : hasChanges ? t("aps.unsaved") : ""}
            </p>
            <Button type="button" variant="secondary" onClick={discard} disabled={!hasChanges || saving}>
              {t("ui.cancel")}
            </Button>
            <Button type="submit" disabled={!hasChanges || saving}>
              {saving ? t("aps.saving") : t("aps.save")}
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={t("aps.confirmTitle")}
        message={pending ? t("aps.confirmBody", { used: pending.usedMb, limit: pending.limitMb }) : ""}
        confirmLabel={t("aps.confirmLower")}
        loading={saving}
        onConfirm={() => void submit(true)}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
