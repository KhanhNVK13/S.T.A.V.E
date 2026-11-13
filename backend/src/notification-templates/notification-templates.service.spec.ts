import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import { NotificationTemplatesService } from './notification-templates.service';

const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEMPLATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OLD_UPDATED_AT = '2026-11-10T09:00:00.000Z';
const NEW_UPDATED_AT = '2026-11-11T10:00:00.000Z';

const ok = (data: unknown, extra: Partial<QueryResult> = {}): QueryResult => ({
  data,
  error: null,
  ...extra,
});

const fail = (message: string, data: unknown = null): QueryResult => ({
  data,
  error: { message },
});

const templateRow = (over: Record<string, unknown> = {}) => ({
  id: TEMPLATE_ID,
  type: 'collab.invite',
  name: 'Mời cộng tác',
  subject: '{{inviterName}} mời bạn',
  body_template: 'Dự án {{projectName}}',
  updated_at: OLD_UPDATED_AT,
  ...over,
});

function build(tables: Record<string, QueryResult[]> = {}) {
  const mock = createSupabaseMock([], { tables });
  return { mock, service: new NotificationTemplatesService(mock.client) };
}

const callsFor = (mock: ReturnType<typeof build>['mock'], table: string) =>
  (mock.client.from as jest.Mock).mock.calls.filter(
    (call: unknown[]) => call[0] === table,
  );

const builder = (mock: ReturnType<typeof build>['mock'], table: string) =>
  mock.builders[table];

const dto = (over: Record<string, unknown> = {}) => ({
  name: 'Mời cộng tác',
  subject: '{{inviterName}} mời bạn',
  bodyTemplate: 'Dự án {{projectName}}',
  ...over,
});

