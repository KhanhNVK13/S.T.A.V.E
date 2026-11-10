import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type { AdminTransactionsQueryDto } from './dto/admin-transactions-query.dto';
import {
  ADMIN_TRANSACTION_COLUMNS,
  type AdminPaymentIssue,
  type AdminSummaryRow,
  type AdminTransactionCursor,
  type AdminTransactionItem,
  type AdminTransactionPage,
  type AdminTransactionRow,
} from './admin-billing.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FilterArgs {
  from: string | null;
  to: string | null;
  outcome: string | null;
  planId: string | null;
}

export function encodeAdminCursor(cursor: AdminTransactionCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString(
    'base64url',
  );
}

export function decodeAdminCursor(
  value: string,
): AdminTransactionCursor | null {
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
export class AdminBillingService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async listTransactions(
    query: AdminTransactionsQueryDto,
  ): Promise<AdminTransactionPage> {
    const filters = this.buildFilters(query);
    const after = query.cursor ? decodeAdminCursor(query.cursor) : null;
    if (query.cursor && !after) throw new BadRequestException('Invalid cursor');

    const limit = query.limit ?? 20;
    let builder = this.supabase
      .from('transactions')
      .select(ADMIN_TRANSACTION_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (filters.from) builder = builder.gte('created_at', filters.from);
    if (filters.to) builder = builder.lt('created_at', filters.to);
    if (filters.outcome) builder = builder.eq('status', filters.outcome);
    if (filters.planId) builder = builder.eq('plan_id', filters.planId);
    if (after) {
      builder = builder.or(
        `created_at.lt."${after.createdAt}",and(created_at.eq."${after.createdAt}",id.lt.${after.id})`,
      );
    }

    const [listResult, summaryResult] = await Promise.all([
      builder.returns<AdminTransactionRow[]>(),
      this.supabase.rpc('admin_billing_summary', {
        p_from: filters.from,
        p_to: filters.to,
        p_outcome: filters.outcome,
        p_plan_id: filters.planId,
      }),
    ]);

    if (listResult.error || !listResult.data) {
      throw new InternalServerErrorException('Could not read transactions');
    }
    if (summaryResult.error) {
      throw new InternalServerErrorException(
        'Could not read transaction summary',
      );
    }

    const rows = listResult.data.slice(0, limit);
    const last = rows[rows.length - 1];
    const summaryRow = (summaryResult.data as AdminSummaryRow[] | null)?.[0];

    return {
      items: rows.map((row) => this.toItem(row)),
      nextCursor:
        listResult.data.length > limit && last
          ? encodeAdminCursor({ createdAt: last.created_at, id: last.id })
          : null,
      summary: {
        totalChargeAmount: Number(summaryRow?.total_charge_amount ?? 0),
        totalRefundAmount: Number(summaryRow?.total_refund_amount ?? 0),
        successCount: Number(summaryRow?.success_count ?? 0),
        failedCount: Number(summaryRow?.failed_count ?? 0),
      },
    };
  }

  async getTransaction(id: string) {
    const { data, error } = await this.supabase
      .from('transactions')
      .select(ADMIN_TRANSACTION_COLUMNS)
      .eq('id', id)
      .maybeSingle<AdminTransactionRow>();
    if (error) {
      throw new InternalServerErrorException('Could not read transaction');
    }
    if (!data) throw new NotFoundException('Transaction not found');

    // Giao dịch liên quan = bản thân + các lần thử lại của nó + giao dịch gốc
    // mà nó thử lại từ (để admin thấy đơn đã thất bại trước đó).
    const retryOf = data.retry_of;
    const relatedFilter =
      retryOf === null
        ? `id.eq.${id},retry_of.eq.${id}`
        : `id.eq.${id},retry_of.eq.${id},id.eq.${retryOf}`;

    const [related, issues] = await Promise.all([
      this.supabase
        .from('transactions')
        .select(ADMIN_TRANSACTION_COLUMNS)
        .or(relatedFilter)
        .order('created_at', { ascending: false })
        .returns<AdminTransactionRow[]>(),
      this.supabase
        .from('payment_issues')
        .select(
          'id,transaction_id,description,status,remedy,note,reported_by,created_at',
        )
        .eq('transaction_id', id)
        .order('created_at', { ascending: false })
        .returns<AdminPaymentIssue[]>(),
    ]);
    if (related.error || issues.error) {
      throw new InternalServerErrorException(
        'Could not read transaction details',
      );
    }

    return {
      transaction: this.toItem(data),
      relatedTransactions: (related.data ?? []).map((row) => this.toItem(row)),
      issues: issues.data ?? [],
    };
  }

  private buildFilters(query: AdminTransactionsQueryDto): FilterArgs {
    const from = query.from ?? null;
    const to = query.to ?? null;
    if (from && to && new Date(from).getTime() >= new Date(to).getTime()) {
      throw new BadRequestException('The from date must be before the to date');
    }
    return {
      from,
      to,
      outcome: query.outcome ?? null,
      planId: query.planId ?? null,
    };
  }

  private toItem(row: AdminTransactionRow): AdminTransactionItem {
    return {
      id: row.id,
      providerRef: row.provider_ref,
      orderCode: row.order_code,
      createdAt: row.created_at,
      amountVnd: row.amount_vnd,
      kind: row.kind,
      outcome: row.status,
      description: row.description,
      payerName: row.payer_name,
      payerEmail: row.payer_email,
      plan: row.plan,
      account: row.account,
      retryOf: row.retry_of,
    };
  }
}
