import { ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminReportDismissController } from './admin-report-dismiss.controller';
import type { ReportDismissService } from './report-dismiss.service';

const PROJECT = '33333333-3333-4333-8333-333333333333';

const handlerOf = (): object =>
  Object.getOwnPropertyDescriptor(
    AdminReportDismissController.prototype,
    'dismiss',
  )?.value as object;

describe('AdminReportDismissController', () => {
  it('có JwtAuthGuard, SessionAuthGuard và AdminGuard đúng thứ tự', () => {
    expect(
      Reflect.getMetadata('__guards__', AdminReportDismissController),
    ).toEqual([JwtAuthGuard, SessionAuthGuard, AdminGuard]);
  });

  it('nằm dưới admin/reports và route là POST :projectId/dismiss', () => {
    expect(Reflect.getMetadata('path', AdminReportDismissController)).toBe(
      'admin/reports',
    );
    const handler = handlerOf();
    expect(Reflect.getMetadata('path', handler)).toBe(':projectId/dismiss');
    expect(Reflect.getMetadata('method', handler)).toBe(1);
  });

  it('trả 200 chứ không phải 201', () => {
    expect(Reflect.getMetadata('__httpCode__', handlerOf())).toBe(200);
  });

  it('projectId dùng ParseUUIDPipe', () => {
    const args = Reflect.getMetadata(
      '__routeArguments__',
      AdminReportDismissController,
      'dismiss',
    ) as Record<string, { data?: string; pipes: unknown[] }>;
    const projectIdArg = Object.values(args).find(
      (arg) => arg.data === 'projectId',
    );
    expect(projectIdArg?.pipes).toContain(ParseUUIDPipe);
  });

  it('adminId lấy từ token, không từ body', async () => {
    const dismiss = jest.fn().mockResolvedValue({ dismissedCount: 1 });
    const controller = new AdminReportDismissController({
      dismiss,
    } as unknown as ReportDismissService);
    const req = { user: { id: 'admin-from-token' } } as AuthenticatedRequest;
    const dto = { reportIds: ['r1'], reason: 'ok' };

    await expect(controller.dismiss(req, PROJECT, dto)).resolves.toEqual({
      dismissedCount: 1,
    });
    expect(dismiss).toHaveBeenCalledWith('admin-from-token', PROJECT, dto);
  });
});