describe('NotificationTemplatesService.listTemplates', () => {
  it('trả về mọi loại trong notification-types, loại chưa có mẫu thì template null', async () => {
    const { service } = build({ notification_templates: [ok([templateRow()])] });
    const items = await service.listTemplates();

    expect(items.length).toBe(28);
    const invite = items.find((item) => item.type === 'collab.invite');
    expect(invite?.template?.name).toBe('Mời cộng tác');
    const other = items.find((item) => item.type === 'pr.merged');
    expect(other?.template).toBeNull();
  });

  it('bỏ qua dòng DB có type không có trong notification-types', async () => {
    const { service } = build({
      notification_templates: [ok([templateRow({ type: 'khong.co.trong.danh.muc' })])],
    });
    const items = await service.listTemplates();
    expect(items.some((item) => item.type === 'khong.co.trong.danh.muc')).toBe(
      false,
    );
  });

  it('mỗi loại kèm danh sách placeholder và cờ mandatory', async () => {
    const { service } = build({ notification_templates: [ok([])] });
    const items = await service.listTemplates();
    const invite = items.find((item) => item.type === 'collab.invite');
    expect(invite?.placeholders).toEqual(['inviterName', 'projectName']);
    expect(invite?.mandatory).toBe(false);
    const billing = items.find((item) => item.type === 'billing.payment_success');
    expect(billing?.mandatory).toBe(true);
  });

  it('lỗi đọc thì 500', async () => {
    const { service } = build({
      notification_templates: [fail('boom')],
    });
    await expect(service.listTemplates()).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});

describe('NotificationTemplatesService.upsertTemplate (tạo mới — UC-110)', () => {
  it('loại không có trong notification-types thì 404, không ghi', async () => {
    const { service, mock } = build({ notification_templates: [ok(null)] });
    await expect(
      service.upsertTemplate(ADMIN, 'khong.co.trong.danh.muc', dto()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(callsFor(mock, 'notification_templates').length).toBe(0);
  });

  it('chưa có mẫu thì insert đúng giá trị đã cắt khoảng trắng, audit một lần, trả về mẫu', async () => {
    const { service, mock } = build({
      notification_templates: [ok(null), ok(templateRow({ updated_at: NEW_UPDATED_AT }))],
      admin_audit_log: [ok(null)],
    });
    const result = await service.upsertTemplate(
      ADMIN,
      'collab.invite',
      dto({ name: '  Mời cộng tác  ' }),
    );

    expect(result.created).toBe(true);
    expect(result.item.template?.name).toBe('Mời cộng tác');
    expect(result.item.type).toBe('collab.invite');
    // Không chèn lịch sử khi mới tạo.
    expect(callsFor(mock, 'notification_template_versions').length).toBe(0);
    expect(callsFor(mock, 'admin_audit_log').length).toBe(1);
    const insertCall = builder(mock, 'notification_templates').insert as jest.Mock;
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Mời cộng tác',
        type: 'collab.invite',
      }),
    );
  });

  it('lỗi insert thì 500, không audit', async () => {
    const { service, mock } = build({
      notification_templates: [ok(null), fail('insert failed')],
    });
    await expect(
      service.upsertTemplate(ADMIN, 'collab.invite', dto()),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(callsFor(mock, 'admin_audit_log').length).toBe(0);
  });

  it('lỗi đọc dòng mẫu sẵn có thì 500, không ghi', async () => {
    const { service, mock } = build({
      notification_templates: [fail('read failed')],
    });
    await expect(
      service.upsertTemplate(ADMIN, 'collab.invite', dto()),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(callsFor(mock, 'notification_templates').length).toBe(1);
  });

  it('lỗi audit KHÔNG làm hỏng kết quả: vẫn trả về mẫu đã tạo', async () => {
    const { service } = build({
      notification_templates: [ok(null), ok(templateRow({ updated_at: NEW_UPDATED_AT }))],
      admin_audit_log: [fail('audit failed')],
    });
    await expect(
      service.upsertTemplate(ADMIN, 'collab.invite', dto()),
    ).resolves.toMatchObject({ created: true, item: { type: 'collab.invite' } });
  });
});

describe('NotificationTemplatesService.upsertTemplate (sửa — UC-111)', () => {
  const updateTables = (over: Record<string, QueryResult[]> = {}) => ({
    notification_templates: [
      ok(templateRow()), // đọc bản hiện tại
      ok(templateRow({ subject: 'Mới {{inviterName}}', updated_at: NEW_UPDATED_AT })), // bản đã cập nhật
    ],
    notification_template_versions: [ok(null)],
    admin_audit_log: [ok(null)],
    ...over,
  });

  it('sửa thành công: chèn đúng MỘT dòng versions chứa BẢN CŨ, changed_by = admin', async () => {
    const { service, mock } = build(updateTables());
    await service.upsertTemplate(
      ADMIN,
      'collab.invite',
      dto({ subject: 'Mới {{inviterName}}' }),
    );

    const versionInsert = builder(mock, 'notification_template_versions')
      .insert as jest.Mock;
    expect(versionInsert).toHaveBeenCalledTimes(1);
    expect(versionInsert).toHaveBeenCalledWith({
      template_id: TEMPLATE_ID,
      type: 'collab.invite',
      subject: '{{inviterName}} mời bạn', // bản CŨ, không phải bản mới
      body_template: 'Dự án {{projectName}}',
      changed_by: ADMIN,
    });
  });

  it('chèn versions được gọi TRƯỚC lệnh update notification_templates', async () => {
    const { service, mock } = build(updateTables());
    await service.upsertTemplate(
      ADMIN,
      'collab.invite',
      dto({ subject: 'Mới {{inviterName}}' }),
    );

    // `invocationCallOrder` là MẢNG thứ tự gọi; mỗi mock gọi đúng một lần
    // nên lấy phần tử đầu để so sánh.
    const versionInsertOrder = (
      builder(mock, 'notification_template_versions').insert as jest.Mock
    ).invocationCallOrder[0];
    const updateOrder = (
      builder(mock, 'notification_templates').update as jest.Mock
    ).invocationCallOrder[0];
    expect(versionInsertOrder).toBeLessThan(updateOrder);
  });

  it('update ghi đúng bản MỚI và updated_at mới, audit notification_template.update', async () => {
    const { service, mock } = build(updateTables());
    await service.upsertTemplate(
      ADMIN,
      'collab.invite',
      dto({ subject: 'Mới {{inviterName}}' }),
    );

    const updateCall = builder(mock, 'notification_templates').update as jest.Mock;
    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Mới {{inviterName}}',
        updated_at: expect.any(String),
      }),
    );
    expect(callsFor(mock, 'admin_audit_log').length).toBe(1);
    const auditInsert = builder(mock, 'admin_audit_log').insert as jest.Mock;
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'notification_template.update' }),
    );
  });

  it('không ghi lệnh nào lên bảng notifications (thông báo đã gửi giữ nguyên)', async () => {
    const { service, mock } = build(updateTables());
    await service.upsertTemplate(
      ADMIN,
      'collab.invite',
      dto({ subject: 'Mới {{inviterName}}' }),
    );
    expect(callsFor(mock, 'notifications').length).toBe(0);
  });

  it('placeholder sai khi sửa → 400; versions KHÔNG được chèn, mẫu không đổi', async () => {
    const { service, mock } = build(updateTables());
    await expect(
      service.upsertTemplate(
        ADMIN,
        'collab.invite',
        dto({ subject: '{{khongTonTai}}' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Kiểm placeholder chạy TRƯỚC mọi ghi: không chèn versions, không update.
    expect(callsFor(mock, 'notification_template_versions').length).toBe(0);
    expect((builder(mock, 'notification_templates').update as jest.Mock).mock.calls.length).toBe(0);
  });

  it('placeholder sai cú pháp khi sửa → 400', async () => {
    const { service, mock } = build(updateTables());
    await expect(
      service.upsertTemplate(ADMIN, 'collab.invite', dto({ subject: '{{a-b}}' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(callsFor(mock, 'notification_template_versions').length).toBe(0);
  });

  it('expectedUpdatedAt lệch với updated_at hiện tại → 409, không ghi gì', async () => {
    const { service, mock } = build(updateTables());
    await expect(
      service.upsertTemplate(
        ADMIN,
        'collab.invite',
        dto({ expectedUpdatedAt: '2020-01-01T00:00:00.000Z' }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(callsFor(mock, 'notification_template_versions').length).toBe(0);
    expect(callsFor(mock, 'admin_audit_log').length).toBe(0);
  });

  it('expectedUpdatedAt khớp → sửa bình thường', async () => {
    const { service } = build(updateTables());
    await expect(
      service.upsertTemplate(
        ADMIN,
        'collab.invite',
        dto({ subject: 'Mới {{inviterName}}', expectedUpdatedAt: OLD_UPDATED_AT }),
      ),
    ).resolves.toMatchObject({ created: false, item: { type: 'collab.invite' } });
  });

  it('expectedUpdatedAt là CÙNG thời điểm nhưng khác định dạng chuỗi → vẫn sửa được', async () => {
    // Postgres trả `+00:00`, giao diện gửi `Z` — cùng một thời điểm.
    const { service } = build(
      updateTables({
        notification_templates: [
          ok(templateRow({ updated_at: '2026-11-10T09:00:00+00:00' })),
          ok(templateRow({ updated_at: NEW_UPDATED_AT })),
        ],
      }),
    );
    await expect(
      service.upsertTemplate(
        ADMIN,
        'collab.invite',
        dto({ subject: 'Mới {{inviterName}}', expectedUpdatedAt: OLD_UPDATED_AT }),
      ),
    ).resolves.toMatchObject({ created: false, item: { type: 'collab.invite' } });
  });

  it('trường rỗng sau khi cắt khoảng trắng khi sửa → 400', async () => {
    const { service, mock } = build(updateTables());
    await expect(
      service.upsertTemplate(ADMIN, 'collab.invite', dto({ name: '   ' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(callsFor(mock, 'notification_template_versions').length).toBe(0);
  });

  it('chèn versions lỗi → 500 và KHÔNG cập nhật mẫu', async () => {
    const { service, mock } = build(updateTables({
      notification_template_versions: [fail('version insert failed')],
    }));
    await expect(
      service.upsertTemplate(ADMIN, 'collab.invite', dto({ subject: 'Mới {{inviterName}}' })),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect((builder(mock, 'notification_templates').update as jest.Mock).mock.calls.length).toBe(0);
    expect(callsFor(mock, 'admin_audit_log').length).toBe(0);
  });

  it('update lỗi sau khi đã chèn versions → 500 (dòng version thừa vô hại)', async () => {
    const { service, mock } = build(updateTables({
      notification_templates: [
        ok(templateRow()),
        fail('update failed'),
      ],
    }));
    await expect(
      service.upsertTemplate(ADMIN, 'collab.invite', dto({ subject: 'Mới {{inviterName}}' })),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect((builder(mock, 'notification_template_versions').insert as jest.Mock).mock.calls.length).toBe(1);
    expect(callsFor(mock, 'admin_audit_log').length).toBe(0);
  });
});

describe('NotificationTemplatesService.deleteTemplate (UC-111)', () => {
  it('loại bắt buộc security.* → 403, không xoá', async () => {
    const { service, mock } = build({});
    await expect(
      service.deleteTemplate(ADMIN, 'security.google_connected'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(callsFor(mock, 'notification_templates').length).toBe(0);
  });

  it('loại bắt buộc billing.* → 403, không xoá', async () => {
    const { service, mock } = build({});
    await expect(
      service.deleteTemplate(ADMIN, 'billing.payment_success'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(callsFor(mock, 'notification_templates').length).toBe(0);
  });

  it('loại không bắt buộc, có mẫu → xoá + audit notification_template.delete', async () => {
    const { service, mock } = build({
      notification_templates: [ok(templateRow()), ok(null)],
      admin_audit_log: [ok(null)],
    });
    await expect(service.deleteTemplate(ADMIN, 'collab.invite')).resolves.toBeUndefined();
    expect(builder(mock, 'notification_templates').delete as jest.Mock).toHaveBeenCalledWith();
    // Xoá đúng dòng mẫu, không xoá nhầm dòng khác.
    expect(builder(mock, 'notification_templates').eq as jest.Mock).toHaveBeenCalledWith(
      'id',
      TEMPLATE_ID,
    );
    expect(builder(mock, 'admin_audit_log').insert as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'notification_template.delete' }),
    );
  });

  it('loại không có mẫu → 404', async () => {
    const { service, mock } = build({
      notification_templates: [ok(null)],
    });
    await expect(service.deleteTemplate(ADMIN, 'collab.invite')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(callsFor(mock, 'admin_audit_log').length).toBe(0);
  });

  it('lỗi xoá → 500, không audit', async () => {
    const { service, mock } = build({
      notification_templates: [ok(templateRow()), fail('delete failed')],
    });
    await expect(service.deleteTemplate(ADMIN, 'collab.invite')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(callsFor(mock, 'admin_audit_log').length).toBe(0);
  });

  it('lỗi audit khi xoá KHÔNG làm hỏng kết quả: vẫn coi như xoá xong', async () => {
    const { service } = build({
      notification_templates: [ok(templateRow()), ok(null)],
      admin_audit_log: [fail('audit failed')],
    });
    await expect(service.deleteTemplate(ADMIN, 'collab.invite')).resolves.toBeUndefined();
  });
});

describe('NotificationTemplatesService.preview', () => {
  it('trả về nội dung đã thay placeholder bằng giá trị ví dụ', async () => {
    const { service } = build();
    const result = await service.preview({
      type: 'collab.invite',
      subject: '{{inviterName}} mời bạn',
      bodyTemplate: 'Dự án {{projectName}}',
    });
    expect(result.subject).toContain('Lan');
    expect(result.body).toContain('Dự án mẫu');
  });

  it('không ghi gì vào DB', async () => {
    const { service, mock } = build();
    await service.preview({
      type: 'collab.invite',
      subject: '{{inviterName}} mời bạn',
      bodyTemplate: 'Dự án {{projectName}}',
    });
    expect(callsFor(mock, 'notification_templates').length).toBe(0);
    expect(callsFor(mock, 'admin_audit_log').length).toBe(0);
  });

  it('loại không có trong notification-types thì 404', async () => {
    const { service } = build();
    await expect(
      service.preview({
        type: 'khong.co.trong.danh.muc',
        subject: 'a',
        bodyTemplate: 'b',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('placeholder sai thì 400', async () => {
    const { service } = build();
    await expect(
      service.preview({
        type: 'collab.invite',
        subject: '{{khongTonTai}}',
        bodyTemplate: 'b',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
