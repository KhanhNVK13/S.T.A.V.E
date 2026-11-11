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
import { apiErrorMessage } from "../../../lib/error-message";
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

function statusBadge(plan: AdminPlanItem) {
  if (plan.isActive) return <Badge variant="success">Đang bán</Badge>;
  if (plan.isDefault) return <Badge variant="neutral">Mặc định</Badge>;
  return <Badge variant="warning">Nháp / đã tắt</Badge>;
}

function featureLabel(key: string): string {
  return PLAN_FEATURES.find((feature) => feature.key === key)?.label ?? key;
}

function featureOverlapWarnings(
  features: FeatureValues,
  freePlan: AdminPlanItem | null,
): string[] {
  if (!freePlan) return [];
  return PLAN_FEATURES.filter(
    ({ key }) => features[key] === true && freePlan.features[key] === true,
  ).map(({ key }) => featureLabel(key));
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
  return (
    <div className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1.3fr)_100px_130px_minmax(150px,1fr)_100px_200px] md:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{plan.name}</p>
        <p className="mt-1 truncate text-xs text-muted">
          {plan.description || "Không có mô tả"}
        </p>
      </div>
      <span className="text-xs text-muted">1 tháng</span>
      <span className="font-mono text-sm tabular-nums">
        {formatVnd(plan.priceVnd)}
      </span>
      <div className="min-w-0 text-xs">
        {plan.priceEffectiveAt ? (
          <>
            <p className="font-mono tabular-nums">{formatVnd(plan.priceVnd)}</p>
            <p className="mt-1 text-muted">
              Từ {formatDateTime(plan.priceEffectiveAt)}
            </p>
          </>
        ) : (
          <span className="text-muted">Chưa hẹn giá mới</span>
        )}
      </div>
      <span className="font-mono text-sm tabular-nums">
        {plan.subscriberCount.toLocaleString("vi-VN")}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {statusBadge(plan)}
        <Button
          type="button"
          variant="secondary"
          onClick={() => onPrice(plan)}
          disabled={plan.isDefault}
        >
          Đổi giá
        </Button>
        {!plan.isDefault && (
          <Button type="button" variant="ghost" onClick={() => onToggle(plan)}>
            {plan.isActive ? "Tắt gói" : "Kích hoạt"}
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
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [extraStorage, setExtraStorage] = useState("0");
  const [features, setFeatures] = useState<FeatureValues>(EMPTY_FEATURES);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "active" | null>(null);

  const selectedOverlap = useMemo(
    () => featureOverlapWarnings(features, freePlan),
    [features, freePlan],
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
      setError("Tên gói phải dài từ 1 đến 60 ký tự.");
      return null;
    }
    if (!Number.isSafeInteger(priceVnd) || priceVnd < 0) {
      setError("Giá gói phải là số nguyên không âm.");
      return null;
    }
    if (
      !Number.isInteger(extraStorageMb) ||
      extraStorageMb < MIN_EXTRA_STORAGE_MB ||
      extraStorageMb > MAX_EXTRA_STORAGE_MB
    ) {
      setError("Dung lượng phải là số nguyên từ 0 đến 102400 MB.");
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
      setError(apiErrorMessage(err, "Không thể tạo gói dịch vụ."));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog
      open={open}
      title="Tạo gói dịch vụ"
      onClose={onClose}
      closeDisabled={saving !== null}
      className="max-w-xl p-6"
    >
      <DialogError message={error} />
      <div className="space-y-4">
        <label className="block text-xs text-muted">
          Tên gói
          <input
            name="plan-name"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            className={`${INPUT_CLASS} mt-1 w-full`}
            placeholder="Ví dụ: STAVE Pro"
          />
          <span className="mt-1 block text-xs">
            {name.trim().length}/60 ký tự
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs text-muted">
            Giá gói (VND)
            <input
              name="plan-price"
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
            Chu kỳ thanh toán
            <input
              name="billing-period"
              value="1 tháng"
              readOnly
              className={`${INPUT_CLASS} mt-1 w-full opacity-70`}
            />
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-foreground">
            Tính năng
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
                {feature.label}
              </label>
            ))}
            <label className="block pt-2 text-xs text-muted">
              Dung lượng bổ sung (MB)
              <input
                name="extra-storage-mb"
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
              Một số tính năng trùng với gói Free:
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
            Huỷ
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void save("draft")}
            disabled={saving !== null}
          >
            {saving === "draft" ? "Đang lưu…" : "Lưu nháp"}
          </Button>
          <Button
            type="button"
            onClick={() => void save("active")}
            disabled={saving !== null}
          >
            {saving === "active" ? "Đang tạo…" : "Tạo và mở bán"}
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
  const [price, setPrice] = useState("");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [error, setError] = useState<string | null>(null);
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
      setError("Giá mới phải là số nguyên không âm.");
      return;
    }
    if (
      !effectiveAt ||
      Number.isNaN(selected.getTime()) ||
      selected.getTime() < earliest.getTime()
    ) {
      setError(
        `Ngày sớm nhất có thể áp dụng: ${earliest.toLocaleString("vi-VN")}.`,
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await changeAdminPlanPrice(plan.id, priceVnd, selected.toISOString());
      onChanged();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Không thể hẹn lịch đổi giá."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={`Đổi giá gói ${plan.name}`}
      onClose={onClose}
      closeDisabled={saving}
      className="max-w-md p-6"
    >
      <DialogError message={error} />
      <dl className="mb-4 grid grid-cols-2 gap-3 rounded-card border border-border bg-surface-subtle p-3 text-[13px]">
        <div>
          <dt className="text-muted">Giá hiện tại</dt>
          <dd className="mt-1 font-mono tabular-nums">
            {formatVnd(plan.priceVnd)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Đang sử dụng</dt>
          <dd className="mt-1 font-mono tabular-nums">
            {plan.subscriberCount.toLocaleString("vi-VN")} người
          </dd>
        </div>
      </dl>
      <p className="mb-4 rounded-card bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
        Ngày sớm nhất có thể áp dụng:{" "}
        <strong>{earliest.toLocaleString("vi-VN")}</strong>.
      </p>
      <div className="space-y-4">
        <label className="block text-xs text-muted">
          Giá mới (VND)
          <input
            name="new-plan-price"
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
          Có hiệu lực từ
          <input
            name="price-effective-at"
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
            Huỷ
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? "Đang lưu…" : "Hẹn lịch đổi giá"}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<AdminPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pricePlan, setPricePlan] = useState<AdminPlanItem | null>(null);
  const [togglePlan, setTogglePlan] = useState<AdminPlanItem | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
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
      setError(apiErrorMessage(err, "Không thể tải danh sách gói dịch vụ."));
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
        ? `Đã tạo gói. Lưu ý: ${result.warnings.join(", ")}.`
        : "Đã tạo gói dịch vụ.",
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
        togglePlan.isActive
          ? "Đã tắt gói dịch vụ."
          : "Đã kích hoạt gói dịch vụ.",
      );
      await loadPlans();
    } catch (err) {
      setToggleError(
        apiErrorMessage(err, "Không thể thay đổi trạng thái gói."),
      );
    } finally {
      setToggleLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Quản trị" }, { label: "Gói dịch vụ" }]}
        title="Gói dịch vụ"
        description="Quản lý giá, tính năng và trạng thái mở bán của các gói dịch vụ."
        action={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            Tạo gói
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
            aria-label="Đóng thông báo"
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
          <span>{error}</span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadPlans()}
          >
            Thử lại
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
          Đang tải…
        </p>
      )}

      {!loading && !error && plans.length === 0 && (
        <EmptyState
          icon={Package}
          title="Chưa có gói dịch vụ"
          description="Tạo gói đầu tiên để bắt đầu quản lý dịch vụ trả phí."
          action={<Button onClick={() => setCreateOpen(true)}>Tạo gói</Button>}
        />
      )}

      {!loading && !error && plans.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="hidden gap-3 border-b border-border bg-surface-subtle px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted md:grid md:grid-cols-[minmax(0,1.3fr)_100px_130px_minmax(150px,1fr)_100px_200px]">
            <span>Tên gói</span>
            <span>Chu kỳ</span>
            <span>Giá hiện tại</span>
            <span>Giá chờ áp dụng</span>
            <span>Người dùng</span>
            <span>Trạng thái / thao tác</span>
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
          setNotice("Đã hẹn lịch đổi giá.");
          void loadPlans();
        }}
      />
      <ConfirmDialog
        open={togglePlan !== null}
        title={togglePlan?.isActive ? "Tắt gói dịch vụ" : "Kích hoạt gói dịch vụ"}
        message={
          togglePlan?.isActive
            ? togglePlan.subscriberCount > 0
              ? `Gói này hiện có ${togglePlan.subscriberCount.toLocaleString("vi-VN")} người dùng đang sử dụng. Việc tắt gói chỉ ngừng nhận đăng ký mới; quyền lợi và chu kỳ hiện tại của người dùng đang hoạt động sẽ không bị ảnh hưởng.`
              : "Bạn có chắc chắn muốn ngừng mở bán gói này?"
            : "Bạn có chắc chắn muốn mở bán lại gói này?"
        }
        confirmLabel={togglePlan?.isActive ? "Tắt gói" : "Kích hoạt"}
        danger={togglePlan?.isActive}
        loading={toggleLoading}
        error={toggleError}
        onCancel={() => {
          if (!toggleLoading) setTogglePlan(null);
        }}
        onConfirm={() => void toggleActive()}
      />
    </div>
  );
}
