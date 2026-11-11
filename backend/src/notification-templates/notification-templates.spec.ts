import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { NotificationTemplatesService } from './notification-templates.service';
import {
  findInvalidPlaceholders,
  findPlaceholders,
  renderPreview,
} from './notification-templates.logic';

const ADMIN = '11111111-1111-4111-8111-111111111111';

function build(
  rpc: Record<string, unknown> = {},
  tables: Record<string, { data?: unknown; error?: unknown }[]> = {},
) {
  const mock = createSupabaseMock([], { rpc: rpc as never, tables });
  return { mock, service: new NotificationTemplatesService(mock.client) };
}

describe('placeholder logic', () => {
  it('lấy placeholder có khoảng trắng và không trùng', () => {
    expect(findPlaceholders('{{ a }} và {{a}} và {{b_1}}')).toEqual([
      'a',
      'b_1',
    ]);
  });

  it('nêu đúng placeholder sai, cho phép placeholder hợp lệ', () => {
    expect(
      findInvalidPlaceholders('Hi {{userName}} {{secret}}', ['userName']),
    ).toEqual(['secret']);
  });

  it('dấu ngoặc kép thừa cũng bị coi là sai', () => {
    expect(findInvalidPlaceholders('Hi {{userName', ['userName'])).toEqual([
      '{{',
    ]);
  });

  it('xem trước thay giá trị ví dụ', () => {
    expect(
      renderPreview('Mời từ {{inviterName}}', '"{{projectName}}"', [
        'inviterName',
        'projectName',
      ]),
    ).toEqual({ subject: 'Mời từ Alex', body: '"Midnight Sketch"' });
  });
});

describe('NotificationTemplatesService', () => {
  it('list trả mọi loại, đánh dấu loại đã tuỳ chỉnh', async () => {
    const { service } = build(
      {},
      {
        notification_templates: [
          {
            data: [
              {
                type: 'collab.invite',
                name: 'Invite',
                subject: 'S',
                body_template: 'B {{projectName}}',
                updated_at: '2026-11-12T00:00:00Z',
              },
            ],
            error: null,
          },
        ],
      },
    );
    const items = await service.list();
    const invite = items.find((item) => item.type === 'collab.invite');
    expect(invite?.custom?.name).toBe('Invite');
    expect(
      items.find((item) => item.type === 'collab.invite_accepted')?.custom,
    ).toBeNull();
    expect(items.some((item) => item.mandatory)).toBe(true);
  });

  it('save từ chối placeholder lạ, nêu tên, không gọi RPC', async () => {
    const { service, mock } = build();
    const promise = service.save(ADMIN, 'collab.invite', {
      name: 'n',
      subject: 'Hi {{nope}}',
      body: 'b',
    });
    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toMatchObject({
      response: { code: 'UNKNOWN_PLACEHOLDER', placeholders: ['nope'] },
    });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('save loại không tồn tại thì 404', async () => {
    const { service } = build();
    await expect(
      service.save(ADMIN, 'nope.type', { name: 'n', subject: 's', body: 'b' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('save gọi một RPC với đúng tham số', async () => {
    const { service, mock } = build({
      admin_save_notification_template: {
        data: [{ o_created: true, o_template_id: 'x' }],
        error: null,
      },
    });
    await expect(
      service.save(ADMIN, 'collab.invite', {
        name: 'Invite',
        subject: 'Hi {{inviterName}}',
        body: '{{projectName}}',
      }),
    ).resolves.toEqual({ created: true });
    expect(mock.rpc).toHaveBeenCalledWith('admin_save_notification_template', {
      p_admin_id: ADMIN,
      p_type: 'collab.invite',
      p_name: 'Invite',
      p_subject: 'Hi {{inviterName}}',
      p_body: '{{projectName}}',
    });
  });

  it('loại bắt buộc sửa được nhưng không xoá được', async () => {
    const { service, mock } = build();
    await expect(
      service.remove(ADMIN, 'security.google_disconnected'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('xoá mẫu không có thì 404; có thì xong', async () => {
    const missing = build({
      admin_delete_notification_template: { data: false, error: null },
    });
    await expect(
      missing.service.remove(ADMIN, 'collab.invite'),
    ).rejects.toBeInstanceOf(NotFoundException);
    const ok = build({
      admin_delete_notification_template: { data: true, error: null },
    });
    await expect(
      ok.service.remove(ADMIN, 'collab.invite'),
    ).resolves.toBeUndefined();
  });

  it('preview kiểm placeholder rồi dựng chữ ví dụ', () => {
    const { service } = build();
    expect(
      service.preview({
        type: 'collab.invite',
        subject: 'Hi {{inviterName}}',
        body: '{{projectName}}',
      }),
    ).toEqual({ subject: 'Hi Alex', body: 'Midnight Sketch' });
    expect(() =>
      service.preview({ type: 'collab.invite', subject: '{{x}}', body: 'b' }),
    ).toThrow(BadRequestException);
  });
});
