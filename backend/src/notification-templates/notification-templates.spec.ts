import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import {
  NOTIFICATION_TEMPLATE_BODY_MAX_LENGTH,
  NOTIFICATION_TEMPLATE_NAME_MAX_LENGTH,
  NOTIFICATION_TEMPLATE_SUBJECT_MAX_LENGTH,
} from '@stave/shared-types';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { NotificationTemplatesService } from './notification-templates.service';
import { SaveTemplateDto } from './dto/template-text.dto';
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

  it('xem trước thay giá trị ví dụ', () => {
    expect(
      renderPreview('Mời từ {{inviterName}}', '"{{projectName}}"', [
        'inviterName',
        'projectName',
      ]),
    ).toEqual({ subject: 'Mời từ Alex', body: '"Midnight Sketch"' });
  });
});

describe('BE-NTT-05 findInvalidPlaceholders(text, allowed)', () => {
  it('UTCID01 chấp nhận văn bản chỉ dùng placeholder được phép', () => {
    expect(
      findInvalidPlaceholders('Hi {{userName}} {{ projectName }}', [
        'userName',
        'projectName',
      ]),
    ).toEqual([]);
  });

  it('UTCID02 nêu đúng placeholder sai, cho phép placeholder hợp lệ', () => {
    expect(
      findInvalidPlaceholders('Hi {{userName}} {{secret}}', ['userName']),
    ).toEqual(['secret']);
  });

  it('UTCID03 dấu ngoặc kép thừa cũng bị coi là sai', () => {
    expect(findInvalidPlaceholders('Hi {{userName', ['userName'])).toEqual([
      '{{',
    ]);
  });

  it('UTCID04 placeholder sai xuất hiện nhiều lần chỉ nêu một lần', () => {
    expect(
      findInvalidPlaceholders('{{x}} {{x}} {{ x }}', ['userName']),
    ).toEqual(['x']);
  });

  it('UTCID05 văn bản không có placeholder thì hợp lệ', () => {
    expect(findInvalidPlaceholders('Chào bạn', [])).toEqual([]);
  });
});

