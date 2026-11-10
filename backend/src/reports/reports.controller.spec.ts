import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ReportsController } from './reports.controller';
import type { ReportsService } from './reports.service';

describe('ReportsController', () => {
  it('yêu cầu đăng nhập và phiên nghiệp vụ, không yêu cầu quyền admin', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      ReportsController,
    ) as unknown[];
    expect(guards).toEqual([JwtAuthGuard, SessionAuthGuard]);
    expect(guards).not.toContain(AdminGuard);
  });

  it('nằm dưới projects/:projectId/reports', () => {
    expect(Reflect.getMetadata('path', ReportsController)).toBe(
      'projects/:projectId/reports',
    );
  });

  it('create chuyển userId của người đăng nhập, không lấy từ body', async () => {
    const createReport = jest.fn().mockResolvedValue({ id: 'r1' });
    const controller = new ReportsController({
      createReport,
    } as unknown as ReportsService);
    const req = { user: { id: 'u1' } } as AuthenticatedRequest;
    const dto = { reason: 'spam' as const };

    await expect(controller.create(req, 'p1', dto)).resolves.toEqual({
      id: 'r1',
    });
    expect(createReport).toHaveBeenCalledWith('u1', 'p1', dto);
  });
});
