import { ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminProjectRestoreController } from './admin-project-restore.controller';
import type { ModerationRemovalService } from './moderation-removal.service';

const PROJECT = '33333333-3333-4333-8333-333333333333';

describe('AdminProjectRestoreController', () => {
  it('có JwtAuthGuard, SessionAuthGuard và AdminGuard đúng thứ tự', () => {
    expect(
      Reflect.getMetadata('__guards__', AdminProjectRestoreController),
    ).toEqual([JwtAuthGuard, SessionAuthGuard, AdminGuard]);
  });

  it('nằm dưới admin/projects; restore là POST :projectId/restore', () => {
    expect(Reflect.getMetadata('path', AdminProjectRestoreController)).toBe(
      'admin/projects',
    );
    const restore = Object.getOwnPropertyDescriptor(
      AdminProjectRestoreController.prototype,
      'restore',
    )?.value as object;
    expect(Reflect.getMetadata('path', restore)).toBe(':projectId/restore');
    expect(Reflect.getMetadata('method', restore)).toBe(1);
    expect(Reflect.getMetadata('__httpCode__', restore)).toBe(200);
  });

  it('projectId dùng ParseUUIDPipe', () => {
    const args = Reflect.getMetadata(
      '__routeArguments__',
      AdminProjectRestoreController,
      'restore',
    ) as Record<string, { data?: string; pipes: unknown[] }>;
    const projectIdArg = Object.values(args).find(
      (arg) => arg.data === 'projectId',
    );
    expect(projectIdArg?.pipes).toContain(ParseUUIDPipe);
  });

  it('adminId lấy từ token, lý do lấy từ body', async () => {
    const restore = jest.fn().mockResolvedValue({ restored: true });
    const controller = new AdminProjectRestoreController({
      restoreProject: restore,
    } as unknown as ModerationRemovalService);
    const req = { user: { id: 'admin-from-token' } } as AuthenticatedRequest;

    await expect(
      controller.restore(req, PROJECT, { reason: 'ok' }),
    ).resolves.toEqual({
      restored: true,
    });
    expect(restore).toHaveBeenCalledWith('admin-from-token', PROJECT, 'ok');
  });
});
