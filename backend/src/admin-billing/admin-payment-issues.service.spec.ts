import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import {
  AdminPaymentIssuesService,
  decodeIssueCursor,
  encodeIssueCursor,
} from './admin-payment-issues.service';
import {
  ResolvePaymentIssueDto,
  PAYMENT_ISSUE_NOTE_MAX,
} from './dto/resolve-payment-issue.dto';

const ISSUE_ID = '11111111-1111-4111-8111-111111111111';
const TX_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

const ok = (data: unknown): QueryResult => ({ data, error: null });
const fail = (code: string): QueryResult => ({
  data: null,
  error: { code, message: `rpc ${code}` },
});

function issueRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ISSUE_ID,
    transaction_id: TX_ID,
    description: 'Thanh toán thành công nhưng chưa kích hoạt gói',
    status: 'open',
    remedy: null,
    note: null,
    created_at: '2026-11-10T08:00:00.000000+00:00',
    resolved_at: null,
    reported_by: USER_ID,
    ...overrides,
  };
}

function txRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TX_ID,
    user_id: USER_ID,
    created_at: '2026-11-10T07:55:00.000000+00:00',
    amount_vnd: 49000,
    kind: 'charge',
    status: 'success',
    order_code: 9990001,
    provider_ref: 'payos-ref-1',
    description: 'Đăng ký STAVE+',
    payer_name: 'Khách',
    payer_email: 'khach@stave.test',
    plan: { id: '55555555-5555-4555-8555-555555555555', name: 'STAVE+' },
    account: {
      id: USER_ID,
      display_name: 'Khách Hàng',
      username: 'khach',
      email: 'khach@stave.test',
    },
    ...overrides,
  };
}

const reporterRow = {
  id: USER_ID,
  display_name: 'Khách Hàng',
  username: 'khach',
};

interface Harness {
  service: AdminPaymentIssuesService;
  mock: ReturnType<typeof createSupabaseMock>;
  gateway: { getPaymentStatus: jest.Mock };
  notifications: { notify: jest.Mock };
  provider: 'fake' | 'payos';
}

function makeService(
  provider: 'fake' | 'payos',
  gatewayStatus?: unknown,
  tableResults?: Record<string, QueryResult[]>,
  rpcResults?: Record<string, QueryResult | QueryResult[]>,
): Harness {
  const gateway = {
    getPaymentStatus: jest.fn(() =>
      gatewayStatus instanceof Error
        ? Promise.reject(gatewayStatus)
        : Promise.resolve(gatewayStatus),
    ),
  };
  const notifications = { notify: jest.fn(() => Promise.resolve()) };
  const mock = createSupabaseMock([], {
    tables: tableResults ?? {},
    rpc: rpcResults ?? {},
  });
  const service = new AdminPaymentIssuesService(
    mock.client,
    gateway as never,
    provider,
    notifications as never,
  );
  return { service, mock, gateway, notifications, provider };
}

const rpcRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  issue_id: ISSUE_ID,
  status: 'resolved',
  remedy: 'dismiss',
  transaction_id: TX_ID,
  created_transaction_id: null,
  subscription_id: null,
  current_period_end: null,
  user_id: USER_ID,
  ...overrides,
});

