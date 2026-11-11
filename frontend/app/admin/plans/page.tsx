"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Package, Plus, X } from "lucide-react";
import { PLAN_FEATURES, type PlanFeatureKey } from "@stave/shared-types";
import {
  changeAdminPlanPrice,
  createAdminPlan,
  listAdminPlans,
  setAdminPlanActive,
  type AdminPlanCreatePayload,
  type AdminPlanItem,
} from "../../../lib/api-admin-plans";
import { useI18n, type I18n } from "../../../context/i18n-context";
import { errorSource, renderError, type ErrorSource } from "../../../lib/error-message";
import { formatDateTime } from "../../../lib/format-date";
import { formatVnd } from "../../../lib/format-vnd";
import { PageHeader } from "../../../components/ui/page-header";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Dialog, DialogActions, DialogError } from "../../../components/ui/dialog";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { EmptyState } from "../../../components/ui/empty-state";
import { INPUT_CLASS } from "../../../components/ui/form";

const MIN_EXTRA_STORAGE_MB = 0;
const MAX_EXTRA_STORAGE_MB = 102400;
const NOTICE_DAYS = 7;

type FeatureValues = Record<string, boolean | number>;

const EMPTY_FEATURES: FeatureValues = Object.fromEntries(
  PLAN_FEATURES.map(({ key }) => [key, false]),
);

/** Ngày sớm nhất được đổi giá — admin phải báo trước tối thiểu NOTICE_DAYS ngày. */
function earliestPriceChange(): Date {
  return new Date(Date.now() + NOTICE_DAYS * 24 * 60 * 60 * 1000);
}

function toDateTimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusBadge(plan: AdminPlanItem, t: I18n["t"]) {
  if (plan.isActive) return <Badge variant="success">{t("apl.onSale")}</Badge>;
  if (plan.isDefault) return <Badge variant="neutral">{t("apl.default")}</Badge>;
  return <Badge variant="warning">{t("apl.draft")}</Badge>;
}

function featureLabel(key: PlanFeatureKey, t: I18n["t"]): string {
  return t(`bill.feature.${key}`);
}

function featureOverlapWarnings(
  features: FeatureValues,
  freePlan: AdminPlanItem | null,
  t: I18n["t"],
): string[] {
  if (!freePlan) return [];
  return PLAN_FEATURES.filter(
    ({ key }) => features[key] === true && freePlan.features[key] === true,
  ).map(({ key }) => featureLabel(key, t));
}

function PlanRow({
  plan,
  onPrice,
  onToggle,
}: {
  plan: AdminPlanItem;
  onPrice: (plan: AdminPlanItem) => void;
  onToggle: (plan: AdminPlanItem) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1.3fr)_100px_130px_minmax(150px,1fr)_100px_200px] md:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{plan.name}</p>
        <p className="mt-1 truncate text-xs text-muted">
          {plan.description || t("apl.noDescription")}
        </p>
      </div>
      <span className="text-xs text-muted">{t("apl.perMonth")}</span>
      <span className="font-mono text-sm tabular-nums">
        {formatVnd(plan.priceVnd)}
      </span>
      <div className="min-w-0 text-xs">
        {plan.priceEffectiveAt ? (
          <>
            <p className="font-mono tabular-nums">{formatVnd(plan.priceVnd)}</p>
            <p className="mt-1 text-muted">
              {t("apl.from", { date: formatDateTime(plan.priceEffectiveAt) })}
            </p>
          </>
        ) : (
          <span className="text-muted">{t("apl.noPendingPrice")}</span>
        )}
      </div>
      <span className="font-mono text-sm tabular-nums">
        {plan.subscriberCount.toLocaleString(locale)}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {statusBadge(plan, t)}
        <Button
          type="button"
          variant="secondary"
          onClick={() => onPrice(plan)}
          disabled={plan.isDefault}
        >
          {t("apl.changePrice")}
        </Button>
        {!plan.isDefault && (
          <Button type="button" variant="ghost" onClick={() => onToggle(plan)}>
            {plan.isActive ? t("apl.disable") : t("apl.enable")}
          </Button>
        )}
      </div>
    </div>
  );
}

