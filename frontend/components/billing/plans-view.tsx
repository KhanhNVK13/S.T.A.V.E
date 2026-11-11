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
  renewSubscription,
  resumeSubscription,
  startCheckout,
} from "../../lib/api-billing";
import { useI18n, type I18n } from "../../context/i18n-context";
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import type { TKey } from "../../lib/i18n";
import { daysUntil, formatDate } from "../../lib/format-date";
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
  const { t, tx } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<ErrorSource | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [pageError, setPageError] = useState<ErrorSource | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error } = useApiResource(
    () => Promise.all([listSubscriptionPlans(), getMySubscription()]),
    [attempt],
    t("bill.plans.loadFailed"),
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

  async function prepare(key: string, load: () => Promise<PendingAction>, fallback: TKey) {
    setPreparing(key);
    setPageError(null);
    setNotice(null);
    try {
      openAction(await load());
    } catch (err) {
      setPageError(errorSource(err, fallback));
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
        finish(t("bill.plans.switchScheduled", { plan: result.planName, date: formatDate(result.scheduledAt) }));
        return;
      }
      const updated = await cancelSubscription();
      finish(
        t("bill.plans.renewalCanceled", { plan: updated.plan.name, date: formatDate(updated.currentPeriodEnd) }),
      );
    } catch (err) {
      setActionError(errorSource(err, action.type === "cancel" ? "bill.plans.cancelFailed" : "bill.plans.actionFailed"));
      setActionLoading(false);
    }
  }

  async function runDirect(key: string, run: () => Promise<unknown>, success: string, fallback: TKey) {
    setPreparing(key);
    setPageError(null);
    setNotice(null);
    try {
      await run();
      setNotice(success);
      setAttempt((n) => n + 1);
    } catch (err) {
      setPageError(errorSource(err, fallback));
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
        "bill.plans.changeCheckFailed",
      ),
    onCancel: () =>
      void prepare(
        "cancel",
        async () => ({ type: "cancel", preview: await previewCancellation() }),
        "bill.plans.cancelCheckFailed",
      ),
    onResume: () =>
      void runDirect(
        "resume",
        resumeSubscription,
        t("bill.plans.resumed"),
        "bill.plans.resumeFailed",
      ),
    onRenew: () => void renew(),
  };

  async function renew() {
    setPreparing("renew");
    setPageError(null);
    setNotice(null);
    try {
      const { checkoutUrl } = await renewSubscription();
      window.location.assign(checkoutUrl);
    } catch (err) {
      setPageError(errorSource(err, "bill.plans.renewFailed"));
      setPreparing(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <PageHeader
        title={t("bill.plans.title")}
        description={t("bill.plans.subtitle")}
        action={
          <Link
            href="/billing"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            <Receipt aria-hidden="true" className="h-4 w-4" /> {t("bill.history.link")}
          </Link>
        }
      />

      {canceled && (
        <Card role="status" className="mb-4 flex items-center gap-2 p-4 text-sm">
          <Info aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
          {t("bill.plans.canceledNotice")}
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
          {renderError(pageError)}
        </p>
      )}

      <Card className="mb-6 flex items-start gap-3 p-4">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-success-foreground" />
        <div>
          <p className="text-sm font-semibold">{t("bill.plans.versionFreeTitle")}</p>
          <p className="mt-0.5 text-sm text-muted">
            {t("bill.plans.versionFreeBody")}
          </p>
        </div>
      </Card>

      {loading ? (
        <PlansSkeleton />
      ) : error || !plans || !subscription ? (
        <Card role="alert" className="p-5">
          <p className="flex items-center gap-2 text-sm text-danger">
            <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
            {error ?? t("bill.plans.loadFailed")}
          </p>
          <Button variant="secondary" className="mt-3" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> {t("bill.retry")}
          </Button>
        </Card>
      ) : (
        <>
          {subscription.inGrace && subscription.graceUntil && (
            <Card role="alert" className="mb-4 flex items-center gap-2 border-warning bg-warning-muted p-4 text-sm">
              <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-warning-foreground" />
              {tx(
                "bill.plans.grace",
                { date: <strong className="text-foreground">{formatDate(subscription.graceUntil)}</strong> },
                { plan: subscription.plan.name },
              )}
            </Card>
          )}

          {subscription.pendingPlan && (
            <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
              <CalendarClock aria-hidden="true" className="h-5 w-5 shrink-0 text-muted" />
              <p className="flex-1 text-sm">
                {tx(
                  "bill.plans.pending",
                  { plan: <strong>{subscription.pendingPlan.name}</strong> },
                  { date: formatDate(subscription.currentPeriodEnd) },
                )}
              </p>
              <Button
                variant="secondary"
                disabled={preparing !== null}
                onClick={() =>
                  void runDirect(
                    "cancel-downgrade",
                    cancelScheduledDowngrade,
                    t("bill.plans.downgradeCanceled", { plan: subscription.plan.name }),
                    "bill.plans.downgradeCancelFailed",
                  )
                }
              >
                {preparing === "cancel-downgrade" ? t("bill.plans.cancelingDowngrade") : t("bill.plans.cancelDowngrade")}
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
          title={dialogTitle(action, subscription, t)}
          message={<ActionMessage action={action} subscription={subscription} />}
          confirmLabel={dialogConfirmLabel(action, t)}
          cancelLabel={action.type === "cancel" ? t("bill.plans.keepPlan") : t("bill.plans.later")}
          danger={action.type === "cancel"}
          loading={actionLoading}
          error={renderError(actionError)}
          onConfirm={() => void confirmAction()}
          onCancel={() => setAction(null)}
        />
      )}
    </div>
  );
}

function dialogTitle(action: PendingAction, subscription: EffectiveSubscription, t: I18n["t"]): string {
  if (action.type === "subscribe") return t("bill.plans.upgradeTo", { plan: action.plan.name });
  if (action.type === "change") return t("bill.plans.switchTo", { plan: action.plan.name });
  return t("bill.plans.cancelTitle", { plan: subscription.plan.name });
}

function dialogConfirmLabel(action: PendingAction, t: I18n["t"]): string {
  if (action.type === "cancel") return t("bill.plans.cancelAction");
  if (action.type === "change" && action.preview.kind === "downgrade") return t("bill.plans.scheduleSwitch");
  return t("bill.plans.continuePay");
}

function ActionMessage({ action, subscription }: { action: PendingAction; subscription: EffectiveSubscription }) {
  const { t, tx } = useI18n();
  const strong = (text: string) => <strong className="text-foreground">{text}</strong>;

  if (action.type === "subscribe") {
    return (
      <div className="space-y-2">
        <p>{tx("bill.plans.subscribeBody", { amount: strong(formatVnd(action.plan.priceVnd)) })}</p>
        <p>{t("bill.plans.noRefundNote")}</p>
        <p>{t("bill.plans.redirectNote")}</p>
      </div>
    );
  }

  if (action.type === "change") {
    const { preview } = action;
    if (preview.kind === "upgrade") {
      return (
        <div className="space-y-2">
          <p>{tx("bill.plans.upgradeBody", { amount: strong(formatVnd(preview.chargeVnd)) }, { plan: preview.planName })}</p>
          <p>{t("bill.plans.upgradeNoProrate", { plan: subscription.plan.name })}</p>
          <p>{t("bill.plans.redirectNote")}</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <p>
          {tx(
            "bill.plans.downgradeBody",
            { next: strong(preview.planName), date: strong(formatDate(preview.effectiveAt)) },
            { current: subscription.plan.name },
          )}
        </p>
        <p>{t("bill.plans.downgradeUndo")}</p>
      </div>
    );
  }

  const { preview } = action;
  return (
    <div className="space-y-2">
      <p>
        {tx("bill.plans.cancelBody", { date: strong(formatDate(preview.endDate)) }, { plan: subscription.plan.name })}
      </p>
      <p>{t("bill.plans.cancelNoDelete")}</p>
      {preview.paidOnlySettings.length > 0 && (
        <p>{tx("bill.plans.cancelSettings", { settings: strong(preview.paidOnlySettings.join(", ")) })}</p>
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
  onRenew: () => void;
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
  const { t } = useI18n();
  const features = planFeatureList(plan.features);
  const onPaidPlan = subscription.hasPaidAccess;
  const retiredButCurrent = plan.isCurrent && !plan.isActive;
  const busy = handlers.busyKey !== null;
  const daysLeft = daysUntil(subscription.currentPeriodEnd);
  const canRenew =
    onPaidPlan &&
    plan.isCurrent &&
    !subscription.cancelAtPeriodEnd &&
    !subscription.pendingPlan &&
    (subscription.inGrace || (daysLeft !== null && daysLeft <= 3));

  return (
    <Card
      id={planAnchor(plan.id)}
      className={`flex h-full scroll-mt-20 flex-col p-5 ${highlighted ? "border-accent ring-1 ring-accent" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{plan.name}</h2>
        {plan.isCurrent && <Badge variant="success">{t("bill.plans.current")}</Badge>}
        {highlighted && (
          <Badge variant="info">
            <Sparkles aria-hidden="true" className="h-3 w-3" /> {t("bill.plans.hasFeature")}
          </Badge>
        )}
      </div>

      <p className="mt-3">
        <span className="text-2xl font-semibold">{plan.isDefault ? t("bill.plans.free") : formatVnd(plan.priceVnd)}</span>
        {!plan.isDefault && <span className="text-sm text-muted"> {t("bill.plans.perMonth")}</span>}
      </p>

      {plan.description && <p className="mt-2 text-sm text-muted">{plan.description}</p>}

      {features.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {features.map((item) => (
            <li
              key={item.key}
              className={`flex items-center gap-2 ${item.key === feature ? "font-semibold text-accent" : ""}`}
            >
              <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-success-foreground" /> {t(`bill.feature.${item.key}`)}
            </li>
          ))}
        </ul>
      )}

      {retiredButCurrent && (
        <p className="mt-4 text-sm text-warning-foreground">
          {t("bill.plans.retired", { date: formatDate(subscription.currentPeriodEnd) })}
        </p>
      )}

      {plan.isCurrent && onPaidPlan && subscription.cancelAtPeriodEnd && (
        <p className="mt-4 text-sm font-semibold text-warning-foreground">
          {t("bill.plans.canceledUntil", { date: formatDate(subscription.currentPeriodEnd) })}
        </p>
      )}

      {!plan.isDefault && (
        <p className="mt-4 text-xs text-muted">
          {t("bill.plans.cycle")}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {!onPaidPlan && !plan.isCurrent && !plan.isDefault && (
          <Button disabled={busy} onClick={() => handlers.onSubscribe(plan)}>
            {t("bill.plans.upgradeBtn", { plan: plan.name })}
          </Button>
        )}
        {onPaidPlan && !plan.isCurrent && (
          <Button variant="secondary" disabled={busy} onClick={() => handlers.onChange(plan)}>
            {handlers.busyKey === plan.id ? t("bill.plans.checking") : t("bill.plans.change")}
          </Button>
        )}
        {onPaidPlan && plan.isCurrent && canRenew && (
          <Button disabled={busy} onClick={handlers.onRenew}>
            {handlers.busyKey === "renew" ? t("bill.plans.processing") : t("bill.plans.renew")}
          </Button>
        )}
        {onPaidPlan && plan.isCurrent && !subscription.cancelAtPeriodEnd && (
          <Button variant="secondary" disabled={busy} onClick={handlers.onCancel}>
            {handlers.busyKey === "cancel" ? t("bill.plans.checking") : t("bill.plans.cancelAction")}
          </Button>
        )}
        {onPaidPlan && plan.isCurrent && subscription.cancelAtPeriodEnd && (
          <Button disabled={busy} onClick={handlers.onResume}>
            {handlers.busyKey === "resume" ? t("bill.plans.processing") : t("bill.plans.resume")}
          </Button>
        )}
      </div>
    </Card>
  );
}

function PlansSkeleton() {
  const { t } = useI18n();
  return (
    <div aria-busy="true" aria-label={t("bill.plans.loadingAria")} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
