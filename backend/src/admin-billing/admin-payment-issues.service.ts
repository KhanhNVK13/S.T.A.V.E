import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { BILLING_PAYMENT_PROVIDER } from '../billing/billing-scheduler.service';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../billing/payment-gateway';
import { formatVnd } from '../billing/billing-format';
import type { ResolvePaymentIssueDto } from './dto/resolve-payment-issue.dto';
import {
  type AdminIssueAccount,
  type AdminIssueCursor,
  type AdminIssueReporter,
  type AdminIssueTransaction,
  type AdminPaymentIssueDetail,
  type AdminPaymentIssueItem,
  type AdminPaymentIssuePage,
  type AdminPaymentIssueResolveResult,
  type AdminPaymentIssueStatus,
  type PaymentIssueRemedy,
  type PaymentIssueVerification,
} from './admin-payment-issues.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ISSUE_COLUMNS =
  'id,transaction_id,description,status,remedy,note,created_at,resolved_at,reported_by';

const TRANSACTION_COLUMNS =
  'id,user_id,created_at,amount_vnd,kind,status,order_code,provider_ref,description,payer_name,payer_email,plan:subscription_plans!transactions_plan_id_fkey(id,name),account:users!transactions_user_id_fkey(id,display_name,username,email)';

const ACCOUNT_COLUMNS = 'id,display_name,username,email';

const REPORTER_COLUMNS = 'id,display_name,username';

/** Biện pháp nào phải đối chiếu được với cổng thanh toán trước khi áp dụng. */
const REMEDIES_REQUIRING_VERIFICATION: PaymentIssueRemedy[] = [
  'extend',
  'refund',
  'activate',
];

/** Mã lỗi do hàm Postgres `resolve_payment_issue` ném ra. */
const RPC_ERROR_CODES: Record<string, { status: number; message: string }> = {
  ST001: { status: 404, message: 'Payment issue not found' },
  ST002: { status: 409, message: 'Payment issue is already resolved' },
  ST003: { status: 400, message: 'Invalid remedy' },
  ST004: { status: 400, message: 'A note is required to resolve the issue' },
  ST005: { status: 400, message: 'Compensation days must be between 1 and 90' },
  ST006: { status: 400, message: 'Invalid refund information' },
  ST007: { status: 400, message: 'Invalid duplicate issue reference' },
  ST008: { status: 409, message: 'The original transaction was not successful' },
  ST009: { status: 409, message: 'The original transaction has no account or plan' },
  ST010: { status: 409, message: 'The account has no subscription to compensate' },
};

interface IssueRow {
  id: string;
  transaction_id: string;
  description: string;
  status: string;
  remedy: string | null;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  reported_by: string | null;
}

interface TransactionRow {
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

interface ResolveRpcRow {
  issue_id: string;
  status: string;
  remedy: string;
  transaction_id: string | null;
  created_transaction_id: string | null;
  subscription_id: string | null;
  current_period_end: string | null;
  user_id: string | null;
}

export function encodeIssueCursor(cursor: AdminIssueCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString(
    'base64url',
  );
}

export function decodeIssueCursor(value: string): AdminIssueCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [createdAt, id] = parsed as unknown[];
    if (typeof createdAt !== 'string') return null;
    if (Number.isNaN(Date.parse(createdAt))) return null;
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

@Injectable()
export class AdminPaymentIssuesService {
  private readonly logger = new Logger(AdminPaymentIssuesService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
    @Inject(BILLING_PAYMENT_PROVIDER)
    private readonly provider: 'fake' | 'payos',
    private readonly notifications: NotificationsService,
  ) {}

  async listIssues(
    status: AdminPaymentIssueStatus = 'open',
    limit = 20,
    cursor?: string,
  ): Promise<AdminPaymentIssuePage> {
    const after = cursor ? decodeIssueCursor(cursor) : null;
    if (cursor && !after) throw new BadRequestException('Invalid cursor');

    let builder = this.supabase
      .from('payment_issues')
      .select(ISSUE_COLUMNS)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);
    if (after) {
      builder = builder.or(
        `created_at.lt."${after.createdAt}",and(created_at.eq."${after.createdAt}",id.lt.${after.id})`,
      );
    }

    const { data, error } = await builder.returns<IssueRow[]>();
    if (error || !data) {
      throw new InternalServerErrorException('Could not read payment issues');
    }

    const rows = data.slice(0, limit);
    const last = rows[rows.length - 1];
    const transactions = await this.loadTransactions(
      rows.map((row) => row.transaction_id),
    );
    const reporters = await this.loadReporters(
      rows.map((row) => row.reported_by),
    );

