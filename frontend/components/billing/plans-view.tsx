"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Info, Receipt, RefreshCw, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import type { EffectiveSubscription, PlanFeatureKey, PlanListItem } from "@stave/shared-types";
import { getMySubscription, listSubscriptionPlans } from "../../lib/api-billing";
import { formatDate } from "../../lib/format-date";
import { formatVnd } from "../../lib/format-vnd";
import { planFeatureList } from "../../lib/plan-features";
import { useApiResource } from "../../lib/use-api-resource";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { PageHeader } from "../ui/page-header";

interface PlansViewProps {
  feature: PlanFeatureKey | null;
  canceled: boolean;
}

const planAnchor = (planId: string) => `plan-${planId}`;

export function PlansView({ feature, canceled }: PlansViewProps) {
  const [attempt, setAttempt] = useState(0);
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
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <PlanCard
                plan={plan}
                subscription={subscription}
                feature={feature}
                highlighted={plan.id === highlightedPlanId}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  subscription,
  feature,
  highlighted,
}: {
  plan: PlanListItem;
  subscription: EffectiveSubscription;
  feature: PlanFeatureKey | null;
  highlighted: boolean;
}) {
  const features = planFeatureList(plan.features);
  const onPaidPlan = subscription.hasPaidAccess;
  const retiredButCurrent = plan.isCurrent && !plan.isActive;

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

      {!plan.isDefault && (
        <p className="mt-4 text-xs text-muted">
          Thanh toán theo chu kỳ 1 tháng. Huỷ bất cứ lúc nào: bạn vẫn dùng đến hết kỳ đã trả, không hoàn tiền.
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {/* TODO(P4): nối "Nâng cấp" với checkout. TODO(P6): nối "Đổi gói" / "Huỷ gói". */}
        {!onPaidPlan && !plan.isCurrent && !plan.isDefault && <Button disabled>Nâng cấp lên {plan.name}</Button>}
        {onPaidPlan && !plan.isCurrent && <Button variant="secondary" disabled>Đổi gói</Button>}
        {onPaidPlan && plan.isCurrent && !subscription.cancelAtPeriodEnd && (
          <Button variant="secondary" disabled>
            Huỷ gói
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
