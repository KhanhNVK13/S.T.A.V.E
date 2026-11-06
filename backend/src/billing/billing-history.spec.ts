import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import {
  canIssueReceipt,
  decodeCursor,
  encodeCursor,
  toDisplayStatus,
  type TransactionRow,
} from './billing-history';
import { BillingHistoryService } from './billing-history.service';
import {
  CreatePaymentIssueDto,
  ListTransactionsQueryDto,
} from './dto/billing-history.dto';

const userId = '44444444-4444-4444-8444-444444444444';
const txId = '77777777-7777-4777-8777-777777777777';
const failedId = '88888888-8888-4888-8888-888888888888';

function row(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: txId,
    user_id: userId,
    created_at: '2026-11-06T10:00:00.000000+00:00',
    description: 'Đăng ký STAVE+',
    amount_vnd: 49000,
    kind: 'charge',
    status: 'success',
    order_code: 176240000000012,
    retry_of: null,
    payer_name: 'Hải',
    payer_email: 'hai@stave.test',
    plan: { name: 'STAVE+' },
    ...overrides,
  };
}

const ok = (data: unknown): QueryResult => ({ data, error: null });
const fail = (code = 'XX000'): QueryResult => ({
  data: null,
  error: { code, message: 'db error' },
});

function makeService(tables: Record<string, QueryResult[]>) {
  const mock = createSupabaseMock([], { tables });
  return { service: new BillingHistoryService(mock.client), mock };
}

