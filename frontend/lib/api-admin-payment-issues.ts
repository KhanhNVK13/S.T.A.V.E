import { apiFetch } from "./api-client";

export type PaymentIssueStatus = "open" | "resolved";

export type PaymentIssueRemedy = "extend" | "refund" | "activate" | "dismiss";

export type PaymentIssueVerification =
  | "match"
  | "mismatch"
  | "skipped"
  | "unavailable";

export interface AdminPaymentIssueAccount {
  id: string;
  display_name: string | null;
  username: string;
  email: string | null;
}

export interface AdminPaymentIssueReporter {
  id: string;
  display_name: string | null;
  username: string;
}

export interface AdminPaymentIssueTransaction {
  id: string;
  user_id: string | null;
  created_at: string;
  amount_vnd: number;
  kind: "charge" | "refund" | "compensation";
  status: "pending" | "success" | "failed";
  order_code: number | null;
  provider_ref: string | null;
  description: string | null;
  payer_name: string | null;
  payer_email: string | null;
  plan: { id: string; name: string } | null;
  account: AdminPaymentIssueAccount | null;
}

export interface AdminPaymentIssueItem {
  id: string;
  transactionId: string;
  description: string;
  status: PaymentIssueStatus;
  remedy: PaymentIssueRemedy | null;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reportedBy: AdminPaymentIssueReporter | null;
  transaction: AdminPaymentIssueTransaction | null;
  /** Snapshot người trả lúc giao dịch — dùng khi tài khoản đã xoá. */
  payerName: string | null;
  payerEmail: string | null;
}

export interface AdminPaymentIssuePage {
  items: AdminPaymentIssueItem[];
  nextCursor: string | null;
}

export interface AdminPaymentIssueDetail {
  issue: AdminPaymentIssueItem;
  reporter: AdminPaymentIssueReporter | null;
  account: AdminPaymentIssueAccount | null;
  payerName: string | null;
  payerEmail: string | null;
  transaction: AdminPaymentIssueTransaction | null;
  timeline: AdminPaymentIssueTransaction[];
  verification: PaymentIssueVerification;
  verificationDetail: string | null;
}

export interface ResolvePaymentIssuePayload {
  remedy: PaymentIssueRemedy;
  note: string;
  days?: number;
  refundAmountVnd?: number;
  refundRef?: string;
  duplicateOfIssueId?: string;
}

export interface AdminPaymentIssueResolveResult {
  issueId: string;
  remedy: PaymentIssueRemedy;
  status: PaymentIssueStatus;
  transactionId: string | null;
  createdTransactionId: string | null;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
  /** `null` khi tài khoản đã xoá — không gửi được thông báo. */
  notifiedUserId: string | null;
}

export function listAdminPaymentIssues(
  status: PaymentIssueStatus,
  cursor?: string,
): Promise<AdminPaymentIssuePage> {
  const params = new URLSearchParams({ status });
  if (cursor) params.set("cursor", cursor);
  return apiFetch<AdminPaymentIssuePage>(
    `/admin/payment-issues?${params.toString()}`,
  );
}

export function getAdminPaymentIssue(
  id: string,
): Promise<AdminPaymentIssueDetail> {
  return apiFetch<AdminPaymentIssueDetail>(`/admin/payment-issues/${id}`);
}

export function resolveAdminPaymentIssue(
  id: string,
  payload: ResolvePaymentIssuePayload,
): Promise<AdminPaymentIssueResolveResult> {
  return apiFetch<AdminPaymentIssueResolveResult>(
    `/admin/payment-issues/${id}/resolve`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
