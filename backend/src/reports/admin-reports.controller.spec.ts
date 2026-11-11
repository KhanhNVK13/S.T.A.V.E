import { ParseUUIDPipe, type ArgumentMetadata } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminReportsController } from './admin-reports.controller';
import type { AdminReportsService } from './admin-reports.service';
import type { ReportModerationService } from './report-moderation.service';

const UUID = '33333333-3333-4333-8333-333333333333';

function makeController() {
  const service = {
    listGroups: jest.fn().mockResolvedValue({ items: [] }),
    getDetails: jest.fn().mockResolvedValue([]),
    getPreview: jest.fn().mockResolvedValue({}),
  };
  return {
    service,
    controller: new AdminReportsController(
      service as unknown as AdminReportsService,
      {} as unknown as ReportModerationService,
    ),
  };
}

describe('AdminReportsController', () => {
  it('có JwtAuthGuard, SessionAuthGuard và AdminGuard đúng thứ tự', () => {
    expect(Reflect.getMetadata('__guards__', AdminReportsController)).toEqual([
      JwtAuthGuard,
      SessionAuthGuard,
      AdminGuard,
    ]);
  });

  it('nằm dưới admin/reports', () => {
    expect(Reflect.getMetadata('path', AdminReportsController)).toBe(
      'admin/reports',
    );
  });

  it('projectId không phải UUID bị ParseUUIDPipe từ chối', async () => {
    const pipe = new ParseUUIDPipe();
    const meta: ArgumentMetadata = { type: 'param', data: 'projectId' };
    await expect(pipe.transform('not-a-uuid', meta)).rejects.toThrow();
    await expect(pipe.transform(UUID, meta)).resolves.toBe(UUID);
  });

  it('mọi route có tham số projectId đều dùng ParseUUIDPipe', () => {
    for (const method of ['details', 'preview'] as const) {
      const args = Reflect.getMetadata(
        '__routeArguments__',
        AdminReportsController,
        method,
      ) as Record<string, { data?: string; pipes: unknown[] }>;
      const projectIdArg = Object.values(args).find(
        (arg) => arg.data === 'projectId',
      );
      expect(projectIdArg?.pipes).toContain(ParseUUIDPipe);
    }
  });

  it('list chuyển status, page, limit từ query', async () => {
    const { controller, service } = makeController();
    await controller.list({ status: 'upheld', page: 2, limit: 10 });
    expect(service.listGroups).toHaveBeenCalledWith({
      status: 'upheld',
      page: 2,
      limit: 10,
    });
  });

  it('list dùng giá trị mặc định khi thiếu', async () => {
    const { controller, service } = makeController();
    await controller.list({});
    expect(service.listGroups).toHaveBeenCalledWith({
      status: 'open',
      page: 1,
      limit: 20,
    });
  });

  it('details chuyển projectId và status (mặc định open)', async () => {
    const { controller, service } = makeController();
    await controller.details(UUID, {});
    expect(service.getDetails).toHaveBeenCalledWith(UUID, 'open');
    await controller.details(UUID, { status: 'dismissed' });
    expect(service.getDetails).toHaveBeenLastCalledWith(UUID, 'dismissed');
  });

  it('preview chỉ nhận projectId', async () => {
    const { controller, service } = makeController();
    await controller.preview(UUID);
    expect(service.getPreview).toHaveBeenCalledWith(UUID);
  });
});
