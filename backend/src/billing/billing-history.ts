import type {
  TransactionDetails,
  TransactionDisplayStatus,
  TransactionKind,
} from '@stave/shared-types';

export interface TransactionRow {
  id: string;
  user_id: string | null;
  created_at: string;
  description: string | null;
  amount_vnd: number;
  kind: TransactionKind;
  status: 'pending' | 'success' | 'failed';
  order_code: number | null;
  retry_of: string | null;
  payer_name: string | null;
  payer_email: string | null;
  plan: { name: string } | null;
}

export const TRANSACTION_COLUMNS =
  'id, user_id, created_at, description, amount_vnd, kind, status, order_code, retry_of, payer_name, payer_email, plan:subscription_plans!transactions_plan_id_fkey(name)';

export interface HistoryCursor {
  createdAt: string;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ][0-9:.]+(Z|[+-]\d{2}(:?\d{2})?)?$/;

export function toDisplayStatus(
  status: TransactionRow['status'],
): TransactionDisplayStatus {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'failed';
  return 'incomplete';
}

export function encodeCursor(cursor: HistoryCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString(
    'base64url',
  );
}

export function decodeCursor(value: string): HistoryCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [createdAt, id] = parsed as unknown[];
    if (
      typeof createdAt !== 'string' ||
      typeof id !== 'string' ||
      !TIMESTAMP.test(createdAt) ||
      Number.isNaN(Date.parse(createdAt)) ||
      !UUID.test(id)
    ) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
}

export function toTransactionDetails(row: TransactionRow): TransactionDetails {
  return {
    id: row.id,
    createdAt: row.created_at,
    description: row.description,
    amountVnd: row.amount_vnd,
    kind: row.kind,
    displayStatus: toDisplayStatus(row.status),
    planName: row.plan?.name ?? null,
    orderCode: row.order_code === null ? null : Number(row.order_code),
  };
}

export function canIssueReceipt(row: TransactionRow): boolean {
  return (
    row.status === 'success' &&
    row.kind === 'charge' &&
    row.order_code !== null &&
    Boolean(row.plan?.name) &&
    Number.isSafeInteger(row.amount_vnd) &&
    row.amount_vnd > 0 &&
    Boolean(row.created_at)
  );
}
