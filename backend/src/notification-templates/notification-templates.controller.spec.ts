import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { NotificationTemplatesController } from './notification-templates.controller';
import type {
  CreateNotificationTemplateDto,
  PreviewNotificationTemplateDto,
} from './dto';
import type { NotificationTemplatesService } from './notification-templates.service';

const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEMPLATE = { type: 'collab.invite' };

function makeController() {
  const service = {
    listTemplates: jest.fn().mockResolvedValue([TEMPLATE]),
    upsertTemplate: jest.fn().mockResolvedValue({ item: TEMPLATE, created: true }),
    deleteTemplate: jest.fn().mockResolvedValue(undefined),
    preview: jest.fn().mockResolvedValue({ subject: '', body: '' }),
  };
  return {
    service,
    controller: new NotificationTemplatesController(
      service as unknown as NotificationTemplatesService,
    ),
  };
}

describe('NotificationTemplatesController', () => {
  it('có JwtAuthGuard, SessionAuthGuard và AdminGuard đúng thứ tự', () => {
    expect(Reflect.getMetadata('__guards__', NotificationTemplatesController)).toEqual(
      [JwtAuthGuard, SessionAuthGuard, AdminGuard],
    );
  });

  it('nằm dưới admin/notification-templates', () => {
    expect(Reflect.getMetadata('path', NotificationTemplatesController)).toBe(
      'admin/notification-templates',
    );
  });

  it('list gọi service.listTemplates', async () => {
    const { controller, service } = makeController();
    await controller.list();
    expect(service.listTemplates).toHaveBeenCalledTimes(1);
  });

  it('upsert chuyển admin id, type và dto (type là chuỗi, không UUID)', async () => {
    const { controller, service } = makeController();
    const req = { user: { id: ADMIN } } as never;
    const res = { status: jest.fn() } as unknown as Response;
    const dto = {
      name: 'Mẫu',
      subject: 's',
      bodyTemplate: 'b',
    } as CreateNotificationTemplateDto;
    const returned = await controller.upsert(req, res, 'collab.invite', dto);
    expect(service.upsertTemplate).toHaveBeenCalledWith(
      ADMIN,
      'collab.invite',
      dto,
    );
    expect(returned).toEqual(TEMPLATE);
  });

  it('upsert đặt 201 khi tạo mới, 200 khi sửa', async () => {
    const { controller, service } = makeController();
    const req = { user: { id: ADMIN } } as never;
    const res = { status: jest.fn() } as unknown as Response;
    const dto = {
      name: 'Mẫu',
      subject: 's',
      bodyTemplate: 'b',
    } as CreateNotificationTemplateDto;

    service.upsertTemplate.mockResolvedValueOnce({
      item: TEMPLATE,
      created: true,
    });
    await controller.upsert(req, res, 'collab.invite', dto);
    expect(res.status).toHaveBeenCalledWith(201);

    service.upsertTemplate.mockResolvedValueOnce({
      item: TEMPLATE,
      created: false,
    });
    await controller.upsert(req, res, 'collab.invite', dto);
    expect(res.status).toHaveBeenLastCalledWith(200);
  });

  it('remove chuyển admin id và type tới service.deleteTemplate', async () => {
    const { controller, service } = makeController();
    const req = { user: { id: ADMIN } } as never;
    await controller.remove(req, 'collab.invite');
    expect(service.deleteTemplate).toHaveBeenCalledWith(ADMIN, 'collab.invite');
  });

  it('preview chuyển dto', async () => {
    const { controller, service } = makeController();
    const dto = {
      type: 'collab.invite',
      subject: 's',
      bodyTemplate: 'b',
    } as PreviewNotificationTemplateDto;
    await controller.preview(dto);
    expect(service.preview).toHaveBeenCalledWith(dto);
  });

  it('route upsert dùng @Param type thường, không dùng ParseUUIDPipe', () => {
    const args = Reflect.getMetadata(
      '__routeArguments__',
      NotificationTemplatesController,
      'upsert',
    ) as Record<string, { data?: string; pipes: unknown[] }>;
    const typeArg = Object.values(args).find((arg) => arg.data === 'type');
    expect(typeArg?.pipes ?? []).toEqual([]);
  });
});
