import 'reflect-metadata';
import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import { CustomThemesService } from './custom-themes.service';
import type { SubscriptionsService } from '../billing/subscriptions.service';
import type { Palette } from '@stave/shared-types';

const userId = '11111111-1111-4111-8111-111111111111';
const themeId = '22222222-2222-4222-8222-222222222222';

const validPalette: Palette = {
  '--background': 'oklch(0.14 0.022 275)',
  '--surface': 'oklch(0.19 0.03 275)',
  '--surface-subtle': 'oklch(0.23 0.035 275)',
  '--surface-muted': 'oklch(0.25 0.04 275)',
  '--foreground': 'oklch(0.95 0.012 275)',
  '--muted-foreground': 'oklch(0.83 0.03 275)',
  '--border': 'oklch(0.34 0.04 275)',
  '--border-strong': 'oklch(0.54 0.05 275)',
  '--metal': 'oklch(0.82 0.07 82)',
  '--metal-muted': 'oklch(0.24 0.03 82)',
};

function makeService(
  tables: SupabaseMockOptions['tables'] = {},
  hasPaidAccess = true,
) {
  const mock = createSupabaseMock([], { tables });
  const subscriptions = {
    getEffective: jest.fn().mockResolvedValue({ hasPaidAccess }),
  } as unknown as SubscriptionsService;
  const service = new CustomThemesService(mock.client, subscriptions);
  return { service, ...mock, subscriptions };
}

