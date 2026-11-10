"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleX, Clock, Loader2, RefreshCw, SearchX, TriangleAlert } from "lucide-react";
import { getMySubscription, getPaymentOrder, syncPaymentOrder } from "../../lib/api-billing";
import { ApiError } from "../../lib/api-client";
import { formatVnd } from "../../lib/format-vnd";
import { startPaymentPoll, type PaymentPollState } from "../../lib/payment-result-poller";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { PageHeader } from "../ui/page-header";
import { PRIMARY_LINK } from "./link-styles";

interface PaymentResultViewProps {
  orderCode: number | null;
  returnTo: string | null;
}

export function PaymentResultView({ orderCode, returnTo }: PaymentResultViewProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PaymentPollState>({ phase: "checking", order: null });
  const [activationMissing, setActivationMissing] = useState(false);

  useEffect(() => {
    if (orderCode === null) return;
    return startPaymentPoll({
      getOrder: () => getPaymentOrder(orderCode),
      syncOrder: () => syncPaymentOrder(orderCode),
      onChange: setState,
      isNotFound: (err) => err instanceof ApiError && err.status === 404,
    });
  }, [orderCode, attempt]);

  useEffect(() => {
    if (state.phase !== "success") return;
    let cancelled = false;
    getMySubscription()
      .then((subscription) => {
        if (!cancelled) setActivationMissing(!subscription.hasPaidAccess);
      })
      .catch(() => {
        if (!cancelled) setActivationMissing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.phase]);

  function checkAgain() {
    setState({ phase: "checking", order: null });
    setAttempt((n) => n + 1);
  }

  const phase = orderCode === null ? "notFound" : state.phase;
  const order = state.order;
  const plansHref = returnTo ? `/plans?returnTo=${encodeURIComponent(returnTo)}` : "/plans";

  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <PageHeader title="Kết quả thanh toán" />

      {phase === "checking" && (
        <Card role="status" aria-live="polite" className="flex items-start gap-3 p-5">
          <Loader2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-accent" />
          <div>
            <p className="font-semibold">Đang xác nhận thanh toán…</p>
            <p className="mt-1 text-sm text-muted">Trang sẽ tự cập nhật, bạn không cần tải lại.</p>
          </div>
        </Card>
      )}

      {phase === "success" && (
        <Card role="status" className="p-5">
          <p className="flex items-center gap-2 font-semibold text-success-foreground">
            <CircleCheck aria-hidden="true" className="h-5 w-5" /> Thanh toán thành công
          </p>
          {order && (
            <p className="mt-2 text-sm text-muted">
              Bạn đã thanh toán {formatVnd(order.amountVnd)} cho gói {order.planName ?? "trả phí"}.
            </p>
          )}
          {activationMissing && (
            <p role="alert" className="mt-3 rounded-md border border-warning bg-warning-muted p-3 text-sm text-warning-foreground">
              Thanh toán đã được ghi nhận nhưng gói chưa được kích hoạt. Sự cố đã được ghi nhận, quản trị viên sẽ xử lý
              sớm. Bạn không cần thanh toán lại.
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link href={returnTo ?? "/plans"} className={PRIMARY_LINK}>
              Tiếp tục
            </Link>
            <Link href="/billing" className="text-sm text-accent hover:underline">
              Xem lịch sử giao dịch
            </Link>
          </div>
        </Card>
      )}

      {phase === "failed" && (
        <Card role="alert" className="p-5">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <CircleX aria-hidden="true" className="h-5 w-5" /> Thanh toán không thành công
          </p>
          <p className="mt-2 text-sm text-muted">
            {order?.status === "expired"
              ? "Đơn thanh toán đã quá thời gian chờ. Gói của bạn chưa thay đổi."
              : "Gói của bạn chưa thay đổi. Bạn có thể thử thanh toán lại."}
          </p>
          <div className="mt-5">
            <Link href={plansHref} className={PRIMARY_LINK}>
              Thử lại
            </Link>
          </div>
        </Card>
      )}

      {phase === "waiting" && (
        <Card role="status" className="p-5">
          <p className="flex items-center gap-2 font-semibold">
            <Clock aria-hidden="true" className="h-5 w-5 text-warning-foreground" /> Đang chờ xác nhận
          </p>
          <p className="mt-2 text-sm text-muted">
            Cổng thanh toán chưa báo kết quả. Nếu bạn đã thanh toán, gói sẽ được kích hoạt ngay khi có xác nhận. Hãy kiểm
            tra lại sau vài phút ở trang Lịch sử giao dịch.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={checkAgain}>
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Kiểm tra lại
            </Button>
            <Link href="/billing" className="text-sm text-accent hover:underline">
              Lịch sử giao dịch
            </Link>
          </div>
        </Card>
      )}

      {phase === "error" && (
        <Card role="alert" className="p-5">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <TriangleAlert aria-hidden="true" className="h-5 w-5" /> Không kiểm tra được trạng thái thanh toán
          </p>
          <p className="mt-2 text-sm text-muted">Hãy kiểm tra kết nối mạng rồi thử lại.</p>
          <Button variant="secondary" className="mt-5" onClick={checkAgain}>
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Kiểm tra lại
          </Button>
        </Card>
      )}

      {phase === "notFound" && (
        <Card role="alert" className="p-5">
          <p className="flex items-center gap-2 font-semibold">
            <SearchX aria-hidden="true" className="h-5 w-5 text-muted" /> Không tìm thấy đơn thanh toán
          </p>
          <p className="mt-2 text-sm text-muted">Đường dẫn không đúng hoặc đơn thuộc tài khoản khác.</p>
          <Link href="/plans" className="mt-4 inline-block text-sm text-accent hover:underline">
            Về trang gói dịch vụ
          </Link>
        </Card>
      )}
    </div>
  );
}