function CreatePlanDialog({
  open,
  freePlan,
  onClose,
  onCreated,
}: {
  open: boolean;
  freePlan: AdminPlanItem | null;
  onClose: () => void;
  onCreated: (result: { warnings: string[] }) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [extraStorage, setExtraStorage] = useState("0");
  const [features, setFeatures] = useState<FeatureValues>(EMPTY_FEATURES);
  const [error, setError] = useState<ErrorSource | null>(null);
  const [saving, setSaving] = useState<"draft" | "active" | null>(null);

  const selectedOverlap = useMemo(
    () => featureOverlapWarnings(features, freePlan, t),
    [features, freePlan, t],
  );

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- đặt lại biểu mẫu khi đóng hộp
      setName("");
      setPrice("");
      setExtraStorage("0");
      setFeatures(EMPTY_FEATURES);
      setError(null);
      setSaving(null);
    }
  }, [open]);

  function setFeature(key: PlanFeatureKey, value: boolean) {
    setFeatures((current) => ({ ...current, [key]: value }));
  }

  function validate(): AdminPlanCreatePayload | null {
    const trimmedName = name.trim();
    const priceVnd = Number(price);
    const extraStorageMb = Number(extraStorage);
    if (trimmedName.length < 1 || trimmedName.length > 60) {
      setError(errorSource(null, "apl.errName"));
      return null;
    }
    if (!Number.isSafeInteger(priceVnd) || priceVnd < 0) {
      setError(errorSource(null, "apl.errPrice"));
      return null;
    }
    if (
      !Number.isInteger(extraStorageMb) ||
      extraStorageMb < MIN_EXTRA_STORAGE_MB ||
      extraStorageMb > MAX_EXTRA_STORAGE_MB
    ) {
      setError(errorSource(null, "apl.errStorage"));
      return null;
    }
    return {
      name: trimmedName,
      priceVnd,
      features: { ...features, extra_storage_mb: extraStorageMb },
    };
  }

  async function save(status: "draft" | "active") {
    const payload = validate();
    if (!payload) return;
    setSaving(status);
    setError(null);
    try {
      const result = await createAdminPlan({ ...payload, status });
      onCreated(result);
      onClose();
    } catch (err) {
      setError(errorSource(err, "apl.createFailed"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog
      open={open}
      title={t("apl.createTitle")}
      onClose={onClose}
      closeDisabled={saving !== null}
      className="max-w-xl p-6"
    >
      <DialogError message={renderError(error)} />
      <div className="space-y-4">
        <label className="block text-xs text-muted">
          {t("apl.name")}
          <input
            name="plan-name"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            className={`${INPUT_CLASS} mt-1 w-full`}
            placeholder={t("apl.namePlaceholder")}
          />
          <span className="mt-1 block text-xs">
            {t("apl.nameCount", { n: name.trim().length })}
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs text-muted">
            {t("apl.price")}
            <input
              name="plan-price"
              autoComplete="off"
              inputMode="numeric"
              type="number"
              min={0}
              step={1}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className={`${INPUT_CLASS} mt-1 w-full`}
              placeholder="49000"
            />
          </label>
          <label className="block text-xs text-muted">
            {t("apl.cycle")}
            <input
              name="billing-period"
              autoComplete="off"
              value={t("apl.perMonth")}
              readOnly
              className={`${INPUT_CLASS} mt-1 w-full opacity-70`}
            />
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-foreground">
            {t("apl.features")}
          </legend>
          <div className="space-y-2 rounded-card border border-border bg-surface-subtle p-3">
            {PLAN_FEATURES.map((feature) => (
              <label
                key={feature.key}
                className="flex items-center gap-2 text-[13px]"
              >
                <input
                  type="checkbox"
                  checked={features[feature.key] === true}
                  onChange={(event) =>
                    setFeature(feature.key, event.target.checked)
                  }
                  className="h-4 w-4 accent-accent"
                />
                {featureLabel(feature.key, t)}
              </label>
            ))}
            <label className="block pt-2 text-xs text-muted">
              {t("apl.extraStorage")}
              <input
                name="extra-storage-mb"
                autoComplete="off"
                inputMode="numeric"
                type="number"
                min={MIN_EXTRA_STORAGE_MB}
                max={MAX_EXTRA_STORAGE_MB}
                step={1}
                value={extraStorage}
                onChange={(event) => setExtraStorage(event.target.value)}
                className={`${INPUT_CLASS} mt-1 w-full`}
              />
            </label>
          </div>
        </fieldset>

        {selectedOverlap.length > 0 && (
          <div className="rounded-card border border-warning/40 bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
            <p className="font-semibold">
              {t("apl.overlap")}
            </p>
            <ul className="mt-1 list-disc pl-4">
              {selectedOverlap.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6">
        <DialogActions>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving !== null}
          >
            {t("apl.cancel")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void save("draft")}
            disabled={saving !== null}
          >
            {saving === "draft" ? t("apl.saving") : t("apl.saveDraft")}
          </Button>
          <Button
            type="button"
            onClick={() => void save("active")}
            disabled={saving !== null}
          >
            {saving === "active" ? t("apl.creating") : t("apl.createAndSell")}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}

function PriceDialog({
  plan,
  onClose,
  onChanged,
}: {
  plan: AdminPlanItem | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, tx, locale } = useI18n();
  const [price, setPrice] = useState("");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [error, setError] = useState<ErrorSource | null>(null);
  const [saving, setSaving] = useState(false);
  const [earliest, setEarliest] = useState<Date | null>(null);

  useEffect(() => {
    if (!plan) return;
    const limit = earliestPriceChange();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp giá trị mặc định khi mở hộp
    setEarliest(limit);
    setPrice(String(plan.priceVnd));
    setEffectiveAt(toDateTimeLocal(limit));
    setError(null);
    setSaving(false);
  }, [plan]);

  if (!plan || !earliest) return null;

  async function submit() {
    if (!plan || !earliest) return;
    const priceVnd = Number(price);
    const selected = new Date(effectiveAt);
    if (!Number.isSafeInteger(priceVnd) || priceVnd < 0) {
      setError(errorSource(null, "apl.errNewPrice"));
      return;
    }
    if (
      !effectiveAt ||
      Number.isNaN(selected.getTime()) ||
      selected.getTime() < earliest.getTime()
    ) {
      setError(errorSource(null, "apl.earliest", { date: earliest.toLocaleString(locale) }));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await changeAdminPlanPrice(plan.id, priceVnd, selected.toISOString());
      onChanged();
      onClose();
    } catch (err) {
      setError(errorSource(err, "apl.priceFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={t("apl.priceTitle", { plan: plan.name })}
      onClose={onClose}
      closeDisabled={saving}
      className="max-w-md p-6"
    >
      <DialogError message={renderError(error)} />
      <dl className="mb-4 grid grid-cols-2 gap-3 rounded-card border border-border bg-surface-subtle p-3 text-[13px]">
        <div>
          <dt className="text-muted">{t("apl.currentPrice")}</dt>
          <dd className="mt-1 font-mono tabular-nums">
            {formatVnd(plan.priceVnd)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{t("apl.inUse")}</dt>
          <dd className="mt-1 font-mono tabular-nums">
            {t("apl.users", { n: plan.subscriberCount })}
          </dd>
        </div>
      </dl>
      <p className="mb-4 rounded-card bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
        {tx("apl.earliest", { date: <strong>{earliest.toLocaleString(locale)}</strong> })}
      </p>
      <div className="space-y-4">
        <label className="block text-xs text-muted">
          {t("apl.newPrice")}
          <input
            name="new-plan-price"
            autoComplete="off"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className={`${INPUT_CLASS} mt-1 w-full`}
          />
        </label>
        <label className="block text-xs text-muted">
          {t("apl.effectiveFrom")}
          <input
            name="price-effective-at"
            autoComplete="off"
            type="datetime-local"
            min={toDateTimeLocal(earliest)}
            value={effectiveAt}
            onChange={(event) => setEffectiveAt(event.target.value)}
            className={`${INPUT_CLASS} mt-1 w-full`}
          />
        </label>
      </div>
      <div className="mt-6">
        <DialogActions>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving}
          >
            {t("apl.cancel")}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? t("apl.saving") : t("apl.schedulePrice")}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}

export default function AdminPlansPage() {
  const { t } = useI18n();
  const [plans, setPlans] = useState<AdminPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorSource | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pricePlan, setPricePlan] = useState<AdminPlanItem | null>(null);
  const [togglePlan, setTogglePlan] = useState<AdminPlanItem | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [toggleError, setToggleError] = useState<ErrorSource | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const freePlan = useMemo(
    () => plans.find((plan) => plan.isDefault) ?? null,
    [plans],
  );

  async function loadPlans() {
    setLoading(true);
    try {
      setPlans(await listAdminPlans());
      setError(null);
    } catch (err) {
      setError(errorSource(err, "apl.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải danh sách khi vào trang
    void loadPlans();
  }, []);

  function handleCreated(result: { warnings: string[] }) {
    setNotice(
      result.warnings.length > 0
        ? t("apl.createdWarn", { features: result.warnings.join(", ") })
        : t("apl.created"),
    );
    void loadPlans();
  }

  function openToggle(plan: AdminPlanItem) {
    setToggleError(null);
    setTogglePlan(plan);
  }

  async function toggleActive() {
    if (!togglePlan) return;
    setToggleLoading(true);
    setToggleError(null);
    try {
      await setAdminPlanActive(togglePlan.id, !togglePlan.isActive);
      setTogglePlan(null);
      setNotice(
        togglePlan.isActive ? t("apl.disabled") : t("apl.enabled"),
      );
      await loadPlans();
    } catch (err) {
      setToggleError(errorSource(err, "apl.toggleFailed"));
    } finally {
      setToggleLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: t("adm.navTitle") }, { label: t("apl.title") }]}
        title={t("apl.title")}
        description={t("apl.subtitle")}
        action={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            {t("apl.create")}
          </Button>
        }
      />

      {notice && (
        <div
          role="status"
          className="mb-4 flex items-center justify-between gap-3 rounded-card border border-success/40 bg-success-muted px-3 py-2 text-xs text-success-foreground"
        >
          <span>{notice}</span>
          <button
            type="button"
            aria-label={t("apl.dismiss")}
            onClick={() => setNotice(null)}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-xs text-danger"
        >
          <span>{renderError(error)}</span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadPlans()}
          >
            {t("bill.retry")}
          </Button>
        </div>
      )}

      {loading && !error && (
        <p
          role="status"
          className="flex items-center justify-center gap-2 py-16 text-sm text-muted"
        >
          <Loader2
            aria-hidden="true"
            className="h-4 w-4 animate-spin text-accent"
          />
          {t("bill.loading")}
        </p>
      )}

      {!loading && !error && plans.length === 0 && (
        <EmptyState
          icon={Package}
          title={t("apl.emptyTitle")}
          description={t("apl.emptyBody")}
          action={<Button onClick={() => setCreateOpen(true)}>{t("apl.create")}</Button>}
        />
      )}

      {!loading && !error && plans.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="hidden gap-3 border-b border-border bg-surface-subtle px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted md:grid md:grid-cols-[minmax(0,1.3fr)_100px_130px_minmax(150px,1fr)_100px_200px]">
            <span>{t("apl.colName")}</span>
            <span>{t("apl.colCycle")}</span>
            <span>{t("apl.colPrice")}</span>
            <span>{t("apl.colPending")}</span>
            <span>{t("apl.colUsers")}</span>
            <span>{t("apl.colActions")}</span>
          </div>
          {plans.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              onPrice={setPricePlan}
              onToggle={openToggle}
            />
          ))}
        </Card>
      )}

      <CreatePlanDialog
        open={createOpen}
        freePlan={freePlan}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
      <PriceDialog
        plan={pricePlan}
        onClose={() => setPricePlan(null)}
        onChanged={() => {
          setNotice(t("apl.priceScheduled"));
          void loadPlans();
        }}
      />
      <ConfirmDialog
        open={togglePlan !== null}
        title={togglePlan?.isActive ? t("apl.disableTitle") : t("apl.enableTitle")}
        message={
          togglePlan?.isActive
            ? togglePlan.subscriberCount > 0
              ? t("apl.disableWithUsers", { n: togglePlan.subscriberCount })
              : t("apl.disableConfirm")
            : t("apl.enableConfirm")
        }
        confirmLabel={togglePlan?.isActive ? t("apl.disable") : t("apl.enable")}
        danger={togglePlan?.isActive}
        loading={toggleLoading}
        error={renderError(toggleError)}
        onCancel={() => {
          if (!toggleLoading) setTogglePlan(null);
        }}
        onConfirm={() => void toggleActive()}
      />
    </div>
  );
}