describe('BE-NTT-01 NotificationTemplatesService.list', () => {
  it('UTCID01 trả mọi loại, đánh dấu loại đã tuỳ chỉnh', async () => {
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

  it('UTCID02 mỗi loại có placeholder và lời mặc định để sửa', async () => {
    const { service } = build(
      {},
      { notification_templates: [{ data: [], error: null }] },
    );
    const items = await service.list();
    const invite = items.find((item) => item.type === 'collab.invite');
    expect(invite?.placeholders).toEqual(
      expect.arrayContaining(['inviterName', 'projectName']),
    );
    expect(invite?.defaultSubject).toBeTruthy();
    expect(invite?.defaultBody).toBeTruthy();
    expect(invite?.custom).toBeNull();
  });

  it('UTCID03 lỗi đọc mẫu thì 500', async () => {
    const { service } = build(
      {},
      {
        notification_templates: [{ data: null, error: { message: 'boom' } }],
      },
    );
    await expect(service.list()).rejects.toThrow(
      new InternalServerErrorException('Could not load templates'),
    );
  });
});

describe('BE-NTT-02 NotificationTemplatesService.preview', () => {
  it('UTCID01 kiểm placeholder rồi dựng chữ ví dụ', () => {
    const { service } = build();
    expect(
      service.preview({
        type: 'collab.invite',
        subject: 'Hi {{inviterName}}',
        body: '{{projectName}}',
      }),
    ).toEqual({ subject: 'Hi Alex', body: 'Midnight Sketch' });
  });

  it('UTCID02 placeholder lạ thì 400 nêu tên', () => {
    const { service } = build();
    expect(() =>
      service.preview({ type: 'collab.invite', subject: '{{x}}', body: 'b' }),
    ).toThrow(BadRequestException);
  });

  it('UTCID03 loại không tồn tại thì 404', () => {
    const { service } = build();
    expect(() =>
      service.preview({ type: 'nope.type', subject: 's', body: 'b' }),
    ).toThrow(NotFoundException);
  });
});

describe('BE-NTT-03 NotificationTemplatesService.save', () => {
  it('UTCID01 gọi một RPC với đúng tham số', async () => {
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

  it('UTCID02 từ chối placeholder lạ, nêu tên, không gọi RPC', async () => {
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

  it('UTCID03 loại không tồn tại thì 404', async () => {
    const { service } = build();
    await expect(
      service.save(ADMIN, 'nope.type', { name: 'n', subject: 's', body: 'b' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('UTCID04 sửa mẫu đã có trả created false', async () => {
    const { service } = build({
      admin_save_notification_template: {
        data: [{ o_created: false, o_template_id: 'x' }],
        error: null,
      },
    });
    await expect(
      service.save(ADMIN, 'collab.invite', {
        name: 'Invite',
        subject: 'Hi {{inviterName}}',
        body: '{{projectName}}',
      }),
    ).resolves.toEqual({ created: false });
  });

  it('UTCID05 lỗi RPC thì 500, không báo đã lưu', async () => {
    const { service } = build({
      admin_save_notification_template: {
        data: null,
        error: { message: 'boom' },
      },
    });
    await expect(
      service.save(ADMIN, 'collab.invite', {
        name: 'n',
        subject: 's',
        body: 'b',
      }),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not save the template'),
    );
  });

  it('UTCID06 RPC không trả dòng nào thì 500', async () => {
    const { service } = build({
      admin_save_notification_template: { data: [], error: null },
    });
    await expect(
      service.save(ADMIN, 'collab.invite', {
        name: 'n',
        subject: 's',
        body: 'b',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('UTCID07 loại bắt buộc vẫn sửa được lời', async () => {
    const { service } = build({
      admin_save_notification_template: {
        data: [{ o_created: true, o_template_id: 'x' }],
        error: null,
      },
    });
    await expect(
      service.save(ADMIN, 'security.google_disconnected', {
        name: 'Security',
        subject: 'Cảnh báo bảo mật',
        body: 'Tài khoản của bạn vừa được ngắt kết nối',
      }),
    ).resolves.toEqual({ created: true });
  });
});

describe('BE-NTT-04 NotificationTemplatesService.remove', () => {
  it('UTCID01 loại bắt buộc không xoá được', async () => {
    const { service, mock } = build();
    await expect(
      service.remove(ADMIN, 'security.google_disconnected'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('UTCID02 xoá mẫu không có thì 404', async () => {
    const missing = build({
      admin_delete_notification_template: { data: false, error: null },
    });
    await expect(
      missing.service.remove(ADMIN, 'collab.invite'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('UTCID03 xoá mẫu có thì xong và gọi RPC với admin và loại', async () => {
    const done = build({
      admin_delete_notification_template: { data: true, error: null },
    });
    await expect(
      done.service.remove(ADMIN, 'collab.invite'),
    ).resolves.toBeUndefined();
    expect(done.mock.rpc).toHaveBeenCalledWith(
      'admin_delete_notification_template',
      { p_admin_id: ADMIN, p_type: 'collab.invite' },
    );
  });

  it('UTCID04 loại không tồn tại thì 404', async () => {
    const { service, mock } = build();
    await expect(service.remove(ADMIN, 'nope.type')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('UTCID05 lỗi RPC thì 500', async () => {
    const { service } = build({
      admin_delete_notification_template: {
        data: null,
        error: { message: 'boom' },
      },
    });
    await expect(service.remove(ADMIN, 'collab.invite')).rejects.toThrow(
      new InternalServerErrorException('Could not delete the template'),
    );
  });
});

describe('BE-NTT-06 SaveTemplateDto validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const run = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: SaveTemplateDto });
  const valid = { name: 'Invite', subject: 'Hi', body: 'Welcome' };

  it('UTCID01 chấp nhận tên, tiêu đề và nội dung hợp lệ', async () => {
    await expect(run(valid)).resolves.toEqual(valid);
  });

  it('UTCID02 cắt khoảng trắng hai đầu', async () => {
    await expect(
      run({ name: '  Invite ', subject: ' Hi ', body: ' Welcome ' }),
    ).resolves.toEqual(valid);
  });

  it('UTCID03 từ chối tên trống', async () => {
    await expect(run({ ...valid, name: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('UTCID04 từ chối nội dung trống', async () => {
    await expect(run({ ...valid, body: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('UTCID05 từ chối tiêu đề trống', async () => {
    await expect(run({ ...valid, subject: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('UTCID06 từ chối tên, tiêu đề hoặc nội dung quá dài', async () => {
    await expect(
      run({
        ...valid,
        name: 'x'.repeat(NOTIFICATION_TEMPLATE_NAME_MAX_LENGTH + 1),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      run({
        ...valid,
        subject: 'x'.repeat(NOTIFICATION_TEMPLATE_SUBJECT_MAX_LENGTH + 1),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      run({
        ...valid,
        body: 'x'.repeat(NOTIFICATION_TEMPLATE_BODY_MAX_LENGTH + 1),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