    return {
      items: rows.map((row) => this.toItem(row, transactions, reporters)),
      nextCursor:
        data.length > limit && last
          ? encodeIssueCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async getIssue(id: string): Promise<AdminPaymentIssueDetail> {
    const { data: issueRow, error } = await this.supabase
      .from('payment_issues')
      .select(ISSUE_COLUMNS)
      .eq('id', id)
      .maybeSingle<IssueRow>();
    if (error) {
      throw new InternalServerErrorException('Could not read the payment issue');
    }
    if (!issueRow) throw new NotFoundException('Payment issue not found');

    const transactions = await this.loadTransactions([issueRow.transaction_id]);
    const transaction = transactions.get(issueRow.transaction_id) ?? null;
    const reporters = await this.loadReporters([issueRow.reported_by]);
    const reporter = reporters.get(issueRow.reported_by) ?? null;

    const timeline = await this.loadTimeline(transaction);
    const verification = await this.verifyAgainstProvider(transaction);

    return {
      issue: this.toItem(issueRow, transactions, reporters),
      reporter,
      account: transaction?.account ?? null,
      payerName: transaction?.payer_name ?? null,
      payerEmail: transaction?.payer_email ?? null,
      transaction,
      timeline,
      verification: verification.status,
      verificationDetail: verification.detail,
    };
  }

  /**
   * Áp dụng biện pháp xử lý. Mọi ghi đều nằm trong MỘT hàm Postgres
   * (`resolve_payment_issue`) nên lỗi bất kỳ => rollback toàn bộ, sự cố vẫn
   * giữ trạng thái 'open'.
   */
  async resolveIssue(
    adminId: string,
    id: string,
    dto: ResolvePaymentIssueDto,
  ): Promise<AdminPaymentIssueResolveResult> {
    const note = dto.note?.trim() ?? '';
    if (note.length === 0) {
      throw new BadRequestException('A note is required to resolve the issue');
    }
    if (note.length > 1000) {
      throw new BadRequestException('The note can be at most 1000 characters');
    }

    if (REMEDIES_REQUIRING_VERIFICATION.includes(dto.remedy)) {
      const verification = await this.verifyAgainstProvider(
        await this.loadTransactionsOfIssue(id),
      );
      if (verification.status === 'unavailable') {
        throw new ConflictException(
          'Payment provider unavailable, issue stays open',
        );
      }
    }

    const { data, error } = await this.supabase.rpc('resolve_payment_issue', {
      p_issue_id: id,
      p_remedy: dto.remedy,
      p_note: note,
      p_admin_id: adminId,
      p_days: dto.days ?? null,
      p_refund_amount_vnd: dto.refundAmountVnd ?? null,
      p_refund_ref: dto.refundRef ?? null,
      p_duplicate_of_issue_id: dto.duplicateOfIssueId ?? null,
    });

    if (error) {
      const code = (error as { code?: string }).code ?? '';
      const mapped = RPC_ERROR_CODES[code];
      if (mapped) {
        throw mapped.status === 404
          ? new NotFoundException(mapped.message)
          : mapped.status === 409
            ? new ConflictException(mapped.message)
            : new BadRequestException(mapped.message);
      }
      this.logger.error(
        `Could not resolve payment issue ${id}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Could not resolve the payment issue',
      );
    }
    if (!data) {
      throw new InternalServerErrorException('Could not resolve the payment issue');
    }

    const row = data as ResolveRpcRow;
    const notifiedUserId = row.user_id;
    if (notifiedUserId) {
      await this.notifications.notify(
        notifiedUserId,
        'billing.issue_resolved',
        { summary: this.buildSummary(dto.remedy, dto, row) },
      );
    }

    await this.writeAuditLog(adminId, id, dto.remedy, note, row);

    return {
      issueId: row.issue_id,
      remedy: dto.remedy,
      status: 'resolved',
      transactionId: row.transaction_id,
      createdTransactionId: row.created_transaction_id,
      subscriptionId: row.subscription_id,
      currentPeriodEnd: row.current_period_end,
      notifiedUserId,
    };
  }

  private async loadTransactionsOfIssue(id: string): Promise<TransactionRow | null> {
    const { data, error } = await this.supabase
      .from('payment_issues')
      .select('transaction_id')
      .eq('id', id)
      .maybeSingle<{ transaction_id: string }>();
    if (error || !data) {
      throw new NotFoundException('Payment issue not found');
    }
    const transactions = await this.loadTransactions([data.transaction_id]);
    return transactions.get(data.transaction_id) ?? null;
  }

  private async loadTransactions(
    ids: string[],
  ): Promise<Map<string, TransactionRow>> {
    const unique = [...new Set(ids.filter((id) => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const { data, error } = await this.supabase
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .in('id', unique)
      .returns<TransactionRow[]>();
    if (error || !data) {
      throw new InternalServerErrorException('Could not read transactions');
    }
    return new Map(data.map((row) => [row.id, row]));
  }

  private async loadReporters(
    ids: (string | null)[],
  ): Promise<Map<string, AdminIssueReporter>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const { data, error } = await this.supabase
      .from('users')
      .select(REPORTER_COLUMNS)
      .in('id', unique)
      .returns<AdminIssueReporter[]>();
    if (error || !data) {
      throw new InternalServerErrorException('Could not read the reporter');
    }
    return new Map(data.map((row) => [row.id, row]));
  }

  /**
   * Dòng thời gian giao dịch của tài khoản. Tài khoản đã bị xoá thì giao dịch
   * vẫn còn (FK SET NULL) — gom theo `payer_email` lúc giao dịch.
   */
  private async loadTimeline(
    transaction: TransactionRow | null,
  ): Promise<TransactionRow[]> {
    if (!transaction) return [];
    const { data, error } = await this.supabase
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .or(
        transaction.user_id
          ? `user_id.eq.${transaction.user_id}`
          : `payer_email.eq.${transaction.payer_email ?? ''}`,
      )
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<TransactionRow[]>();
    if (error || !data) {
      throw new InternalServerErrorException(
        'Could not read the transaction timeline',
      );
    }
    return data;
  }

  /**
   * Đối chiếu trạng thái giao dịch trong DB với cổng thanh toán. Cổng giả
   * (môi trường test) bỏ qua bước đối chiếu; cổng không phản hồi thì trả
   * 'unavailable' — không được áp biện pháp dựa trên thông tin chưa kiểm chứng.
   */
  private async verifyAgainstProvider(
    transaction: TransactionRow | null,
  ): Promise<{ status: PaymentIssueVerification; detail: string | null }> {
    if (!transaction || transaction.order_code === null) {
      return { status: 'skipped', detail: null };
    }
    if (this.provider === 'fake') {
      return { status: 'skipped', detail: null };
    }

    let gatewayStatus: Awaited<ReturnType<PaymentGateway['getPaymentStatus']>>;
    try {
      gatewayStatus = await this.gateway.getPaymentStatus(transaction.order_code);
    } catch (err) {
      this.logger.warn(
        `Payment provider did not answer for order ${transaction.order_code}: ${
          err instanceof Error ? err.name : 'unknown error'
        }`,
      );
      return {
        status: 'unavailable',
        detail: 'Payment provider did not respond',
      };
    }

    const matches =
      (gatewayStatus === 'success' && transaction.status === 'success') ||
      (gatewayStatus === 'failed' && transaction.status === 'failed');
    if (matches) return { status: 'match', detail: null };
    return {
      status: 'mismatch',
      detail: `Payment provider reports "${gatewayStatus}" while the record says "${transaction.status}"`,
    };
  }

  private toItem(
    row: IssueRow,
    transactions: Map<string, TransactionRow>,
    reporters: Map<string, AdminIssueReporter>,
  ): AdminPaymentIssueItem {
    const transaction = transactions.get(row.transaction_id) ?? null;
    return {
      id: row.id,
      transactionId: row.transaction_id,
      description: row.description,
      status: row.status === 'resolved' ? 'resolved' : 'open',
      remedy: (row.remedy as PaymentIssueRemedy | null) ?? null,
      note: row.note,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      reportedBy: row.reported_by ? (reporters.get(row.reported_by) ?? null) : null,
      transaction,
      payerName: transaction?.payer_name ?? null,
      payerEmail: transaction?.payer_email ?? null,
    };
  }

  private buildSummary(
    remedy: PaymentIssueRemedy,
    dto: ResolvePaymentIssueDto,
    row: ResolveRpcRow,
  ): string {
    switch (remedy) {
      case 'extend':
        return `đã đền bù thêm ${dto.days ?? 0} ngày`;
      case 'refund':
        return `đã ghi nhận hoàn tiền ${formatVnd(dto.refundAmountVnd ?? 0)}`;
      case 'activate':
        return 'đã kích hoạt gói của bạn';
      case 'dismiss':
        return 'đã được đánh dấu là trùng và bỏ qua';
      default:
        return `đã được xử lý (${row.remedy})`;
    }
  }

  /** Ghi audit log — INSERT-only, lỗi ghi không chặn nghiệp vụ. */
  private async writeAuditLog(
    adminId: string,
    issueId: string,
    remedy: string,
    note: string,
    row: ResolveRpcRow,
  ): Promise<void> {
    const { error } = await this.supabase.from('admin_audit_log').insert({
      admin_id: adminId,
      action: 'payment_issue.resolve',
      target_type: 'payment_issue',
      target_id: issueId,
      reason: `${remedy}: ${note}`,
    });
    if (error) {
      this.logger.error(
        `Could not write audit entry payment_issue.resolve for ${issueId}: ${error.message}`,
      );
    }
  }
}
