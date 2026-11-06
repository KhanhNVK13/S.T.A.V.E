import { RequireAuth } from "../../components/require-auth";
import { PlansView } from "../../components/billing/plans-view";
import { parsePlanFeature } from "../../lib/plan-features";
import { parseReturnTo } from "../../lib/billing-format";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  return (
    <RequireAuth>
      <PlansView
        feature={parsePlanFeature(params.feature)}
        canceled={params.canceled === "1"}
        returnTo={parseReturnTo(params.returnTo)}
      />
    </RequireAuth>
  );
}
