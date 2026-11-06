import { RequireAuth } from "../../../components/require-auth";
import { PaymentResultView } from "../../../components/billing/payment-result-view";
import { parseOrderCode, parseReturnTo } from "../../../lib/billing-format";

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  return (
    <RequireAuth>
      <PaymentResultView orderCode={parseOrderCode(params.orderCode)} returnTo={parseReturnTo(params.returnTo)} />
    </RequireAuth>
  );
}
