import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import { AdminBillingService } from './admin-billing.service';
import { AdminTransactionsQueryDto } from './dto/admin-transactions-query.dto';

const txId = '77777777-7777-4777-8777-777777777777';
const retryId = '88888888-8888-4888-8888-888888888888';
const planId = '55555555-5555-4555-8555-555555555555';

function row(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: txId,
    user_id: '44444444-4444-4444-8444-444444444444',
    created_at: '2026-11-06T10:00:00.000000+00:00',
    amount_vnd: 49000,
    kind: 'charge',
    status: 'success',
    order_code: 176240000000012,
    provider_ref: 'payos-ref-123',
    description: 'Đăng ký STAVE+',
    payer_name: 'Hải',
    payer_email: 'hai@stave.test',
    retry_of: null,
    plan: { id: planId, name: 'STAVE+' },
    account: {
      id: '44444444-4444-4444-8444-444444444444',
      display_name: 'Hải Nguyễn',
      username: 'hai',
      email: 'hai@stave.test',
    },
    ...overrides,
  };
}

const ok = (data: unknown): QueryResult => ({ data, error: null });
const fail = (code = 'XX000'): QueryResult => ({
  data: null,
  error: { code, message: 'db error' },
});

function makeService(
  tables: Record<string, QueryResult[]>,
  rpc: Record<string, QueryResult | QueryResult[]> = {},
) {
  const mock = createSupabaseMock([], { tables, rpc });
  return { service: new AdminBillingService(mock.client), mock };
}

describe('BE-ADM-01 admin transactions query DTO', () => {
  it('thừa nhận bộ lọc hợp lệ và áp giá trị mặc định', async () => {
    const dto = plainToInstance(AdminTransactionsQueryDto, {
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-30T00:00:00Z',
      outcome: 'failed',
      planId: planId,
      limit: '5',
      cursor: 'YWJj',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.limit).toBe(5);
  });

  it.each(['success', 'failed', 'pending'] as const)(
    'outcome %s hợp lệ',
    async (outcome) => {
      const dto = plainToInstance(AdminTransactionsQueryDto, { outcome });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    },
  );

  it('từ chối outcome ngoài tập cho phép', async () => {
    const dto = plainToInstance(AdminTransactionsQueryDto, {
      outcome: 'refunded',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('từ chối limit vượt trần 100 hoặc nhỏ hơn 1', async () => {
    for (const limit of ['0', '101', 'abc']) {
      const dto = plainToInstance(AdminTransactionsQueryDto, { limit });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it('từ chối planId không phải UUID và from/to không phải ngày hợp lệ', async () => {
    const badPlan = plainToInstance(AdminTransactionsQueryDto, {
      planId: 'không-phải-uuid',
    });
    expect((await validate(badPlan)).length).toBeGreaterThan(0);

    const badDate = plainToInstance(AdminTransactionsQueryDto, {
      from: '01/11/2026',
    });
    expect((await validate(badDate)).length).toBeGreaterThan(0);
  });
});

describe('BE-ADM-02 list admin transactions', () => {
  it('trả items + nextCursor + summary, kèm snapshot khi tài khoản đã xoá', async () => {
    const { service, mock } = makeService(
      {
        transactions: [
          ok([
            row(),
            row({
              id: retryId,
              user_id: null,
              status: 'failed',
              kind: 'refund',
              payer_name: 'Người trả cũ',
              payer_email: 'cu@x.test',
              plan: null,
              account: null,
            }),
          ]),
        ],
      },
      {
        admin_billing_summary: ok([
          {
            total_charge_amount: 98000,
            total_refund_amount: 49000,
            success_count: 2,
            failed_count: 1,
          },
        ]),
      },
    );

    const page = await service.listTransactions(
      plainToInstance(AdminTransactionsQueryDto, { limit: '1' }),
    );

    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe(txId);
    expect(page.summary).toEqual({
      totalChargeAmount: 98000,
      totalRefundAmount: 49000,
      successCount: 2,
      failedCount: 1,
    });
    expect(typeof page.nextCursor).toBe('string');
    // Không lộ dữ liệu thẻ: chỉ có provider_ref, không có cột nào khác.
    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain('pan');
    expect(serialized).not.toContain('cvv');
    expect(mock.rpc).toHaveBeenCalledWith('admin_billing_summary', {
      p_from: null,
      p_to: null,
      p_outcome: null,
      p_plan_id: null,
    });
  });

  it('khi tài khoản xoá thì giữ snapshot payer và account = null', async () => {
    const { service } = makeService(
      {
        transactions: [
          ok([
            row({
              user_id: null,
              payer_name: 'Người trả cũ',
              payer_email: 'cu@x.test',
              account: null,
            }),
          ]),
        ],
      },
      {
        admin_billing_summary: ok([
          {
            total_charge_amount: 0,
            total_refund_amount: 0,
            success_count: 0,
            failed_count: 0,
          },
        ]),
      },
    );

    const page = await service.listTransactions(
      plainToInstance(AdminTransactionsQueryDto, {}),
    );

    expect(page.items[0].account).toBeNull();
    expect(page.items[0].payerName).toBe('Người trả cũ');
    expect(page.items[0].payerEmail).toBe('cu@x.test');
    expect(page.items[0].providerRef).toBe('payos-ref-123');
  });

  it('cursor không giải mã được → 400', async () => {
    const { service } = makeService(
      { transactions: [ok([])] },
      {
        admin_billing_summary: ok([
          {
            total_charge_amount: 0,
            total_refund_amount: 0,
            success_count: 0,
            failed_count: 0,
          },
        ]),
      },
    );
    await expect(
      service.listTransactions(
        plainToInstance(AdminTransactionsQueryDto, { cursor: '!!lỗi' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('từ sớm hơn hoặc bằng đến → 400', async () => {
    const { service } = makeService(
      { transactions: [ok([])] },
      {
        admin_billing_summary: ok([
          {
            total_charge_amount: 0,
            total_refund_amount: 0,
            success_count: 0,
            failed_count: 0,
          },
        ]),
      },
    );
    await expect(
      service.listTransactions(
        plainToInstance(AdminTransactionsQueryDto, {
          from: '2026-11-02T00:00:00Z',
          to: '2026-11-02T00:00:00Z',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lỗi RPC → 500, không nuốt lỗi', async () => {
    const { service } = makeService(
      { transactions: [ok([row()])] },
      {
        admin_billing_summary: fail(),
      },
    );
    await expect(
      service.listTransactions(plainToInstance(AdminTransactionsQueryDto, {})),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});

describe('BE-ADM-03 admin transaction detail', () => {
  it('trả giao dịch + giao dịch liên kết + sự cố', async () => {
    const { service } = makeService({
      transactions: [
        ok(row()),
        ok([row(), row({ id: retryId, retry_of: txId, status: 'failed' })]),
      ],
      payment_issues: [
        ok([
          {
            id: '99999999-9999-4999-8999-999999999999',
            transaction_id: txId,
            description: 'Thanh toán thành công nhưng chưa kích hoạt gói',
            status: 'open',
            remedy: null,
            note: null,
            reported_by: null,
            created_at: '2026-11-06T11:00:00.000000+00:00',
          },
        ]),
      ],
    });

    const detail = await service.getTransaction(txId);

    expect(detail.transaction.id).toBe(txId);
    expect(detail.relatedTransactions).toHaveLength(2);
    expect(detail.issues).toHaveLength(1);
    expect(detail.issues[0].status).toBe('open');
  });

  it('giao dịch không tồn tại → 404', async () => {
    const { service } = makeService({ transactions: [ok(null)] });
    await expect(service.getTransaction(txId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