describe('BE-THM-01 CustomThemesService.saveCustomTheme', () => {
  it('UTCID01 upsert dòng themes custom và trỏ active_theme_id', async () => {
    const { service, builders } = makeService({
      themes: [{ data: { id: themeId } }, { data: { id: themeId } }],
      users: [{ data: null, error: null }],
    });

    await expect(
      service.saveCustomTheme(userId, validPalette),
    ).resolves.toEqual({ type: 'custom', palette: validPalette });

    expect(builders.themes.update).toHaveBeenCalledWith({
      generated_palette: validPalette,
    });
    expect(builders.users.update).toHaveBeenCalledWith({
      active_theme_id: themeId,
    });
  });

  it('UTCID02 chặn tài khoản gói miễn phí bằng 403', async () => {
    const { service } = makeService({}, false);

    await expect(service.saveCustomTheme(userId, validPalette)).rejects.toThrow(
      new ForbiddenException('Paid access required'),
    );
  });

  it('UTCID03 ném 500 khi đọc dòng themes lỗi (không nuốt error)', async () => {
    const { service } = makeService({
      themes: [{ error: 'rls denied', data: null }],
    });

    await expect(service.saveCustomTheme(userId, validPalette)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('UTCID04 không ghi gì khi không có quyền', async () => {
    const { service, builders } = makeService({ themes: [], users: [] }, false);

    await expect(service.saveCustomTheme(userId, validPalette)).rejects.toThrow(
      ForbiddenException,
    );

    expect(builders.themes.insert).not.toHaveBeenCalled();
    expect(builders.themes.update).not.toHaveBeenCalled();
    expect(builders.users.update).not.toHaveBeenCalled();
  });
});

describe('BE-THM-02 CustomThemesService.getEffectiveTheme', () => {
  it('UTCID05 ném 500 khi đọc bảng users lỗi (không nuốt error)', async () => {
    const { service } = makeService({
      users: [{ error: 'rls denied', data: null }],
    });

    await expect(service.getEffectiveTheme(userId)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('UTCID07 trả null khi user chưa chọn theme', async () => {
    const { service } = makeService({
      users: [{ data: { active_theme_id: null } }],
      themes: [{ data: null }],
    });

    await expect(service.getEffectiveTheme(userId)).resolves.toEqual({
      type: null,
      presetKey: null,
      palette: null,
      hasPaidAccess: true,
      hasSavedCustom: false,
    });
  });

  it('UTCID08 trả presetKey khi theme hiện hành là preset', async () => {
    const { service } = makeService({
      users: [{ data: { active_theme_id: themeId } }],
      themes: [
        {
          data: {
            id: themeId,
            user_id: userId,
            type: 'preset',
            preset_key: 'space',
            generated_palette: null,
            created_at: '2026-11-01T00:00:00.000Z',
          },
        },
        { data: { id: 'saved-custom' } },
      ],
    });

    await expect(service.getEffectiveTheme(userId)).resolves.toEqual({
      type: 'preset',
      presetKey: 'space',
      palette: null,
      hasPaidAccess: true,
      hasSavedCustom: true,
    });
  });

  it('UTCID09 trả palette khi theme hiện hành là custom', async () => {
    const { service } = makeService({
      users: [{ data: { active_theme_id: themeId } }],
      themes: [
        {
          data: {
            id: themeId,
            user_id: userId,
            type: 'custom',
            preset_key: null,
            generated_palette: validPalette,
            created_at: '2026-11-01T00:00:00.000Z',
          },
        },
      ],
    });

    await expect(service.getEffectiveTheme(userId)).resolves.toEqual({
      type: 'custom',
      presetKey: null,
      palette: validPalette,
      hasPaidAccess: true,
      hasSavedCustom: true,
    });
  });

  it('UTCID10 hết quyền vẫn trả palette và KHÔNG xoá dữ liệu', async () => {
    const { service, builders } = makeService(
      {
        users: [{ data: { active_theme_id: themeId } }],
        themes: [
          {
            data: {
              id: themeId,
              user_id: userId,
              type: 'custom',
              preset_key: null,
              generated_palette: validPalette,
              created_at: '2026-11-01T00:00:00.000Z',
            },
          },
        ],
      },
      false,
    );

    await expect(service.getEffectiveTheme(userId)).resolves.toEqual({
      type: 'custom',
      presetKey: null,
      palette: validPalette,
      hasPaidAccess: false,
      hasSavedCustom: true,
    });

    expect(builders.themes.update).not.toHaveBeenCalled();
    expect(builders.themes.delete).not.toHaveBeenCalled();
  });
});

describe('BE-THM-02b hasSavedCustom', () => {
  it('UTCID16 vẫn trả theme khi đọc dòng custom lỗi (cờ phụ tụt về false)', async () => {
    const { service } = makeService({
      users: [{ data: { active_theme_id: null } }],
      themes: [{ error: 'boom', data: null }],
    });

    await expect(service.getEffectiveTheme(userId)).resolves.toEqual({
      type: null,
      presetKey: null,
      palette: null,
      hasPaidAccess: true,
      hasSavedCustom: false,
    });
  });
});

describe('BE-THM-03 CustomThemesService.activateSavedCustomTheme', () => {
  it('UTCID11 trỏ active_theme_id về dòng custom đã lưu, không ghi palette', async () => {
    const { service, builders } = makeService({
      themes: [{ data: { id: themeId, generated_palette: validPalette } }],
      users: [{ data: null, error: null }],
    });

    await expect(service.activateSavedCustomTheme(userId)).resolves.toEqual({
      type: 'custom',
      palette: validPalette,
    });
    expect(builders.users.update).toHaveBeenCalledWith({
      active_theme_id: themeId,
    });
    expect(builders.themes.update).not.toHaveBeenCalled();
    expect(builders.themes.insert).not.toHaveBeenCalled();
  });

  it('UTCID12 chặn gói miễn phí bằng 403 và không ghi gì', async () => {
    const { service, builders } = makeService({}, false);

    await expect(service.activateSavedCustomTheme(userId)).rejects.toThrow(
      ForbiddenException,
    );
    expect(builders.users?.update).toBeUndefined();
  });

  it('UTCID13 trả 404 khi chưa lưu theme từ ảnh', async () => {
    const { service, builders } = makeService({
      themes: [{ data: null }],
    });

    await expect(service.activateSavedCustomTheme(userId)).rejects.toThrow(
      NotFoundException,
    );
    expect(builders.users?.update).toBeUndefined();
  });

  it('UTCID14 ném 500 khi đọc themes lỗi (không nuốt error)', async () => {
    const { service } = makeService({
      themes: [{ error: 'rls denied', data: null }],
    });

    await expect(service.activateSavedCustomTheme(userId)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('UTCID15 ném 500 khi trỏ active_theme_id lỗi', async () => {
    const { service } = makeService({
      themes: [{ data: { id: themeId, generated_palette: validPalette } }],
      users: [{ error: 'fail', data: null }],
    });

    await expect(service.activateSavedCustomTheme(userId)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('UTCID17 trả 404 và không ghi gì khi palette đã lưu không hợp lệ', async () => {
    const { service, builders } = makeService({
      themes: [
        { data: { id: themeId, generated_palette: { '--background': 'red' } } },
      ],
    });

    await expect(service.activateSavedCustomTheme(userId)).rejects.toThrow(
      NotFoundException,
    );
    expect(builders.users?.update).toBeUndefined();
  });
});
