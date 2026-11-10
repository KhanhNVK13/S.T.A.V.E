import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PaymentIssueCreated,
  TransactionHistoryPage,
  TransactionReceipt,
} from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import {
  TRANSACTION_COLUMNS,
  canIssueReceipt,
  decodeCursor,
  encodeCursor,
  toDisplayStatus,
  toTransactionDetails,
  type TransactionRow,
} from './billing-history';

export const DEFAULT_HISTORY_LIMIT = 20;
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class BillingHistoryService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async listTransactions(
    userId: string,
    limit: number = DEFAULT_HISTORY_LIMIT,
    cursor?: string,
  ): Promise<TransactionHistoryPage> {
    const after = cursor ? decodeCursor(cursor) : null;
    if (cursor && !after) throw new BadRequestException('Invalid cursor');

    let query = this.supabase
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);
    if (after) {
      query = query.or(
        `created_at.lt."${after.createdAt}",and(created_at.eq."${after.createdAt}",id.lt.${after.id})`,
      );
    }
    const { data, error } = await query.returns<TransactionRow[]>();
    if (error || !data) {
      throw new InternalServerErrorException('Could not read transactions');
    }

    const rows = data.slice(0, limit);
    const last = rows[rows.length - 1];
    const nextCursor =
      data.length > limit && last
        ? encodeCursor({ createdAt: last.created_at, id: last.id })
        : null;

    const [retried, openIssues] = await Promise.all([
      this.loadRetriedTransactions(userId, rows),
      this.loadOpenIssueIds(rows.map((row) => row.id)),
    ]);

    return {
      items: rows.map((row) => {
        const retry = row.retry_of ? retried.get(row.retry_of) : undefined;
        return {
          id: row.id,
          createdAt: row.created_at,
          description: row.description,
          amountVnd: row.amount_vnd,
          kind: row.kind,
          displayStatus: toDisplayStatus(row.status),
          planName: row.plan?.name ?? null,
          retryOf: retry
            ? { id: row.retry_of as string, createdAt: retry }
            : null,
          hasOpenIssue: openIssues.has(row.id),
        };
      }),
      nextCursor,
    };
  }

  async getReceipt(userId: string, id: string): Promise<TransactionReceipt> {
    const row = await this.loadOwnTransaction(userId, id);
    const details = toTransactionDetails(row);
    if (!canIssueReceipt(row)) {
      return { available: false, details, receipt: null };
    }
    return {
      available: true,
      details,
      receipt: {
        orderCode: Number(row.order_code),
        createdAt: row.created_at,
        planName: row.plan?.name ?? '',
        amountVnd: row.amount_vnd,
        payerName: row.payer_name ?? row.payer_email,
      },
    };
  }

  async reportIssue(
    userId: string,
    id: string,
    description: string,
  ): Promise<PaymentIssueCreated> {
    await this.loadOwnTransaction(userId, id);

    const { data: open, error: openError } = await this.supabase
      .from('payment_issues')
      .select('id')
      .eq('transaction_id', id)
      .eq('status', 'open')
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (openError) {
      throw new InternalServerErrorException('Could not read payment issues');
    }
    if (open) {
      throw new ConflictException('This transaction already has an open issue');
    }

    const issue = {
      id: randomUUID(),
      transaction_id: id,
      description,
      status: 'open' as const,
      reported_by: userId,
      created_at: new Date().toISOString(),
    };
    const { error } = await this.supabase.from('payment_issues').insert(issue);
    if (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException(
          'This transaction already has an open issue',
        );
      }
      throw new InternalServerErrorException('Could not report the issue');
    }
    return {
      id: issue.id,
      transactionId: id,
      status: 'open',
      createdAt: issue.created_at,
    };
  }

  private async loadOwnTransaction(
    userId: string,
    id: string,
  ): Promise<TransactionRow> {
    const { data, error } = await this.supabase
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle<TransactionRow>();
    if (error) {
      throw new InternalServerErrorException('Could not read transactions');
    }
    if (!data) throw new NotFoundException('Transaction not found');
    return data;
  }

  private async loadRetriedTransactions(
    userId: string,
    rows: TransactionRow[],
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        rows.map((row) => row.retry_of).filter((id): id is string => !!id),
      ),
    ];
    if (ids.length === 0) return new Map();
    const { data, error } = await this.supabase
      .from('transactions')
      .select('id, created_at')
      .eq('user_id', userId)
      .in('id', ids)
      .returns<{ id: string; created_at: string }[]>();
    if (error || !data) {
      throw new InternalServerErrorException('Could not read transactions');
    }
    return new Map(data.map((row) => [row.id, row.created_at]));
  }

  private async loadOpenIssueIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const { data, error } = await this.supabase
      .from('payment_issues')
      .select('transaction_id')
      .in('transaction_id', ids)
      .eq('status', 'open')
      .returns<{ transaction_id: string }[]>();
    if (error || !data) {
      throw new InternalServerErrorException('Could not read payment issues');
    }
    return new Set(data.map((row) => row.transaction_id));
  }
}
