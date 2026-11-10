/** Hình dạng dữ liệu cho trang quản trị sự cố thanh toán (UC-108). */

export type PaymentIssueStatus = 'open' | 'resolved';

export type PaymentIssueRemedy = 'extend' | 'refund' | 'activate' | 'dismiss';

/**
 * Kết quả đối chiếu với cổng thanh toán:
 * - `match`: cổng và bản ghi trong DB cùng trạng thái
 * - `mismatch`: cổng và DB khác nhau
 * - `skipped`: cổng giả (môi trường test) — bỏ qua bước đối chiếu
 * - `unavailable`: cổng không phản hồi — không được áp dụng biện pháp dựa
 *   trên thông tin chưa kiểm chứng
 */
export type PaymentIssueVerification = 'match' | 'mismatch' | 'skipped' | 'unavailable';

export interface AdminIssueAccount {
  id: string;
  display_name: string | null;
  username: string;
  email: string | null;
}

export interface AdminIssueReporter {
  id: string;
  display_name: string | null;
  username: string;
}

export interface AdminIssueTransaction {
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
  plan: { id: string; name: string } | null;
  account: AdminIssueAccount | null;
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
  reportedBy: AdminIssueReporter | null;
  transaction: AdminIssueTransaction | null;
  /** Tài khoản đã xoá — dùng snapshot `payerName`/`payerEmail` lúc giao dịch. */
  payerName: string | null;
  payerEmail: string | null;
}

export interface AdminPaymentIssuePage {
  items: AdminPaymentIssueItem[];
  nextCursor: string | null;
}

export interface AdminPaymentIssueDetail {
  issue: AdminPaymentIssueItem;
  reporter: AdminIssueReporter | null;
  account: AdminIssueAccount | null;
  payerName: string | null;
  payerEmail: string | null;
  transaction: AdminIssueTransaction | null;
  /** Dòng thời gian giao dịch của tài khoản (hoặc theo payer_email nếu đã xoá). */
  timeline: AdminIssueTransaction[];
  verification: PaymentIssueVerification;
  /** Chi tiết vì sao đối chiếu không khớp / không phản hồi. */
  verificationDetail: string | null;
}

export interface AdminPaymentIssueResolveResult {
  issueId: string;
  remedy: PaymentIssueRemedy;
  status: PaymentIssueStatus;
  transactionId: string | null;
  createdTransactionId: string | null;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
  /** `null` khi tài khoản đã bị xoá — không gửi được thông báo. */
  notifiedUserId: string | null;
}

export interface AdminIssueCursor {
  createdAt: string;
  id: string;
}
