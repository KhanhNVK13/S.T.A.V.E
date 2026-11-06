"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, FlaskConical, Loader2, RefreshCw, TriangleAlert, Undo2 } from "lucide-react";
import type { FakePaymentResult } from "@stave/shared-types";
import { getFakePaymentOrder, submitFakePaymentResult } from "../../lib/api-billing";
import { formatVnd } from "../../lib/format-vnd";
import { apiErrorMessage } from "../../lib/error-message";
import { useApiResource } from "../../lib/use-api-resource";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { PageHeader } from "../ui/page-header";

const STATUS_LABEL = { pending: "Đang chờ thanh toán", success: "Thành công", failed: "Thất bại" } as const;
const STATUS_VARIANT = { pending: "warning", success: "success", failed: "danger" } as const;

export function FakePaymentPanel({ orderCode }: { orderCode: number | null }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState<FakePaymentResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: order, loading, error } = useApiResource(
    () => (orderCode ? getFakePaymentOrder(orderCode) : Promise.reject(new Error("missing order code"))),
    [orderCode, attempt],
    "Không tải được đơn thanh toán.",
  );

  async function submit(result: FakePaymentResult) {
    if (!orderCode) return;
    setSubmitting(result);
    setSubmitError(null);
    try {
      await submitFakePaymentResult(orderCode, result);
      router.push(result === "cancel" ? "/plans?canceled=1" : `/billing/result?orderCode=${orderCode}`);
    } catch (err) {
      setSubmitError(apiErrorMessage(err, "Không ghi nhận được kết quả thanh toán thử."));
      setSubmitting(null);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <PageHeader
        title="Thanh toán thử"
        description="Trang này chỉ có ở môi trường phát triển. Không có tiền thật nào được chuyển."
      />

      {orderCode === null ? (
        <Card className="p-5" role="alert">
          <p className="flex items-center gap-2 text-sm text-danger">
            <TriangleAlert aria-hidden="true" className="h-4 w-4" /> Đường dẫn thiếu mã đơn hợp lệ.
          </p>
          <Link href="/plans" className="mt-3 inline-block text-sm text-accent hover:underline">
            Quay lại trang gói dịch vụ
          </Link>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent" /> Đang tải…
        </div>
      ) : error || !order ? (
        <Card className="p-5" role="alert">
          <p className="flex items-center gap-2 text-sm text-danger">
            <TriangleAlert aria-hidden="true" className="h-4 w-4" /> {error ?? "Không tải được đơn thanh toán."}
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Thử lại
            </Button>
            <Link href="/plans" className="inline-flex items-center text-sm text-accent hover:underline">
              Quay lại trang gói dịch vụ
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2 text-sm text-muted">
            <FlaskConical aria-hidden="true" className="h-4 w-4" /> Chọn kết quả để giả lập cổng thanh toán.
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Mã đơn</dt>
            <dd className="font-mono">{order.orderCode}</dd>
            <dt className="text-muted">Gói</dt>
            <dd>{order.planName ?? "—"}</dd>
            <dt className="text-muted">Số tiền</dt>
            <dd className="font-semibold">{formatVnd(order.amountVnd)}</dd>
            <dt className="text-muted">Trạng thái</dt>
            <dd>
              <Badge variant={STATUS_VARIANT[order.status]}>{STATUS_LABEL[order.status]}</Badge>
            </dd>
          </dl>

          {order.status !== "pending" && (
            <p className="mt-4 text-sm text-muted">Đơn này đã được xử lý. Bấm lại sẽ không thay đổi kết quả.</p>
          )}

          {submitError && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {submitError}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => void submit("success")} disabled={submitting !== null}>
              {submitting === "success" ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              Thành công
            </Button>
            <Button variant="danger" onClick={() => void submit("fail")} disabled={submitting !== null}>
              {submitting === "fail" ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CircleX aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              Thất bại
            </Button>
            <Button variant="secondary" onClick={() => void submit("cancel")} disabled={submitting !== null}>
              {submitting === "cancel" ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Undo2 aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              Huỷ
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
