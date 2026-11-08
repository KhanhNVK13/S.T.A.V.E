import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { PlatformSettingsAdminController } from './platform-settings-admin.controller';
import type { PlatformSettingsAdminService } from './platform-settings-admin.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

describe('PlatformSettingsAdminController', () => {
  it('đường dẫn là admin/settings', () => {
    expect(Reflect.getMetadata('path', PlatformSettingsAdminController)).toBe(
      'admin/settings',
    );
  });

  it('có JwtAuthGuard, SessionAuthGuard và AdminGuard đúng thứ tự', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      PlatformSettingsAdminController,
    ) as unknown[];
    expect(guards).toEqual([JwtAuthGuard, SessionAuthGuard, AdminGuard]);
  });

  it('GET gọi getAll và PUT truyền id người gọi cùng body', async () => {
    const getAll = jest.fn().mockResolvedValue({ groups: [] });
    const update = jest.fn().mockResolvedValue({ updated: ['x'] });
    const service = {
      getAll,
      update,
    } as unknown as PlatformSettingsAdminService;
    const controller = new PlatformSettingsAdminController(service);
    const dto = plainToInstance(UpdateSettingsDto, {
      changes: [{ key: 'registration_enabled', value: false }],
    });

    await expect(controller.getAll()).resolves.toEqual({ groups: [] });
    await expect(
      controller.update(
        { user: { id: 'admin-1' } } as unknown as AuthenticatedRequest,
        dto,
      ),
    ).resolves.toEqual({ updated: ['x'] });
    expect(update).toHaveBeenCalledWith('admin-1', dto);
  });
});

describe('UpdateSettingsDto', () => {
  async function run(plain: Record<string, unknown>) {
    const dto = plainToInstance(UpdateSettingsDto, plain);
    const errors = await validate(dto, { whitelist: true });
    return { dto, errors };
  }

  it('giữ nguyên key, value (số và boolean) và confirmReduction sau whitelist', async () => {
    const { dto, errors } = await run({
      changes: [
        { key: 'jam_edit_cooldown_sec', value: 9 },
        { key: 'registration_enabled', value: false },
      ],
      confirmReduction: true,
    });

    expect(errors).toHaveLength(0);
    expect(dto.changes[0]).toMatchObject({
      key: 'jam_edit_cooldown_sec',
      value: 9,
    });
    expect(dto.changes[1].value).toBe(false);
    expect(dto.confirmReduction).toBe(true);
  });

  it('giá trị sai kiểu (chuỗi) vẫn qua DTO để service trả lỗi theo khoá', async () => {
    const { dto, errors } = await run({
      changes: [{ key: 'jam_edit_cooldown_sec', value: '9' }],
    });
    expect(errors).toHaveLength(0);
    expect(dto.changes[0].value).toBe('9');
  });

  it('xoá trường lạ trong từng mục', async () => {
    const { dto } = await run({
      changes: [{ key: 'a', value: 1, evil: 'x' }],
      extra: 1,
    });
    expect(dto.changes[0]).not.toHaveProperty('evil');
    expect(dto).not.toHaveProperty('extra');
  });

  it.each([
    ['changes không phải mảng', { changes: 'x' }],
    ['key không phải chuỗi', { changes: [{ key: 5, value: 1 }] }],
    ['thiếu value', { changes: [{ key: 'a' }] }],
    [
      'confirmReduction không phải boolean',
      { changes: [], confirmReduction: 'yes' },
    ],
    [
      'quá nhiều mục',
      { changes: Array.from({ length: 51 }, () => ({ key: 'a', value: 1 })) },
    ],
  ])('từ chối: %s', async (_name, plain) => {
    const { errors } = await run(plain);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('UpdateSettingsDto qua ValidationPipe thật (whitelist + transform như main.ts)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const meta = { type: 'body' as const, metatype: UpdateSettingsDto };

  it('không làm mất value (số và boolean) và confirmReduction', async () => {
    const result = (await pipe.transform(
      {
        changes: [
          { key: 'jam_edit_cooldown_sec', value: 9 },
          { key: 'registration_enabled', value: false },
        ],
        confirmReduction: true,
      },
      meta,
    )) as UpdateSettingsDto;

    expect(result).toBeInstanceOf(UpdateSettingsDto);
    expect(result.changes).toHaveLength(2);
    expect(result.changes[0].value).toBe(9);
    expect(typeof result.changes[0].value).toBe('number');
    expect(result.changes[1].value).toBe(false);
    expect(typeof result.changes[1].value).toBe('boolean');
    expect(result.confirmReduction).toBe(true);
  });

  it('value dạng chuỗi không bị ép kiểu ngầm (vẫn là chuỗi để service từ chối)', async () => {
    const result = (await pipe.transform(
      { changes: [{ key: 'jam_edit_cooldown_sec', value: '9' }] },
      meta,
    )) as UpdateSettingsDto;
    expect(result.changes[0].value).toBe('9');
  });

  it('xoá trường lạ nhưng vẫn từ chối thiếu value bằng 400', async () => {
    await expect(
      pipe.transform({ changes: [{ key: 'a' }] }, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
