import { notFound } from "next/navigation";
import { RequireAuth } from "../../../../components/require-auth";
import { ReceiptView } from "../../../../components/billing/receipt-view";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  return (
    <RequireAuth>
      <ReceiptView id={id} />
    </RequireAuth>
  );
}
