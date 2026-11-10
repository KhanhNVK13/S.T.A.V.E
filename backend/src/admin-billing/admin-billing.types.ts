export interface AdminTransactionRow {
  id: string;
  user_id: string | null;
  created_at: string;
  amount_vnd: number;
  kind: 'charge' | 'refund' | 'compensation';
  status: 'pending' | 'success' | 'failed';
  order_code: number | null;
  provider_ref: string | null;
  description: string | null;
  payer_name: string | null;
  payer_email: string | null;
  retry_of: string | null;
  plan: { id: string; name: string } | null;
  account: {
    id: string;
    display_name: string | null;
    username: string;
    email: string | null;
  } | null;
}

export const ADMIN_TRANSACTION_COLUMNS =
  'id,user_id,created_at,amount_vnd,kind,status,order_code,provider_ref,description,payer_name,payer_email,retry_of,plan:subscription_plans!transactions_plan_id_fkey(id,name),account:users!transactions_user_id_fkey(id,display_name,username,email)';

export interface AdminTransactionCursor {
  createdAt: string;
  id: string;
}

export interface AdminSummaryRow {
  total_charge_amount: number;
  total_refund_amount: number;
  success_count: number;
  failed_count: number;
}

export interface AdminTransactionItem {
  id: string;
  providerRef: string | null;
  orderCode: number | null;
  createdAt: string;
  amountVnd: number;
  kind: AdminTransactionRow['kind'];
  outcome: AdminTransactionRow['status'];
  description: string | null;
  payerName: string | null;
  payerEmail: string | null;
  plan: { id: string; name: string } | null;
  account: AdminTransactionRow['account'];
  retryOf: string | null;
}

export interface AdminTransactionPage {
  items: AdminTransactionItem[];
  nextCursor: string | null;
  summary: {
    totalChargeAmount: number;
    totalRefundAmount: number;
    successCount: number;
    failedCount: number;
  };
}

export interface AdminPaymentIssue {
  id: string;
  transaction_id: string;
  description: string;
  status: string;
  remedy: string | null;
  note: string | null;
  reported_by: string | null;
  created_at: string;
}
