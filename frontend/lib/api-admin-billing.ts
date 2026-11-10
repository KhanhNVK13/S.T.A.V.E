import { apiFetch } from "./api-client";

/** Trạng thái lưu trong DB (khác với `TransactionDisplayStatus` của lịch sử cá nhân). */
export type AdminTransactionOutcome = "success" | "failed" | "pending";

export type AdminTransactionKind = "charge" | "refund" | "compensation";

export interface AdminTransactionItem {
  id: string;
  providerRef: string | null;
  orderCode: number | null;
  createdAt: string;
  amountVnd: number;
  kind: AdminTransactionKind;
  outcome: AdminTransactionOutcome;
  description: string | null;
  payerName: string | null;
  payerEmail: string | null;
  plan: { id: string; name: string } | null;
  /** `null` khi tài khoản đã bị xoá — khi đó dùng snapshot payerName/payerEmail. */
  account: {
    id: string;
    display_name: string | null;
    username: string;
    email: string | null;
  } | null;
  retryOf: string | null;
}

export interface AdminTransactionSummary {
  totalChargeAmount: number;
  totalRefundAmount: number;
  successCount: number;
  failedCount: number;
}

export interface AdminTransactionPage {
  items: AdminTransactionItem[];
  nextCursor: string | null;
  summary: AdminTransactionSummary;
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

export interface AdminTransactionDetail {
  transaction: AdminTransactionItem;
  relatedTransactions: AdminTransactionItem[];
  issues: AdminPaymentIssue[];
}

export interface AdminTransactionsFilter {
  from?: string;
  to?: string;
  outcome?: AdminTransactionOutcome;
  planId?: string;
  limit?: number;
  cursor?: string;
}

/** Dựng query string từ bộ lọc — bỏ qua các giá trị rỗng. */
export function adminTransactionsQuery(filter: AdminTransactionsFilter): string {
  const params = new URLSearchParams();
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (filter.outcome) params.set("outcome", filter.outcome);
  if (filter.planId) params.set("planId", filter.planId);
  if (filter.limit) params.set("limit", String(filter.limit));
  if (filter.cursor) params.set("cursor", filter.cursor);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function listAdminTransactions(
  filter: AdminTransactionsFilter,
): Promise<AdminTransactionPage> {
  return apiFetch<AdminTransactionPage>(
    `/admin/transactions${adminTransactionsQuery(filter)}`,
  );
}

export function getAdminTransaction(
  id: string,
): Promise<AdminTransactionDetail> {
  return apiFetch<AdminTransactionDetail>(`/admin/transactions/${id}`);
}
