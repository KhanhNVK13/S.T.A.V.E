import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import { ReportsService } from './reports.service';

const USER = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const REPORT_ID = '44444444-4444-4444-8444-444444444444';

const project = (over: Record<string, unknown> = {}): QueryResult => ({
  data: {
    owner_id: OWNER,
    visibility: 'public',
    archived_at: null,
    moderation_hidden_at: null,
    ...over,
  },
  error: null,
});

function build(projects: QueryResult[], reports: QueryResult[] = []) {
  const mock = createSupabaseMock([], { tables: { projects, reports } });
  return { mock, service: new ReportsService(mock.client) };
}

const fromCalls = (mock: ReturnType<typeof build>['mock'], table: string) =>
  (mock.client.from as jest.Mock).mock.calls.filter(
    (call: unknown[]) => call[0] === table,
  );

describe('ReportsService.createReport', () => {
  it('dự án của mình -> 403', async () => {
    const { service, mock } = build([project({ owner_id: USER })]);
    await expect(
      service.createReport(USER, PROJECT, { reason: 'spam' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fromCalls(mock, 'reports')).toHaveLength(0);
  });

  it('dự án riêng tư của chính mình vẫn là 403 (chủ biết dự án của mình)', async () => {
    const { service } = build([
      project({ owner_id: USER, visibility: 'private' }),
    ]);
    await expect(
      service.createReport(USER, PROJECT, { reason: 'spam' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('dự án không tồn tại -> 404', async () => {
    const { service } = build([{ data: null, error: null }]);
    await expect(
      service.createReport(USER, PROJECT, { reason: 'spam' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['riêng tư', { visibility: 'private' }],
    ['đã archive', { archived_at: '2026-10-01T00:00:00Z' }],
    ['bị ẩn kiểm duyệt', { moderation_hidden_at: '2026-10-02T00:00:00Z' }],
  ])('dự án %s -> 404 và không ghi báo cáo', async (_label, over) => {
    const { service, mock } = build([project(over)]);
    await expect(
      service.createReport(USER, PROJECT, { reason: 'spam' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fromCalls(mock, 'reports')).toHaveLength(0);
  });

  it('riêng tư, không tồn tại, archive, bị ẩn trả cùng status và cùng message', async () => {
    const cases: QueryResult[] = [
      { data: null, error: null },
      project({ visibility: 'private' }),
      project({ archived_at: '2026-10-01T00:00:00Z' }),
      project({ moderation_hidden_at: '2026-10-02T00:00:00Z' }),
    ];
    const responses: unknown[] = [];
    for (const result of cases) {
      const { service } = build([result]);
      try {
        await service.createReport(USER, PROJECT, { reason: 'spam' });
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        responses.push((error as NotFoundException).getResponse());
      }
    }
    expect(responses).toHaveLength(4);
    for (const response of responses) {
      expect(response).toEqual(responses[0]);
    }
  });

  it('lỗi đọc dự án -> 500', async () => {
    const { service } = build([{ data: null, error: { message: 'boom' } }]);
    await expect(
      service.createReport(USER, PROJECT, { reason: 'spam' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('trùng báo cáo đang mở (lỗi 23505) -> 409', async () => {
    const { service } = build(
      [project()],
      [{ data: null, error: { code: '23505', message: 'duplicate key' } }],
    );
    await expect(
      service.createReport(USER, PROJECT, { reason: 'spam' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lỗi insert khác -> 500', async () => {
    const { service } = build(
      [project()],
      [{ data: null, error: { code: '42501', message: 'denied' } }],
    );
    await expect(
      service.createReport(USER, PROJECT, { reason: 'spam' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('insert không trả dòng nào -> 500', async () => {
    const { service } = build([project()], [{ data: null, error: null }]);
    await expect(
      service.createReport(USER, PROJECT, { reason: 'spam' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('thành công: insert pending, đúng reporter, details đã làm sạch', async () => {
    const { service, mock } = build(
      [project()],
      [{ data: { id: REPORT_ID }, error: null }],
    );
    await service.createReport(USER, PROJECT, {
      reason: 'copyright',
      details: 'giống bài X',
    });
    expect(mock.builders.reports.insert).toHaveBeenCalledWith({
      project_id: PROJECT,
      reporter_id: USER,
      reason: 'copyright',
      details: 'giống bài X',
      status: 'pending',
    });
  });

  it('thành công: details vắng hoặc trắng được ghi là null', async () => {
    const { service, mock } = build(
      [project()],
      [{ data: { id: REPORT_ID }, error: null }],
    );
    await service.createReport(USER, PROJECT, {
      reason: 'other',
      details: '   ',
    });
    expect(mock.builders.reports.insert).toHaveBeenCalledWith(
      expect.objectContaining({ details: null }),
    );
  });

  it('thành công: response chỉ có id, không lộ người báo cáo hay dự án', async () => {
    const { service } = build(
      [project()],
      [
        {
          data: {
            id: REPORT_ID,
            reporter_id: USER,
            project_id: PROJECT,
            details: 'x',
          },
          error: null,
        },
      ],
    );
    const result = await service.createReport(USER, PROJECT, {
      reason: 'spam',
    });
    expect(result).toEqual({ id: REPORT_ID });
    expect(Object.keys(result)).toEqual(['id']);
  });

  it('chỉ đọc bảng projects đúng một lần và chỉ chọn các cột cần thiết', async () => {
    const { service, mock } = build(
      [project()],
      [{ data: { id: REPORT_ID }, error: null }],
    );
    await service.createReport(USER, PROJECT, { reason: 'spam' });
    expect(fromCalls(mock, 'projects')).toHaveLength(1);
    expect(mock.builders.projects.select).toHaveBeenCalledWith(
      'owner_id, visibility, archived_at, moderation_hidden_at',
    );
  });

  it('không gửi thông báo và không đọc bảng users', async () => {
    const { service, mock } = build(
      [project()],
      [{ data: { id: REPORT_ID }, error: null }],
    );
    await service.createReport(USER, PROJECT, { reason: 'spam' });
    expect(fromCalls(mock, 'users')).toHaveLength(0);
    expect(fromCalls(mock, 'notifications')).toHaveLength(0);
  });
});
