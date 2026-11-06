"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Check, Info, Receipt, RefreshCw, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import type {
  CancelPreview,
  EffectiveSubscription,
  PlanChangePreview,
  PlanFeatureKey,
  PlanListItem,
} from "@stave/shared-types";
import {
  cancelScheduledDowngrade,
  cancelSubscription,
  changePlan,
  getMySubscription,
  listSubscriptionPlans,
  previewCancellation,
  previewPlanChange,
  resumeSubscription,
  startCheckout,
} from "../../lib/api-billing";
import { apiErrorMessage } from "../../lib/error-message";
import { formatDate } from "../../lib/format-date";
import { formatVnd } from "../../lib/format-vnd";
import { planFeatureList } from "../../lib/plan-features";
import { useApiResource } from "../../lib/use-api-resource";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { PageHeader } from "../ui/page-header";

interface PlansViewProps {
  feature: PlanFeatureKey | null;
  canceled: boolean;
  returnTo: string | null;
}

type PendingAction =
  | { type: "subscribe"; plan: PlanListItem }
  | { type: "change"; plan: PlanListItem; preview: PlanChangePreview }
  | { type: "cancel"; preview: CancelPreview };

const planAnchor = (planId: string) => `plan-${planId}`;

export function PlansView({ feature, canceled, returnTo }: PlansViewProps) {
  const [attempt, setAttempt] = useState(0);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error } = useApiResource(
    () => Promise.all([listSubscriptionPlans(), getMySubscription()]),
    [attempt],
    "Không tải được danh sách gói.",
  );
  const [plans, subscription] = data ?? [null, null];
  const highlightedPlanId = feature ? plans?.find((plan) => plan.features[feature] === true)?.id ?? null : null;

  useEffect(() => {
    if (!highlightedPlanId) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(planAnchor(highlightedPlanId))
      ?.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  }, [highlightedPlanId]);

  function openAction(next: PendingAction) {
    setActionError(null);
    setPageError(null);
    setAction(next);
  }

  async function prepare(key: string, load: () => Promise<PendingAction>, fallback: string) {
    setPreparing(key);
    setPageError(null);
    setNotice(null);
    try {
      openAction(await load());
    } catch (err) {
      setPageError(apiErrorMessage(err, fallback));
    } finally {
      setPreparing(null);
    }
  }

  function finish(message: string) {
    setAction(null);
    setActionLoading(false);
    setNotice(message);
    setAttempt((n) => n + 1);
  }

  async function confirmAction() {
    if (!action) return;
    setActionLoading(true);
    setActionError(null);
    try {
      if (action.type === "subscribe") {
        const { checkoutUrl } = await startCheckout(action.plan.id, returnTo);
        window.location.assign(checkoutUrl);
        return;
      }
      if (action.type === "change") {
        const result = await changePlan(action.plan.id);
        if (result.kind === "upgrade") {
          window.location.assign(result.checkoutUrl);
          return;
        }
        finish(`Đã đặt lịch chuyển sang ${result.planName} vào ${formatDate(result.scheduledAt)}.`);
        return;
      }
      const updated = await cancelSubscription();
      finish(`Đã huỷ gia hạn. Bạn vẫn dùng ${updated.plan.name} đến ${formatDate(updated.currentPeriodEnd)}.`);
    } catch (err) {
      setActionError(
        apiErrorMessage(
          err,
          action.type === "cancel" ? "Không huỷ được gói, gói của bạn vẫn gia hạn." : "Không thực hiện được thao tác.",
        ),
      );
      setActionLoading(false);
    }
  }

  async function runDirect(key: string, run: () => Promise<unknown>, success: string, fallback: string) {
    setPreparing(key);
    setPageError(null);
    setNotice(null);
    try {
      await run();
      setNotice(success);
      setAttempt((n) => n + 1);
    } catch (err) {
      setPageError(apiErrorMessage(err, fallback));
    } finally {
      setPreparing(null);
    }
  }

  const handlers: PlanCardHandlers = {
    busyKey: preparing,
    onSubscribe: (plan) => openAction({ type: "subscribe", plan }),
    onChange: (plan) =>
      void prepare(
        plan.id,
        async () => ({ type: "change", plan, preview: await previewPlanChange(plan.id) }),
        "Không kiểm tra được việc đổi gói.",
      ),
    onCancel: () =>
      void prepare(
        "cancel",
        async () => ({ type: "cancel", preview: await previewCancellation() }),
        "Không kiểm tra được việc huỷ gói.",
      ),
    onResume: () =>
      void runDirect(
        "resume",
        resumeSubscription,
        "Gói của bạn sẽ tiếp tục gia hạn như bình thường.",
        "Không tiếp tục được gói.",
      ),
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <PageHeader
        title="Gói dịch vụ"
        description="Chọn gói phù hợp. Bạn có thể đổi hoặc huỷ bất cứ lúc nào."
        action={
          <Link
            href="/billing"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            <Receipt aria-hidden="true" className="h-4 w-4" /> Lịch sử giao dịch
          </Link>
        }
      />

      {canceled && (
        <Card role="status" className="mb-4 flex items-center gap-2 p-4 text-sm">
          <Info aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
          Bạn đã huỷ thanh toán, chưa có gì thay đổi.
        </Card>
      )}

      {notice && (
        <p
          role="status"
          className="mb-4 rounded-card border border-success bg-success-muted px-3 py-2 text-sm text-success-foreground"
        >
          {notice}
        </p>
      )}

      {pageError && (
        <p role="alert" className="mb-4 rounded-card bg-danger-muted px-3 py-2 text-sm text-danger">
          {pageError}
        </p>
      )}

      <Card className="mb-6 flex items-start gap-3 p-4">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-success-foreground" />
        <div>
          <p className="text-sm font-semibold">Quản lý phiên bản luôn miễn phí</p>
          <p className="mt-0.5 text-sm text-muted">
            Commit, tạo nhánh, gộp nhánh, so sánh và khôi phục phiên bản dùng không giới hạn ở mọi gói. Gói trả phí chỉ
            thêm tiện ích cá nhân hoá.
          </p>
        </div>
      </Card>

      {loading ? (
        <PlansSkeleton />
      ) : error || !plans || !subscription ? (
        <Card role="alert" className="p-5">
          <p className="flex items-center gap-2 text-sm text-danger">
            <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
            {error ?? "Không tải được danh sách gói."}
          </p>
          <Button variant="secondary" className="mt-3" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Thử lại
          </Button>
        </Card>
      ) : (
        <>
          {subscription.pendingPlan && (
            <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
              <CalendarClock aria-hidden="true" className="h-5 w-5 shrink-0 text-muted" />
              <p className="flex-1 text-sm">
                Sẽ chuyển sang <strong>{subscription.pendingPlan.name}</strong> vào{" "}
                {formatDate(subscription.currentPeriodEnd)}.
              </p>
              <Button
                variant="secondary"
                disabled={preparing !== null}
                onClick={() =>
                  void runDirect(
                    "cancel-downgrade",
                    cancelScheduledDowngrade,
                    `Đã huỷ lịch chuyển gói. Bạn tiếp tục dùng ${subscription.plan.name}.`,
                    "Không huỷ được lịch chuyển gói.",
                  )
                }
              >
                {preparing === "cancel-downgrade" ? "Đang huỷ…" : "Huỷ lịch hạ cấp"}
              </Button>
            </Card>
          )}

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <li key={plan.id}>
                <PlanCard
                  plan={plan}
                  subscription={subscription}
                  feature={feature}
                  highlighted={plan.id === highlightedPlanId}
                  handlers={handlers}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {action && subscription && (
        <ConfirmDialog
          open
          title={dialogTitle(action, subscription)}
          message={<ActionMessage action={action} subscription={subscription} />}
          confirmLabel={dialogConfirmLabel(action)}
          cancelLabel={action.type === "cancel" ? "Giữ gói" : "Để sau"}
          danger={action.type === "cancel"}
          loading={actionLoading}
          error={actionError}
          onConfirm={() => void confirmAction()}
          onCancel={() => setAction(null)}
        />
      )}
    </div>
  );
}

function dialogTitle(action: PendingAction, subscription: EffectiveSubscription): string {
  if (action.type === "subscribe") return `Nâng cấp lên ${action.plan.name}`;
  if (action.type === "change") return `Đổi sang ${action.plan.name}`;
  return `Huỷ gói ${subscription.plan.name}`;
}

function dialogConfirmLabel(action: PendingAction): string {
  if (action.type === "cancel") return "Huỷ gói";
  if (action.type === "change" && action.preview.kind === "downgrade") return "Đặt lịch chuyển gói";
  return "Tiếp tục thanh toán";
}

function ActionMessage({ action, subscription }: { action: PendingAction; subscription: EffectiveSubscription }) {
  const strong = (text: string) => <strong className="text-foreground">{text}</strong>;

  if (action.type === "subscribe") {
    return (
      <div className="space-y-2">
        <p>
          Bạn sẽ thanh toán {strong(formatVnd(action.plan.priceVnd))} cho 1 tháng sử dụng, tính từ lúc thanh toán thành
          công.
        </p>
        <p>Huỷ bất cứ lúc nào: bạn vẫn dùng đến hết kỳ đã trả, không hoàn tiền.</p>
        <p>Bạn sẽ được chuyển tới trang thanh toán.</p>
      </div>
    );
  }

  if (action.type === "change") {
    const { preview } = action;
    if (preview.kind === "upgrade") {
      return (
        <div className="space-y-2">
          <p>
            Thanh toán {strong(formatVnd(preview.chargeVnd))} ngay. Gói {preview.planName} có hiệu lực ngay khi thanh toán
            thành công và kỳ mới 1 tháng bắt đầu từ hôm nay.
          </p>
          <p>Không tính tiền theo phần còn lại của gói {subscription.plan.name}.</p>
          <p>Bạn sẽ được chuyển tới trang thanh toán.</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <p>
          Không thu tiền. Bạn vẫn dùng {subscription.plan.name} đến hết kỳ đã trả, rồi chuyển sang{" "}
          {strong(preview.planName)} vào {strong(formatDate(preview.effectiveAt))}.
        </p>
        <p>Bạn có thể huỷ lịch này trước ngày đó.</p>
      </div>
    );
  }

  const { preview } = action;
  return (
    <div className="space-y-2">
      <p>
        Gói sẽ không gia hạn. Bạn vẫn dùng {subscription.plan.name} đến {strong(formatDate(preview.endDate))}, sau đó tài
        khoản quay về gói miễn phí.
      </p>
      <p>Không dự án hay dữ liệu nào bị xoá. Không hoàn tiền cho kỳ đã trả.</p>
      {preview.paidOnlySettings.length > 0 && (
        <p>
          Khi hết kỳ, các thiết lập sau sẽ quay về mặc định: {strong(preview.paidOnlySettings.join(", "))}. Bảng màu vẫn
          được giữ để khôi phục khi bạn đăng ký lại.
        </p>
      )}
    </div>
  );
}

interface PlanCardHandlers {
  busyKey: string | null;
  onSubscribe: (plan: PlanListItem) => void;
  onChange: (plan: PlanListItem) => void;
  onCancel: () => void;
  onResume: () => void;
}

function PlanCard({
  plan,
  subscription,
  feature,
  highlighted,
  handlers,
}: {
  plan: PlanListItem;
  subscription: EffectiveSubscription;
  feature: PlanFeatureKey | null;
  highlighted: boolean;
  handlers: PlanCardHandlers;
}) {
  const features = planFeatureList(plan.features);
  const onPaidPlan = subscription.hasPaidAccess;
  const retiredButCurrent = plan.isCurrent && !plan.isActive;
  const busy = handlers.busyKey !== null;

  return (
    <Card
      id={planAnchor(plan.id)}
      className={`flex h-full scroll-mt-20 flex-col p-5 ${highlighted ? "border-accent ring-1 ring-accent" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{plan.name}</h2>
        {plan.isCurrent && <Badge variant="success">Gói hiện tại</Badge>}
        {highlighted && (
          <Badge variant="info">
            <Sparkles aria-hidden="true" className="h-3 w-3" /> Có tính năng bạn cần
          </Badge>
        )}
      </div>

      <p className="mt-3">
        <span className="text-2xl font-semibold">{plan.isDefault ? "Miễn phí" : formatVnd(plan.priceVnd)}</span>
        {!plan.isDefault && <span className="text-sm text-muted"> / 1 tháng</span>}
      </p>

      {plan.description && <p className="mt-2 text-sm text-muted">{plan.description}</p>}

      {features.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {features.map((item) => (
            <li
              key={item.key}
              className={`flex items-center gap-2 ${item.key === feature ? "font-semibold text-accent" : ""}`}
            >
              <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-success-foreground" /> {item.label}
            </li>
          ))}
        </ul>
      )}

      {retiredButCurrent && (
        <p className="mt-4 text-sm text-warning-foreground">
          Gói này không còn mở bán, bạn vẫn dùng đến {formatDate(subscription.currentPeriodEnd)}.
        </p>
      )}

      {plan.isCurrent && onPaidPlan && subscription.cancelAtPeriodEnd && (
        <p className="mt-4 text-sm font-semibold text-warning-foreground">
          Đã huỷ, hiệu lực đến {formatDate(subscription.currentPeriodEnd)}.
        </p>
      )}

      {!plan.isDefault && (
        <p className="mt-4 text-xs text-muted">
          Thanh toán theo chu kỳ 1 tháng. Huỷ bất cứ lúc nào: bạn vẫn dùng đến hết kỳ đã trả, không hoàn tiền.
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {!onPaidPlan && !plan.isCurrent && !plan.isDefault && (
          <Button disabled={busy} onClick={() => handlers.onSubscribe(plan)}>
            Nâng cấp lên {plan.name}
          </Button>
        )}
        {onPaidPlan && !plan.isCurrent && (
          <Button variant="secondary" disabled={busy} onClick={() => handlers.onChange(plan)}>
            {handlers.busyKey === plan.id ? "Đang kiểm tra…" : "Đổi gói"}
          </Button>
        )}
        {onPaidPlan && plan.isCurrent && !subscription.cancelAtPeriodEnd && (
          <Button variant="secondary" disabled={busy} onClick={handlers.onCancel}>
            {handlers.busyKey === "cancel" ? "Đang kiểm tra…" : "Huỷ gói"}
          </Button>
        )}
        {onPaidPlan && plan.isCurrent && subscription.cancelAtPeriodEnd && (
          <Button disabled={busy} onClick={handlers.onResume}>
            {handlers.busyKey === "resume" ? "Đang xử lý…" : "Tiếp tục gói"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function PlansSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải danh sách gói…" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1].map((i) => (
        <Card key={i} className="animate-pulse p-5">
          <div className="h-5 w-24 rounded-md bg-surface-subtle" />
          <div className="mt-4 h-7 w-32 rounded-md bg-surface-subtle" />
          <div className="mt-4 h-4 w-full rounded-md bg-surface-subtle" />
          <div className="mt-2 h-4 w-3/4 rounded-md bg-surface-subtle" />
          <div className="mt-6 h-8 w-36 rounded-md bg-surface-subtle" />
        </Card>
      ))}
    </div>
  );
}
