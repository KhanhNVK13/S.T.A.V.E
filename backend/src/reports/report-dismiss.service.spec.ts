import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import type { NotificationsService } from '../notifications/notifications.service';
import { ReportDismissService } from './report-dismiss.service';

const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const R1 = '00000000-0000-4000-8000-000000000001';
const R2 = '00000000-0000-4000-8000-000000000002';
const R3 = '00000000-0000-4000-8000-000000000003';
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

const ok = (data: unknown): QueryResult => ({ data, error: null });
const fail = (message = 'boom'): QueryResult => ({
  data: null,
  error: { message },
});

interface Setup {
  project?: QueryResult;
  pending?: QueryResult;
  update?: QueryResult;
  audit?: QueryResult;
  notify?: jest.Mock;
}

function build(setup: Setup = {}) {
  const reports: QueryResult[] = [];
  if (setup.pending) reports.push(setup.pending);
  if (setup.update) reports.push(setup.update);
  const mock = createSupabaseMock([], {
    tables: {
      projects: [setup.project ?? ok({ id: PROJECT, name: 'Song A' })],
      reports,
      admin_audit_log: [setup.audit ?? ok(null)],
    },
  });
  const notify = setup.notify ?? jest.fn().mockResolvedValue(undefined);
  const service = new ReportDismissService(mock.client, {
    notify,
  } as unknown as NotificationsService);
  return { mock, service, notify };
}

const touched = (mock: ReturnType<typeof build>['mock'], table: string) =>
  (mock.client.from as jest.Mock).mock.calls.filter(
    (call: unknown[]) => call[0] === table,
  ).length;

const nothingWritten = (mock: ReturnType<typeof build>['mock']) => {
  expect(mock.builders.reports.update).not.toHaveBeenCalled();
  expect(touched(mock, 'admin_audit_log')).toBe(0);
};

const conflictBody = async (promise: Promise<unknown>) => {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ConflictException);
  return (caught as ConflictException).getResponse() as {
    message: string;
    newReportIds: string[];
  };
};

const happy = (): Setup => ({
  pending: ok([{ id: R1 }, { id: R2 }]),
  update: ok([
    { id: R1, reporter_id: U1 },
    { id: R2, reporter_id: U2 },
  ]),
});

