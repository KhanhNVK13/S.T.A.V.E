import { RequireAuth } from "../../components/require-auth";
import { BillingHistoryView } from "../../components/billing/billing-history-view";

export default function BillingPage() {
  return (
    <RequireAuth>
      <BillingHistoryView />
    </RequireAuth>
  );
}