describe('BE-BIL-24 billing history helpers', () => {
  it('UTCID01 maps stored statuses to what the user sees', () => {
    expect(toDisplayStatus('success')).toBe('success');
    expect(toDisplayStatus('failed')).toBe('failed');
    expect(toDisplayStatus('pending')).toBe('incomplete');
  });

  it('UTCID02 round-trips a cursor', () => {
    const cursor = { createdAt: '2026-11-06T10:00:00.123456+00:00', id: txId };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('UTCID03 rejects a cursor that could change the query', () => {
    const forged = Buffer.from(
      JSON.stringify(['2026-11-06),user_id.neq.x', txId]),
    ).toString('base64url');
    expect(decodeCursor(forged)).toBeNull();
    expect(decodeCursor('not-base64-json')).toBeNull();
    expect(
      decodeCursor(
        Buffer.from(JSON.stringify(['2026-11-06T10:00:00Z', 'x'])).toString(
          'base64url',
        ),
      ),
    ).toBeNull();
  });

  it('UTCID04 issues a receipt only for a complete successful charge', () => {
    expect(canIssueReceipt(row())).toBe(true);
    expect(canIssueReceipt(row({ status: 'failed' }))).toBe(false);
    expect(canIssueReceipt(row({ status: 'pending' }))).toBe(false);
    expect(canIssueReceipt(row({ order_code: null }))).toBe(false);
    expect(canIssueReceipt(row({ plan: null }))).toBe(false);
    expect(canIssueReceipt(row({ kind: 'compensation', amount_vnd: 0 }))).toBe(
      false,
    );
  });
});

describe('BE-BIL-25 billing history DTOs', () => {
  it('UTCID01 trims the issue description and accepts 1 to 500 characters', async () => {
    const dto = plainToInstance(CreatePaymentIssueDto, {
      description: '  Đã trừ tiền nhưng chưa có gói  ',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.description).toBe('Đã trừ tiền nhưng chưa có gói');
    await expect(
      validate(
        plainToInstance(CreatePaymentIssueDto, {
          description: 'a'.repeat(500),
        }),
      ),
    ).resolves.toHaveLength(0);
  });

  it('UTCID02 rejects an empty, blank or too long description', async () => {
    for (const description of ['', '   ', 'a'.repeat(501), 42]) {
      const errors = await validate(
        plainToInstance(CreatePaymentIssueDto, { description }),
      );
      expect(errors.map((e) => e.property)).toEqual(['description']);
    }
  });

  it('UTCID03 limits the page size to 1–50', async () => {
    await expect(
      validate(plainToInstance(ListTransactionsQueryDto, { limit: '20' })),
    ).resolves.toHaveLength(0);
    for (const limit of ['0', '51', 'abc']) {
      const errors = await validate(
        plainToInstance(ListTransactionsQueryDto, { limit }),
      );
      expect(errors.map((e) => e.property)).toEqual(['limit']);
    }
  });
});

describe('BE-BIL-26 BillingHistoryService.listTransactions', () => {
  it('UTCID01 lists the caller transactions newest first with retry and issue info', async () => {
    const retry = row({ retry_of: failedId });
    const failed = row({
      id: failedId,
      status: 'failed',
      created_at: '2026-11-05T09:00:00.000000+00:00',
    });
    const { service, mock } = makeService({
      transactions: [
        ok([retry, failed]),
        ok([{ id: failedId, created_at: failed.created_at }]),
      ],
      payment_issues: [ok([{ transaction_id: failedId }])],
    });

    const page = await service.listTransactions(userId, 20);

    expect(mock.builders.transactions.eq).toHaveBeenCalledWith(
      'user_id',
      userId,
    );
    expect(mock.builders.transactions.order).toHaveBeenCalledWith(
      'created_at',
      { ascending: false },
    );
    expect(page.nextCursor).toBeNull();
    expect(page.items).toEqual([
      expect.objectContaining({
        id: txId,
        displayStatus: 'success',
        planName: 'STAVE+',
        retryOf: { id: failedId, createdAt: failed.created_at },
        hasOpenIssue: false,
      }),
      expect.objectContaining({
        id: failedId,
        displayStatus: 'failed',
        retryOf: null,
        hasOpenIssue: true,
      }),
    ]);
  });

  it('UTCID02 returns a cursor when there are more rows and uses it for the next page', async () => {
    const rows = [
      row({ id: '11111111-1111-4111-8111-111111111111' }),
      row({ id: '22222222-2222-4222-8222-222222222222' }),
      row({ id: '33333333-3333-4333-8333-333333333333' }),
    ];
    const first = makeService({
      transactions: [ok(rows)],
      payment_issues: [ok([])],
    });
    const page = await first.service.listTransactions(userId, 2);
    expect(page.items).toHaveLength(2);
    expect(first.mock.builders.transactions.limit).toHaveBeenCalledWith(3);
    expect(decodeCursor(page.nextCursor ?? '')).toEqual({
      createdAt: rows[1].created_at,
      id: rows[1].id,
    });

    const second = makeService({
      transactions: [ok([rows[2]])],
      payment_issues: [ok([])],
    });
    await second.service.listTransactions(userId, 2, page.nextCursor ?? '');
    expect(second.mock.builders.transactions.or).toHaveBeenCalledWith(
      `created_at.lt."${rows[1].created_at}",and(created_at.eq."${rows[1].created_at}",id.lt.${rows[1].id})`,
    );
  });

  it('UTCID03 returns an empty page for a user without transactions', async () => {
    const { service } = makeService({ transactions: [ok([])] });
    await expect(service.listTransactions(userId)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('UTCID04 rejects a forged cursor', async () => {
    const { service } = makeService({});
    await expect(service.listTransactions(userId, 20, 'abc')).rejects.toThrow(
      'Invalid cursor',
    );
  });

  it('UTCID05 throws instead of returning a partial list when reading fails', async () => {
    const { service } = makeService({ transactions: [fail()] });
    await expect(service.listTransactions(userId)).rejects.toThrow(
      new InternalServerErrorException('Could not read transactions'),
    );
  });
});

describe('BE-BIL-27 BillingHistoryService.getReceipt', () => {
  it('UTCID01 returns the receipt of a successful charge', async () => {
    const { service, mock } = makeService({ transactions: [ok(row())] });
    const result = await service.getReceipt(userId, txId);
    expect(mock.builders.transactions.eq).toHaveBeenCalledWith(
      'user_id',
      userId,
    );
    expect(result).toEqual({
      available: true,
      details: expect.objectContaining({ id: txId, displayStatus: 'success' }),
      receipt: {
        orderCode: 176240000000012,
        createdAt: row().created_at,
        planName: 'STAVE+',
        amountVnd: 49000,
        payerName: 'Hải',
      },
    });
  });

  it('UTCID02 still returns the details when no receipt can be issued', async () => {
    const { service } = makeService({
      transactions: [ok(row({ status: 'failed' }))],
    });
    await expect(service.getReceipt(userId, txId)).resolves.toEqual({
      available: false,
      details: expect.objectContaining({ displayStatus: 'failed' }),
      receipt: null,
    });
  });

  it('UTCID03 hides a transaction of another user', async () => {
    const { service } = makeService({ transactions: [ok(null)] });
    await expect(service.getReceipt(userId, txId)).rejects.toThrow(
      new NotFoundException('Transaction not found'),
    );
  });

  it('UTCID04 throws when the transaction cannot be read', async () => {
    const { service } = makeService({ transactions: [fail()] });
    await expect(service.getReceipt(userId, txId)).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});

describe('BE-BIL-28 BillingHistoryService.reportIssue', () => {
  it('UTCID01 opens an issue on the caller transaction', async () => {
    const { service, mock } = makeService({
      transactions: [ok(row())],
      payment_issues: [ok(null), ok(null)],
    });
    const issue = await service.reportIssue(userId, txId, 'Chưa có gói');
    expect(mock.builders.payment_issues.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction_id: txId,
        description: 'Chưa có gói',
        status: 'open',
      }),
    );
    expect(issue).toMatchObject({ transactionId: txId, status: 'open' });
  });

  it('UTCID02 refuses a second open issue', async () => {
    const { service, mock } = makeService({
      transactions: [ok(row())],
      payment_issues: [ok({ id: 'issue-1' })],
    });
    await expect(service.reportIssue(userId, txId, 'x')).rejects.toThrow(
      new ConflictException('This transaction already has an open issue'),
    );
    expect(mock.builders.payment_issues.insert).not.toHaveBeenCalled();
  });

  it('UTCID03 maps a concurrent duplicate to the same conflict', async () => {
    const { service } = makeService({
      transactions: [ok(row())],
      payment_issues: [ok(null), fail('23505')],
    });
    await expect(service.reportIssue(userId, txId, 'x')).rejects.toThrow(
      ConflictException,
    );
  });

  it('UTCID04 hides a transaction of another user', async () => {
    const { service, mock } = makeService({ transactions: [ok(null)] });
    await expect(service.reportIssue(userId, txId, 'x')).rejects.toThrow(
      NotFoundException,
    );
    expect(mock.builders.payment_issues).toBeUndefined();
  });

  it('UTCID05 throws when the issue cannot be saved', async () => {
    const { service } = makeService({
      transactions: [ok(row())],
      payment_issues: [ok(null), fail()],
    });
    await expect(service.reportIssue(userId, txId, 'x')).rejects.toThrow(
      'Could not report the issue',
    );
  });
});
