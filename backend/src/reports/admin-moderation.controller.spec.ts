import { ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminModerationController } from './admin-moderation.controller';
import type { ModerationRemovalService } from './moderation-removal.service';
import type { RemoveProjectDto } from './dto/remove-project.dto';

const PROJECT = '33333333-3333-4333-8333-333333333333';

describe('AdminModerationController', () => {
  it('có JwtAuthGuard, SessionAuthGuard và AdminGuard đúng thứ tự', () => {
    expect(
      Reflect.getMetadata('__guards__', AdminModerationController),
    ).toEqual([JwtAuthGuard, SessionAuthGuard, AdminGuard]);
  });

  it('nằm dưới admin/reports; remove là POST :projectId/remove, removal-impact là GET :projectId/removal-impact', () => {
    expect(Reflect.getMetadata('path', AdminModerationController)).toBe(
      'admin/reports',
    );
    const remove = Object.getOwnPropertyDescriptor(
      AdminModerationController.prototype,
      'remove',
    )?.value as object;
    expect(Reflect.getMetadata('path', remove)).toBe(':projectId/remove');
    expect(Reflect.getMetadata('method', remove)).toBe(1);

    const impact = Object.getOwnPropertyDescriptor(
      AdminModerationController.prototype,
      'removalImpact',
    )?.value as object;
    expect(Reflect.getMetadata('path', impact)).toBe(
      ':projectId/removal-impact',
    );
    expect(Reflect.getMetadata('method', impact)).toBe(0);
  });

  it('remove trả 200 chứ không phải 201', () => {
    const remove = Object.getOwnPropertyDescriptor(
      AdminModerationController.prototype,
      'remove',
    )?.value as object;
    expect(Reflect.getMetadata('__httpCode__', remove)).toBe(200);
  });

  it('projectId dùng ParseUUIDPipe', () => {
    const args = Reflect.getMetadata(
      '__routeArguments__',
      AdminModerationController,
      'remove',
    ) as Record<string, { data?: string; pipes: unknown[] }>;
    const projectIdArg = Object.values(args).find(
      (arg) => arg.data === 'projectId',
    );
    expect(projectIdArg?.pipes).toContain(ParseUUIDPipe);
  });

  it('adminId lấy từ token, không từ body', async () => {
    const remove = jest.fn().mockResolvedValue({ closedReports: 0 });
    const controller = new AdminModerationController({
      removeProject: remove,
    } as unknown as ModerationRemovalService);
    const req = { user: { id: 'admin-from-token' } } as AuthenticatedRequest;
    const dto = {
      reason: 'x'.repeat(10),
      policy: 'copyright',
    } as RemoveProjectDto;

    await expect(controller.remove(req, PROJECT, dto)).resolves.toEqual({
      closedReports: 0,
    });
    expect(remove).toHaveBeenCalledWith('admin-from-token', PROJECT, dto);
  });
});