describe('ReportDismissService.dismiss', () => {
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('409: dữ liệu đã đổi, không ghi gì', () => {
    it('có báo cáo pending mới ngoài reportIds -> 409 kèm đúng newReportIds', async () => {
      const { service, mock, notify } = build({
        pending: ok([{ id: R1 }, { id: R2 }, { id: R3 }]),
      });
      const body = await conflictBody(
        service.dismiss(ADMIN, PROJECT, { reportIds: [R1, R2], reason: 'ok' }),
      );
      expect(body.newReportIds).toEqual([R3]);
      expect(typeof body.message).toBe('string');
      nothingWritten(mock);
      expect(notify).not.toHaveBeenCalled();
    });

    it('id đã chọn không còn pending (đã đóng hoặc không thuộc dự án) -> 409, không ghi gì', async () => {
      const { service, mock, notify } = build({ pending: ok([{ id: R1 }]) });
      const body = await conflictBody(
        service.dismiss(ADMIN, PROJECT, { reportIds: [R1, R2], reason: 'ok' }),
      );
      expect(body.newReportIds).toEqual([]);
      nothingWritten(mock);
      expect(notify).not.toHaveBeenCalled();
    });

    it('vừa có báo cáo mới vừa có id lạ -> 409 trả newReportIds, không ghi gì', async () => {
      const { service, mock } = build({
        pending: ok([{ id: R1 }, { id: R3 }]),
      });
      const body = await conflictBody(
        service.dismiss(ADMIN, PROJECT, { reportIds: [R1, R2], reason: 'ok' }),
      );
      expect(body.newReportIds).toEqual([R3]);
      nothingWritten(mock);
    });

    it('số dòng thực sự đổi ít hơn reportIds.length (admin khác đóng trước) -> 409, không audit, không thông báo', async () => {
      const { service, mock, notify } = build({
        pending: ok([{ id: R1 }, { id: R2 }]),
        update: ok([{ id: R1, reporter_id: U1 }]),
      });
      await conflictBody(
        service.dismiss(ADMIN, PROJECT, { reportIds: [R1, R2], reason: 'ok' }),
      );
      expect(mock.builders.reports.update).toHaveBeenCalledTimes(1);
      expect(touched(mock, 'admin_audit_log')).toBe(0);
      expect(notify).not.toHaveBeenCalled();
    });

    it('UPDATE không đổi dòng nào -> 409', async () => {
      const { service } = build({
        pending: ok([{ id: R1 }]),
        update: ok([]),
      });
      await conflictBody(
        service.dismiss(ADMIN, PROJECT, { reportIds: [R1], reason: 'ok' }),
      );
    });
  });

  describe('thành công', () => {
    it('đóng đúng các id với đúng giá trị cột và điều kiện', async () => {
      const { service, mock } = build(happy());
      const before = Date.now();
      await service.dismiss(ADMIN, PROJECT, {
        reportIds: [R1, R2],
        reason: 'Not a violation',
      });
      const after = Date.now();

      const [patch] = mock.builders.reports.update.mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(patch).toMatchObject({
        status: 'resolved',
        resolution: 'dismissed',
        resolution_note: 'Not a violation',
        resolved_by: ADMIN,
      });
      const resolvedAt = Date.parse(String(patch.resolved_at));
      expect(resolvedAt).toBeGreaterThanOrEqual(before);
      expect(resolvedAt).toBeLessThanOrEqual(after);

      expect(mock.builders.reports.eq).toHaveBeenCalledWith(
        'project_id',
        PROJECT,
      );
      expect(mock.builders.reports.eq).toHaveBeenCalledWith(
        'status',
        'pending',
      );
      expect(mock.builders.reports.in).toHaveBeenCalledWith('id', [R1, R2]);
    });

    it('trả dismissedCount bằng số dòng thực sự đổi', async () => {
      const { service } = build(happy());
      await expect(
        service.dismiss(ADMIN, PROJECT, { reportIds: [R1, R2], reason: 'ok' }),
      ).resolves.toEqual({ dismissedCount: 2 });
    });

    it('khử id trùng trước khi so số dòng', async () => {
      const { service, mock } = build({
        pending: ok([{ id: R1 }]),
        update: ok([{ id: R1, reporter_id: U1 }]),
      });
      await expect(
        service.dismiss(ADMIN, PROJECT, {
          reportIds: [R1, R1],
          reason: 'ok',
        }),
      ).resolves.toEqual({ dismissedCount: 1 });
      expect(mock.builders.reports.in).toHaveBeenCalledWith('id', [R1]);
    });

    it('lý do được trim trước khi lưu', async () => {
      const { service, mock } = build(happy());
      await service.dismiss(ADMIN, PROJECT, {
        reportIds: [R1, R2],
        reason: '  spaced  ',
      });
      expect(
        (
          mock.builders.reports.update.mock.calls[0][0] as Record<
            string,
            unknown
          >
        ).resolution_note,
      ).toBe('spaced');
    });

    it('audit ghi đúng MỘT lần với target_type project và action report.dismiss', async () => {
      const { service, mock } = build(happy());
      await service.dismiss(ADMIN, PROJECT, {
        reportIds: [R1, R2],
        reason: 'Not a violation',
      });
      expect(mock.builders.admin_audit_log.insert).toHaveBeenCalledTimes(1);
      expect(mock.builders.admin_audit_log.insert).toHaveBeenCalledWith({
        admin_id: ADMIN,
        action: 'report.dismiss',
        target_type: 'project',
        target_id: PROJECT,
        reason: 'Not a violation',
      });
    });

    it('thông báo report.reviewed gửi đúng số người báo cáo, chỉ kèm projectName', async () => {
      const { service, notify } = build(happy());
      await service.dismiss(ADMIN, PROJECT, {
        reportIds: [R1, R2],
        reason: 'ok',
      });
      expect(notify).toHaveBeenCalledTimes(2);
      expect(notify).toHaveBeenCalledWith(U1, 'report.reviewed', {
        projectName: 'Song A',
      });
      expect(notify).toHaveBeenCalledWith(U2, 'report.reviewed', {
        projectName: 'Song A',
      });
    });

    it('thông báo không nêu kết quả, lý do hay tên/id admin', async () => {
      const { service, notify } = build(happy());
      await service.dismiss(ADMIN, PROJECT, {
        reportIds: [R1, R2],
        reason: 'secret internal reason',
      });
      const sent = JSON.stringify(notify.mock.calls);
      for (const forbidden of [
        'dismiss',
        'upheld',
        'resolved',
        'secret internal reason',
        ADMIN,
      ]) {
        expect(sent.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
    });

    it('reporter_id null (tài khoản đã xoá) thì bỏ qua', async () => {
      const { service, notify } = build({
        pending: ok([{ id: R1 }, { id: R2 }]),
        update: ok([
          { id: R1, reporter_id: null },
          { id: R2, reporter_id: U2 },
        ]),
      });
      await service.dismiss(ADMIN, PROJECT, {
        reportIds: [R1, R2],
        reason: 'ok',
      });
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith(U2, 'report.reviewed', {
        projectName: 'Song A',
      });
    });

    it('một người báo cáo hai báo cáo vẫn chỉ nhận một thông báo', async () => {
      const { service, notify } = build({
        pending: ok([{ id: R1 }, { id: R2 }]),
        update: ok([
          { id: R1, reporter_id: U1 },
          { id: R2, reporter_id: U1 },
        ]),
      });
      await service.dismiss(ADMIN, PROJECT, {
        reportIds: [R1, R2],
        reason: 'ok',
      });
      expect(notify).toHaveBeenCalledTimes(1);
    });
  });

  describe('lỗi', () => {
    it('lỗi ghi -> 500, báo cáo vẫn mở: không audit, không thông báo', async () => {
      const { service, mock, notify } = build({
        pending: ok([{ id: R1 }]),
        update: fail('write failed'),
      });
      await expect(
        service.dismiss(ADMIN, PROJECT, { reportIds: [R1], reason: 'ok' }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(touched(mock, 'admin_audit_log')).toBe(0);
      expect(notify).not.toHaveBeenCalled();
    });

    it('lỗi đọc danh sách pending -> 500 và không ghi gì', async () => {
      const { service, mock } = build({ pending: fail() });
      await expect(
        service.dismiss(ADMIN, PROJECT, { reportIds: [R1], reason: 'ok' }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
      nothingWritten(mock);
    });

    it('lỗi đọc dự án -> 500', async () => {
      const { service } = build({ project: fail() });
      await expect(
        service.dismiss(ADMIN, PROJECT, { reportIds: [R1], reason: 'ok' }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('dự án không tồn tại -> 404 và không chạm bảng reports', async () => {
      const { service, mock } = build({ project: ok(null) });
      await expect(
        service.dismiss(ADMIN, PROJECT, { reportIds: [R1], reason: 'ok' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(touched(mock, 'reports')).toBe(0);
    });

    it('lỗi gửi thông báo (notify ném lỗi) -> vẫn 200 và vẫn đã đóng', async () => {
      const notify = jest.fn().mockRejectedValue(new Error('notify down'));
      const { service, mock } = build({ ...happy(), notify });
      await expect(
        service.dismiss(ADMIN, PROJECT, { reportIds: [R1, R2], reason: 'ok' }),
      ).resolves.toEqual({ dismissedCount: 2 });
      expect(mock.builders.reports.update).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalled();
    });

    it('lỗi ghi audit sau khi đã đóng -> vẫn 200, có log mức error, vẫn gửi thông báo', async () => {
      const { service, notify } = build({
        ...happy(),
        audit: fail('audit failed'),
      });
      await expect(
        service.dismiss(ADMIN, PROJECT, { reportIds: [R1, R2], reason: 'ok' }),
      ).resolves.toEqual({ dismissedCount: 2 });
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('audit'));
      expect(notify).toHaveBeenCalledTimes(2);
    });
  });

  describe('lý do', () => {
    it.each(['', '   ', '\n\t'])(
      'lý do %j -> 400 và không đóng gì, không đọc DB',
      async (reason) => {
        const { service, mock } = build(happy());
        await expect(
          service.dismiss(ADMIN, PROJECT, { reportIds: [R1], reason }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(touched(mock, 'projects')).toBe(0);
        nothingWritten(mock);
      },
    );
  });
});
