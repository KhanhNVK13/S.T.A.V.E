import { notFound } from "next/navigation";
import { RequireAuth } from "../../../components/require-auth";
import { FakePaymentPanel } from "../../../components/billing/fake-payment-panel";
import { isFakePaymentPageEnabled, parseOrderCode } from "../../../lib/billing-format";

export default async function FakePaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!isFakePaymentPageEnabled(process.env.NODE_ENV, process.env.NEXT_PUBLIC_PAYMENT_PROVIDER)) {
    notFound();
  }
  const orderCode = parseOrderCode((await searchParams).orderCode);

  return (
    <RequireAuth>
      <FakePaymentPanel orderCode={orderCode} />
    </RequireAuth>
  );
}