describe('BE-ABL-11 ResolvePaymentIssueDto validation', () => {
  it('UTCID01 thừa nhận bộ payload extend hợp lệ', async () => {
    const dto = plainToInstance(ResolvePaymentIssueDto, {
      remedy: 'extend',
      note: 'Đền bù thời gian lỗi',
      days: 30,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('UTCID02 thừa nhận refund với mã hoàn tiền', async () => {
    const dto = plainToInstance(ResolvePaymentIssueDto, {
      remedy: 'refund',
      note: 'Hoàn tiền theo yêu cầu',
      refundAmountVnd: 49000,
      refundRef: 'REF-123',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('UTCID03 từ chối remedy ngoài 4 giá trị cho phép', async () => {
    const dto = plainToInstance(ResolvePaymentIssueDto, {
      remedy: 'delete',
      note: 'x',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('UTCID04 từ chối note rỗng', async () => {
    const dto = plainToInstance(ResolvePaymentIssueDto, {
      remedy: 'dismiss',
      note: '',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it(`UTCID05 từ chối note dài hơn ${PAYMENT_ISSUE_NOTE_MAX} ký tự`, async () => {
    const dto = plainToInstance(ResolvePaymentIssueDto, {
      remedy: 'dismiss',
      note: 'a'.repeat(PAYMENT_ISSUE_NOTE_MAX + 1),
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);

    const boundary = plainToInstance(ResolvePaymentIssueDto, {
      remedy: 'dismiss',
      note: 'a'.repeat(PAYMENT_ISSUE_NOTE_MAX),
    });
    expect(await validate(boundary)).toHaveLength(0);
  });

  it('UTCID06 ràng buộc days 1–90 cho remedy extend', async () => {
    for (const days of [0, 91, -1, 1.5]) {
      const dto = plainToInstance(ResolvePaymentIssueDto, {
        remedy: 'extend',
        note: 'x',
        days,
      });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    }
    const dto = plainToInstance(ResolvePaymentIssueDto, {
      remedy: 'extend',
      note: 'x',
      days: 90,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('UTCID07 từ chối refundRef không hợp lệ', async () => {
    const bad = plainToInstance(ResolvePaymentIssueDto, {
      remedy: 'refund',
      note: 'x',
      refundRef: '',
    });
    expect((await validate(bad)).length).toBeGreaterThan(0);

    const long = plainToInstance(ResolvePaymentIssueDto, {
      remedy: 'refund',
      note: 'x',
      refundRef: 'x'.repeat(201),
    });
    expect((await validate(long)).length).toBeGreaterThan(0);
  });

  it('UTCID08 từ chối duplicateOfIssueId không phải UUID', async () => {
    const dto = plainToInstance(ResolvePaymentIssueDto, {
      remedy: 'dismiss',
      note: 'x',
      duplicateOfIssueId: 'không-phải-uuid',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});

describe('UC-108 issue cursor codec', () => {
  it('mã hoá/giải mã vòng tròn', () => {
    const cursor = encodeIssueCursor({
      createdAt: '2026-11-10T08:00:00.000000+00:00',
      id: ISSUE_ID,
    });
    expect(decodeIssueCursor(cursor)).toEqual({
      createdAt: '2026-11-10T08:00:00.000000+00:00',
      id: ISSUE_ID,
    });
  });

  it('từ chối cursor rác', () => {
    expect(decodeIssueCursor('!!!')).toBeNull();
    expect(
      decodeIssueCursor(Buffer.from('{"a":1}').toString('base64url')),
    ).toBeNull();
  });
});

describe('BE-ABL-07 AdminPaymentIssuesService.listIssues', () => {
  it('UTCID01 trả items kèm snapshot payer khi tài khoản đã xoá, nextCursor = null', async () => {
    const { service } = makeService('payos', undefined, {
      payment_issues: [
        ok([issueRow({ status: 'open' })]),
        ok([
          issueRow({
            status: 'resolved',
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          }),
        ]),
      ],
      transactions: [ok([txRow({ user_id: null, account: null })])],
      users: [ok([reporterRow])],
    });

    const page = await service.listIssues('open');
    expect(page.nextCursor).toBeNull();
    expect(page.items).toHaveLength(1);
    const item = page.items[0];
    expect(item.payerName).toBe('Khách');
    expect(item.payerEmail).toBe('khach@stave.test');
    expect(item.transaction?.account).toBeNull();
  });

  it('UTCID02 nextCursor được cấp khi còn thừa dòng hơn limit', async () => {
    const { service } = makeService('payos', undefined, {
      payment_issues: [ok([issueRow(), issueRow()])],
      transactions: [ok([txRow()])],
      users: [ok([reporterRow])],
    });

    const page = await service.listIssues('open', 1);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toEqual(
      encodeIssueCursor({
        createdAt: issueRow().created_at,
        id: ISSUE_ID,
      }),
    );
  });

  it('UTCID03 cursor không giải mã được → 400', async () => {
    const { service } = makeService('payos', undefined, {});
    await expect(service.listIssues('open', 20, 'rác')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('UTCID04 lỗi DB → 500, không nuốt', async () => {
    const { service } = makeService('payos', undefined, {
      payment_issues: [fail('42P01')],
    });
    await expect(service.listIssues('open')).rejects.toThrow();
  });
});

describe('BE-ABL-08 AdminPaymentIssuesService.getIssue', () => {
  const detailTables = (
    issue = issueRow(),
    tx = txRow(),
  ): Record<string, QueryResult[]> => ({
    payment_issues: [ok(issue)],
    transactions: [ok([tx]), ok([tx])],
    users: [ok([reporterRow])],
  });

  it('UTCID01 không tồn tại → 404', async () => {
    const { service } = makeService('payos', undefined, {
      payment_issues: [ok(null)],
    });
    await expect(service.getIssue(ISSUE_ID)).rejects.toThrow(NotFoundException);
  });

  it('UTCID02 chế độ giả (fake) bỏ qua bước đối chiếu → skipped', async () => {
    const { service, gateway } = makeService('fake', undefined, detailTables());
    const detail = await service.getIssue(ISSUE_ID);
    expect(detail.verification).toBe('skipped');
    expect(gateway.getPaymentStatus).not.toHaveBeenCalled();
  });

  it('UTCID03 cổng không phản hồi → unavailable', async () => {
    const { service } = makeService(
      'payos',
      new Error('timeout'),
      detailTables(),
    );
    const detail = await service.getIssue(ISSUE_ID);
    expect(detail.verification).toBe('unavailable');
    expect(detail.verificationDetail).toBe('Payment provider did not respond');
  });

  it('UTCID04 trạng thái khớp → match', async () => {
    const { service } = makeService('payos', 'success', detailTables());
    const detail = await service.getIssue(ISSUE_ID);
    expect(detail.verification).toBe('match');
    expect(detail.timeline).toHaveLength(1);
  });

  it('UTCID05 trạng thái lệch → mismatch kèm lý do', async () => {
    const { service } = makeService('payos', 'failed', detailTables());
    const detail = await service.getIssue(ISSUE_ID);
    expect(detail.verification).toBe('mismatch');
    expect(detail.verificationDetail).toContain('failed');
  });

  it('UTCID06 tài khoản đã xoá: timeline gom theo payer_email, verification vẫn chạy', async () => {
    const deleted = txRow({ user_id: null, account: null });
    const { service } = makeService(
      'payos',
      'success',
      detailTables(issueRow(), deleted),
    );
    const detail = await service.getIssue(ISSUE_ID);
    expect(detail.account).toBeNull();
    expect(detail.payerEmail).toBe('khach@stave.test');
    expect(detail.verification).toBe('match');
  });

  it('UTCID07 giao dịch không có order_code → skipped', async () => {
    const { service, gateway } = makeService(
      'payos',
      undefined,
      detailTables(issueRow(), txRow({ order_code: null })),
    );
    const detail = await service.getIssue(ISSUE_ID);
    expect(detail.verification).toBe('skipped');
    expect(gateway.getPaymentStatus).not.toHaveBeenCalled();
  });
});

describe('BE-ABL-09 AdminPaymentIssuesService.resolveIssue', () => {
  it('UTCID01 note rỗng → 400, không gọi RPC', async () => {
    const { service, mock } = makeService('payos', 'success', {
      payment_issues: [ok(issueRow())],
      transactions: [ok([txRow()])],
    });
    await expect(
      service.resolveIssue(ADMIN_ID, ISSUE_ID, {
        remedy: 'dismiss',
        note: '   ',
      } as never),
    ).rejects.toThrow(BadRequestException);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('UTCID02 note vượt 1000 ký tự → 400', async () => {
    const { service, mock } = makeService('payos', 'success', {});
    await expect(
      service.resolveIssue(ADMIN_ID, ISSUE_ID, {
        remedy: 'dismiss',
        note: 'a'.repeat(PAYMENT_ISSUE_NOTE_MAX + 1),
      } as never),
    ).rejects.toThrow(BadRequestException);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('UTCID03 extend khi cổng unavailable → 409, sự cố giữ nguyên, không gọi RPC', async () => {
    const { service, mock } = makeService('payos', new Error('timeout'), {
      payment_issues: [ok(issueRow())],
      transactions: [ok([txRow()])],
    });
    await expect(
      service.resolveIssue(ADMIN_ID, ISSUE_ID, {
        remedy: 'extend',
        note: 'đền bù',
        days: 7,
      }),
    ).rejects.toThrow(ConflictException);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('UTCID04 activate khi cổng báo thành công nhưng DB ghi thất bại (mismatch) → được phép', async () => {
    const { service, mock } = makeService(
      'payos',
      'success',
      {
        payment_issues: [ok(issueRow())],
        transactions: [ok([txRow({ status: 'failed' })])],
        admin_audit_log: [ok([{ id: 'x' }])],
      },
      {
        resolve_payment_issue: ok(
          rpcRow({ remedy: 'activate', user_id: null }),
        ),
      },
    );

    const result = await service.resolveIssue(ADMIN_ID, ISSUE_ID, {
      remedy: 'activate',
      note: 'kích hoạt trực tiếp',
    });
    expect(result.status).toBe('resolved');
    expect(mock.rpc).toHaveBeenCalledWith(
      'resolve_payment_issue',
      expect.objectContaining({ p_provider_confirmed: true }),
    );
  });

  it('UTCID05 activate khi cổng không xác nhận thanh toán → 409, không gọi RPC', async () => {
    const { service, mock } = makeService('payos', 'failed', {
      payment_issues: [ok(issueRow())],
      transactions: [ok([txRow()])],
    });

    await expect(
      service.resolveIssue(ADMIN_ID, ISSUE_ID, {
        remedy: 'activate',
        note: 'kích hoạt trực tiếp',
      }),
    ).rejects.toThrow(ConflictException);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('UTCID06 refund: RPC nhận đúng thông tin hoàn tiền, gửi thông báo cho user còn tồn tại', async () => {
    const { service, notifications, mock } = makeService(
      'fake',
      undefined,
      {
        payment_issues: [ok(issueRow())],
        transactions: [ok([txRow()])],
        admin_audit_log: [ok([{ id: 'x' }])],
      },
      {
        resolve_payment_issue: ok(
          rpcRow({
            remedy: 'refund',
            created_transaction_id: '99999999-9999-4999-8999-999999999999',
          }),
        ),
      },
    );

    const result = await service.resolveIssue(ADMIN_ID, ISSUE_ID, {
      remedy: 'refund',
      note: 'ghi nhận hoàn tiền',
      refundAmountVnd: 49000,
      refundRef: 'REF-42',
    });
    expect(result.createdTransactionId).toBe(
      '99999999-9999-4999-8999-999999999999',
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      USER_ID,
      'billing.issue_resolved',
      expect.objectContaining({ summary: expect.any(String) }),
    );
    const params = mock.rpc.mock.calls[0][1];
    expect(params).toEqual(
      expect.objectContaining({
        p_issue_id: ISSUE_ID,
        p_remedy: 'refund',
        p_refund_ref: 'REF-42',
        p_refund_amount_vnd: 49000,
        p_admin_id: ADMIN_ID,
      }),
    );
  });

  it('UTCID07 tài khoản đã xoá: RPC trả user_id = null → không gửi thông báo, vẫn ghi audit', async () => {
    const { service, notifications, mock } = makeService(
      'fake',
      undefined,
      {
        payment_issues: [ok(issueRow())],
        transactions: [ok([txRow({ user_id: null, account: null })])],
        admin_audit_log: [ok([{ id: 'x' }])],
      },
      {
        resolve_payment_issue: ok(rpcRow({ remedy: 'extend', user_id: null })),
      },
    );

    await service.resolveIssue(ADMIN_ID, ISSUE_ID, {
      remedy: 'extend',
      note: 'đền bù 7 ngày',
      days: 7,
    });
    expect(notifications.notify).not.toHaveBeenCalled();
    const auditInsert = mock.builders.admin_audit_log.insert.mock
      .calls[0][0] as Record<string, unknown>;
    expect(auditInsert).toEqual(
      expect.objectContaining({
        admin_id: ADMIN_ID,
        action: 'payment_issue.resolve',
        target_type: 'payment_issue',
        target_id: ISSUE_ID,
      }),
    );
  });

  it('UTCID08 dismiss không yêu cầu đối chiếu, gọi RPC dù cổng unavailable', async () => {
    const { service, mock } = makeService(
      'payos',
      new Error('timeout'),
      {
        payment_issues: [ok(issueRow())],
        transactions: [ok([txRow()])],
        admin_audit_log: [ok([{ id: 'x' }])],
      },
      {
        resolve_payment_issue: ok(
          rpcRow({
            remedy: 'dismiss',
            duplicate_of_issue_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          }),
        ),
      },
    );
    const result = await service.resolveIssue(ADMIN_ID, ISSUE_ID, {
      remedy: 'dismiss',
      note: 'trùng sự cố cũ',
      duplicateOfIssueId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    expect(result.remedy).toBe('dismiss');
    expect(mock.rpc).toHaveBeenCalled();
  });

  it('UTCID09 RPC báo sự cố đã resolved (ST002) → 409', async () => {
    const { service } = makeService(
      'fake',
      undefined,
      {
        payment_issues: [ok(issueRow())],
        transactions: [ok([txRow()])],
      },
      { resolve_payment_issue: fail('ST002') },
    );
    await expect(
      service.resolveIssue(ADMIN_ID, ISSUE_ID, {
        remedy: 'dismiss',
        note: 'x',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('UTCID10 RPC báo note thiếu (ST004) → 400', async () => {
    const { service } = makeService(
      'fake',
      undefined,
      {
        payment_issues: [ok(issueRow())],
        transactions: [ok([txRow()])],
      },
      { resolve_payment_issue: fail('ST004') },
    );
    await expect(
      service.resolveIssue(ADMIN_ID, ISSUE_ID, {
        remedy: 'dismiss',
        note: 'x',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('UTCID11 sự cố không tồn tại (ST001) → 404', async () => {
    const { service } = makeService(
      'fake',
      undefined,
      {
        payment_issues: [ok(issueRow())],
        transactions: [ok([txRow()])],
      },
      { resolve_payment_issue: fail('ST001') },
    );
    await expect(
      service.resolveIssue(ADMIN_ID, ISSUE_ID, {
        remedy: 'dismiss',
        note: 'x',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('UTCID13 extend khi cổng xác nhận: RPC nhận số ngày và user được thông báo kèm số ngày', async () => {
    const { service, notifications, mock } = makeService(
      'payos',
      'success',
      {
        payment_issues: [ok(issueRow())],
        transactions: [ok([txRow()])],
        admin_audit_log: [ok([{ id: 'x' }])],
      },
      {
        resolve_payment_issue: ok(rpcRow({ remedy: 'extend' })),
      },
    );

    const result = await service.resolveIssue(ADMIN_ID, ISSUE_ID, {
      remedy: 'extend',
      note: 'đền bù 7 ngày',
      days: 7,
    });

    expect(result.remedy).toBe('extend');
    expect(mock.rpc).toHaveBeenCalledWith(
      'resolve_payment_issue',
      expect.objectContaining({ p_remedy: 'extend', p_days: 7 }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      USER_ID,
      'billing.issue_resolved',
      expect.objectContaining({ remedy: 'extend', days: 7 }),
    );
  });

  it('UTCID12 lỗi RPC lạ → 500 (sự cố giữ nguyên, không báo đã xử lý)', async () => {
    const { service } = makeService(
      'fake',
      undefined,
      {
        payment_issues: [ok(issueRow())],
        transactions: [ok([txRow()])],
      },
      { resolve_payment_issue: fail('P0001') },
    );
    await expect(
      service.resolveIssue(ADMIN_ID, ISSUE_ID, {
        remedy: 'dismiss',
        note: 'x',
      }),
    ).rejects.toThrow();
  });
});
