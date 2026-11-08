import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import type { QueryResult } from '../test-utils/supabase-mock';
import { PlatformSettingsAdminService } from './platform-settings-admin.service';
import type { PlatformSettingsService } from './platform-settings.service';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const MB = 1024 * 1024;
const QUOTA = 'custom_sound_quota_bytes';

interface Options {
  stored?: Array<{ key: string; value: unknown }>;
  readError?: boolean;
  upsert?: QueryResult;
  audit?: QueryResult;
  maxUsage?: QueryResult;
}

function makeService(options: Options = {}) {
  const mock = createSupabaseMock([], {
    tables: {
      platform_settings: [
        options.readError
          ? { data: null, error: { message: 'read failed' } }
          : { data: options.stored ?? [], error: null },
        options.upsert ?? { data: null, error: null },
      ],
      admin_audit_log: [options.audit ?? { data: null, error: null }],
    },
    rpc: {
      admin_custom_sound_max_usage: options.maxUsage ?? {
        data: 0,
        error: null,
      },
    },
  });
  const invalidate = jest.fn();
  const platformSettings = { invalidate } as unknown as PlatformSettingsService;
  const service = new PlatformSettingsAdminService(
    mock.client,
    platformSettings,
  );
  const settings = mock.builders.platform_settings;
  const audit = mock.builders.admin_audit_log;
  const from = jest.spyOn(mock.client, 'from');
  return { service, mock, invalidate, settings, audit, from };
}

function upsertRows(settings: Record<string, jest.Mock>) {
  return settings.upsert.mock.calls[0][0] as Array<{
    key: string;
    value: unknown;
  }>;
}

function auditRows(audit: Record<string, jest.Mock>) {
  return audit.insert.mock.calls[0][0] as Array<Record<string, unknown>>;
}

async function catchError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject');
}

let errorLog: jest.SpyInstance;

beforeEach(() => {
  errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PlatformSettingsAdminService.update — kiểm đầu vào', () => {
  it('khoá lạ → 400, không chạm DB', async () => {
    const { service, mock, from } = makeService();

    const error = await catchError(
      service.update(ADMIN_ID, {
        changes: [{ key: 'ranking_window_days', value: 3 }],
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      errors: [{ key: 'ranking_window_days', code: 'unknown_key' }],
    });
    expect(from).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('một khoá sai trong nhiều khoá → 400 và không khoá nào được ghi', async () => {
    const { service, settings, audit, invalidate, from } = makeService();

    const error = await catchError(
      service.update(ADMIN_ID, {
        changes: [
          { key: 'jam_edit_cooldown_sec', value: 10 },
          { key: 'moderation_retention_days', value: 3 },
        ],
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      errors: [
        {
          key: 'moderation_retention_days',
          code: 'out_of_range',
          params: { min: 7, max: 365, unit: 'days' },
        },
      ],
    });
    expect(from).not.toHaveBeenCalled();
    expect(settings.upsert).not.toHaveBeenCalled();
    expect(audit.insert).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('trả đủ lỗi của từng khoá', async () => {
    const { service } = makeService();

    const error = await catchError(
      service.update(ADMIN_ID, {
        changes: [
          { key: 'x', value: 1 },
          { key: 'registration_enabled', value: 'no' },
          { key: 'price_change_notice_days', value: 99 },
        ],
      }),
    );

    const body = (error as BadRequestException).getResponse() as {
      errors: Array<{ key: string; code: string }>;
    };
    expect(body.errors.map((e) => [e.key, e.code])).toEqual([
      ['x', 'unknown_key'],
      ['registration_enabled', 'not_boolean'],
      ['price_change_notice_days', 'out_of_range'],
    ]);
  });

  it('mảng rỗng → 400', async () => {
    const { service } = makeService();
    await expect(service.update(ADMIN_ID, { changes: [] })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('PlatformSettingsAdminService.update — hạn mức âm thanh', () => {
  it('giảm dưới mức dùng lớn nhất, thiếu xác nhận → 409 và không ghi', async () => {
    const { service, settings, audit, invalidate } = makeService({
      stored: [{ key: QUOTA, value: 50 * MB }],
      maxUsage: { data: 30 * MB, error: null },
    });

    const error = await catchError(
      service.update(ADMIN_ID, {
        changes: [{ key: QUOTA, value: 20 * MB }],
      }),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      requiresConfirmation: true,
      maxUsageBytes: 30 * MB,
    });
    expect(settings.upsert).not.toHaveBeenCalled();
    expect(audit.insert).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('có confirmReduction: true thì ghi', async () => {
    const { service, settings } = makeService({
      stored: [{ key: QUOTA, value: 50 * MB }],
      maxUsage: { data: 30 * MB, error: null },
    });

    await expect(
      service.update(ADMIN_ID, {
        changes: [{ key: QUOTA, value: 20 * MB }],
        confirmReduction: true,
      }),
    ).resolves.toEqual({ updated: [QUOTA] });

    expect(upsertRows(settings)).toEqual([{ key: QUOTA, value: 20 * MB }]);
  });

  it('giảm nhưng vẫn bằng mức dùng lớn nhất → không cần xác nhận', async () => {
    const { service } = makeService({
      stored: [{ key: QUOTA, value: 50 * MB }],
      maxUsage: { data: 30 * MB, error: null },
    });

    await expect(
      service.update(ADMIN_ID, {
        changes: [{ key: QUOTA, value: 30 * MB }],
      }),
    ).resolves.toEqual({ updated: [QUOTA] });
  });

  it('giảm nhưng vẫn lớn hơn mức dùng → không cần xác nhận', async () => {
    const { service } = makeService({
      stored: [{ key: QUOTA, value: 50 * MB }],
      maxUsage: { data: 10 * MB, error: null },
    });

    await expect(
      service.update(ADMIN_ID, {
        changes: [{ key: QUOTA, value: 40 * MB }],
      }),
    ).resolves.toEqual({ updated: [QUOTA] });
  });

  it('tăng hạn mức → không gọi RPC, không cần xác nhận dù nhỏ hơn mức dùng', async () => {
    const { service, mock } = makeService({
      stored: [{ key: QUOTA, value: 20 * MB }],
      maxUsage: { data: 900 * MB, error: null },
    });

    await expect(
      service.update(ADMIN_ID, {
        changes: [{ key: QUOTA, value: 30 * MB }],
      }),
    ).resolves.toEqual({ updated: [QUOTA] });

    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('hàng chưa có: so với mặc định 50 MB, giảm xuống 10 MB cũng bị chặn khi có người dùng nhiều hơn', async () => {
    const { service } = makeService({
      stored: [],
      maxUsage: { data: 40 * MB, error: null },
    });

    const error = await catchError(
      service.update(ADMIN_ID, {
        changes: [{ key: QUOTA, value: 10 * MB }],
      }),
    );

    expect(error).toBeInstanceOf(ConflictException);
  });

  it('RPC lỗi → 500, không cho giảm, không ghi, kể cả khi đã gửi confirmReduction', async () => {
    const { service, settings, audit, invalidate } = makeService({
      stored: [{ key: QUOTA, value: 50 * MB }],
      maxUsage: { data: null, error: { message: 'rpc missing' } },
    });

    await expect(
      service.update(ADMIN_ID, {
        changes: [{ key: QUOTA, value: 10 * MB }],
        confirmReduction: true,
      }),
    ).rejects.toThrow(InternalServerErrorException);

    expect(settings.upsert).not.toHaveBeenCalled();
    expect(audit.insert).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it('RPC trả bigint dạng chuỗi vẫn được ép số', async () => {
    const { service } = makeService({
      stored: [{ key: QUOTA, value: 50 * MB }],
      maxUsage: { data: String(30 * MB), error: null },
    });

    const error = await catchError(
      service.update(ADMIN_ID, {
        changes: [{ key: QUOTA, value: 20 * MB }],
      }),
    );

    expect((error as ConflictException).getResponse()).toMatchObject({
      maxUsageBytes: 30 * MB,
    });
  });

  it('RPC trả giá trị không phải số → 500, không ghi', async () => {
    const { service, settings } = makeService({
      stored: [{ key: QUOTA, value: 50 * MB }],
      maxUsage: { data: 'abc', error: null },
    });

    await expect(
      service.update(ADMIN_ID, {
        changes: [{ key: QUOTA, value: 20 * MB }],
      }),
    ).rejects.toThrow(InternalServerErrorException);
    expect(settings.upsert).not.toHaveBeenCalled();
  });

  it('confirmReduction thừa khi không giảm thì bị bỏ qua', async () => {
    const { service, mock } = makeService({
      stored: [{ key: QUOTA, value: 20 * MB }],
    });

    await expect(
      service.update(ADMIN_ID, {
        changes: [{ key: QUOTA, value: 30 * MB }],
        confirmReduction: true,
      }),
    ).resolves.toEqual({ updated: [QUOTA] });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe('PlatformSettingsAdminService.update — ghi, cache, audit', () => {
  it('upsert một lệnh duy nhất, theo khoá, value đúng kiểu jsonb (số/boolean, không chuỗi)', async () => {
    const { service, settings } = makeService({
      stored: [
        { key: 'price_change_notice_days', value: 7 },
        { key: 'registration_enabled', value: true },
      ],
    });

    await service.update(ADMIN_ID, {
      changes: [
        { key: 'price_change_notice_days', value: 14 },
        { key: 'registration_enabled', value: false },
      ],
    });

    expect(settings.upsert).toHaveBeenCalledTimes(1);
    expect(settings.upsert.mock.calls[0][1]).toEqual({ onConflict: 'key' });
    const rows = upsertRows(settings);
    expect(rows).toEqual([
      { key: 'price_change_notice_days', value: 14 },
      { key: 'registration_enabled', value: false },
    ]);
    expect(typeof rows[0].value).toBe('number');
    expect(typeof rows[1].value).toBe('boolean');
  });

  it('chỉ gửi key và value cho bảng (chưa biết cột updated_at/updated_by)', async () => {
    const { service, settings } = makeService();

    await service.update(ADMIN_ID, {
      changes: [{ key: 'jam_edit_cooldown_sec', value: 9 }],
    });

    expect(Object.keys(upsertRows(settings)[0]).sort()).toEqual([
      'key',
      'value',
    ]);
  });

  it('ghi xong mới invalidate, đúng các khoá đã đổi', async () => {
    const { service, settings, invalidate } = makeService({
      stored: [{ key: 'jam_edit_cooldown_sec', value: 5 }],
    });

    await service.update(ADMIN_ID, {
      changes: [
        { key: 'jam_edit_cooldown_sec', value: 6 },
        { key: 'registration_enabled', value: false },
      ],
    });

    expect(invalidate.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      'jam_edit_cooldown_sec',
      'registration_enabled',
    ]);
    const upsertOrder = settings.upsert.mock.invocationCallOrder[0];
    for (const order of invalidate.mock.invocationCallOrder) {
      expect(order).toBeGreaterThan(upsertOrder);
    }
  });

  it('audit đúng một dòng mỗi khoá, reason "<key>: <cũ> -> <mới>"', async () => {
    const { service, audit } = makeService({
      stored: [
        { key: 'price_change_notice_days', value: 7 },
        { key: 'registration_enabled', value: true },
      ],
    });

    await service.update(ADMIN_ID, {
      changes: [
        { key: 'price_change_notice_days', value: 14 },
        { key: 'registration_enabled', value: false },
      ],
    });

    expect(audit.insert).toHaveBeenCalledTimes(1);
    expect(auditRows(audit)).toEqual([
      {
        admin_id: ADMIN_ID,
        action: 'settings.update',
        target_type: 'platform_setting',
        target_id: null,
        reason: 'price_change_notice_days: 7 -> 14',
      },
      {
        admin_id: ADMIN_ID,
        action: 'settings.update',
        target_type: 'platform_setting',
        target_id: null,
        reason: 'registration_enabled: true -> false',
      },
    ]);
  });

  it('hàng chưa có: giá trị cũ trong audit là mặc định của danh mục', async () => {
    const { service, audit } = makeService({ stored: [] });

    await service.update(ADMIN_ID, {
      changes: [{ key: 'moderation_retention_days', value: 60 }],
    });

    expect(auditRows(audit)[0].reason).toBe(
      'moderation_retention_days: 30 -> 60',
    );
  });

  it('trả updated theo thứ tự yêu cầu', async () => {
    const { service } = makeService();

    await expect(
      service.update(ADMIN_ID, {
        changes: [
          { key: 'registration_enabled', value: false },
          { key: 'jam_edit_cooldown_sec', value: 9 },
        ],
      }),
    ).resolves.toEqual({
      updated: ['registration_enabled', 'jam_edit_cooldown_sec'],
    });
  });

  it('ghi lỗi → 500, không invalidate, không audit', async () => {
    const { service, invalidate, audit } = makeService({
      upsert: { data: null, error: { message: 'boom' } },
    });

    await expect(
      service.update(ADMIN_ID, {
        changes: [{ key: 'jam_edit_cooldown_sec', value: 9 }],
      }),
    ).rejects.toThrow(InternalServerErrorException);

    expect(invalidate).not.toHaveBeenCalled();
    expect(audit.insert).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it('đọc giá trị cũ lỗi → 500, không ghi', async () => {
    const { service, settings } = makeService({ readError: true });

    await expect(
      service.update(ADMIN_ID, {
        changes: [{ key: 'jam_edit_cooldown_sec', value: 9 }],
      }),
    ).rejects.toThrow(InternalServerErrorException);
    expect(settings.upsert).not.toHaveBeenCalled();
  });

  it('audit lỗi sau khi đã lưu: log mức error, vẫn trả 200 và đã invalidate', async () => {
    const { service, invalidate } = makeService({
      audit: { data: null, error: { message: 'audit down' } },
    });

    await expect(
      service.update(ADMIN_ID, {
        changes: [{ key: 'jam_edit_cooldown_sec', value: 9 }],
      }),
    ).resolves.toEqual({ updated: ['jam_edit_cooldown_sec'] });

    expect(invalidate).toHaveBeenCalledWith('jam_edit_cooldown_sec');
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('jam_edit_cooldown_sec'),
    );
  });
});

describe('PlatformSettingsAdminService.update — giá trị không đổi', () => {
  it('toàn bộ không đổi → không ghi, không audit, không invalidate, updated rỗng', async () => {
    const { service, settings, audit, invalidate, mock } = makeService({
      stored: [
        { key: 'price_change_notice_days', value: 7 },
        { key: 'registration_enabled', value: true },
        { key: QUOTA, value: 50 * MB },
      ],
    });

    await expect(
      service.update(ADMIN_ID, {
        changes: [
          { key: 'price_change_notice_days', value: 7 },
          { key: 'registration_enabled', value: true },
          { key: QUOTA, value: 50 * MB },
        ],
      }),
    ).resolves.toEqual({ updated: [] });

    expect(settings.upsert).not.toHaveBeenCalled();
    expect(audit.insert).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('lẫn đổi và không đổi: chỉ khoá đã đổi được ghi, invalidate và audit', async () => {
    const { service, settings, audit, invalidate } = makeService({
      stored: [
        { key: 'price_change_notice_days', value: 7 },
        { key: 'jam_edit_cooldown_sec', value: 5 },
      ],
    });

    await expect(
      service.update(ADMIN_ID, {
        changes: [
          { key: 'price_change_notice_days', value: 7 },
          { key: 'jam_edit_cooldown_sec', value: 8 },
        ],
      }),
    ).resolves.toEqual({ updated: ['jam_edit_cooldown_sec'] });

    expect(upsertRows(settings)).toEqual([
      { key: 'jam_edit_cooldown_sec', value: 8 },
    ]);
    expect(auditRows(audit)).toHaveLength(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('hàng chưa có và giá trị mới bằng mặc định → coi là không đổi', async () => {
    const { service, settings } = makeService({ stored: [] });

    await expect(
      service.update(ADMIN_ID, {
        changes: [{ key: 'registration_enabled', value: true }],
      }),
    ).resolves.toEqual({ updated: [] });
    expect(settings.upsert).not.toHaveBeenCalled();
  });

  it('dòng cũ lưu dạng chuỗi "false" thì ghi lại thành boolean', async () => {
    const { service, settings } = makeService({
      stored: [{ key: 'registration_enabled', value: 'false' }],
    });

    await expect(
      service.update(ADMIN_ID, {
        changes: [{ key: 'registration_enabled', value: false }],
      }),
    ).resolves.toEqual({ updated: ['registration_enabled'] });
    expect(upsertRows(settings)).toEqual([
      { key: 'registration_enabled', value: false },
    ]);
  });

  it('khoá sai vẫn bị 400 dù các khoá còn lại không đổi', async () => {
    const { service } = makeService({
      stored: [{ key: 'price_change_notice_days', value: 7 }],
    });

    await expect(
      service.update(ADMIN_ID, {
        changes: [
          { key: 'price_change_notice_days', value: 7 },
          { key: 'jam_edit_cooldown_sec', value: 0 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('PlatformSettingsAdminService.getAll', () => {
  it('hàng chưa có → giá trị mặc định của danh mục; nhóm theo thứ tự danh mục', async () => {
    const { service } = makeService({ stored: [] });

    const result = await service.getAll();

    expect(result.groups.map((g) => g.group)).toEqual([
      'limits',
      'community',
      'registration',
      'retention',
    ]);
    const flat = result.groups.flatMap((g) => g.items);
    expect(flat.map((i) => [i.key, i.value])).toEqual([
      [QUOTA, 50 * MB],
      ['price_change_notice_days', 7],
      ['jam_edit_cooldown_sec', 5],
      ['registration_enabled', true],
      ['moderation_retention_days', 30],
    ]);
    expect(result.groups[0].items).toHaveLength(2);
  });

  it('trả giá trị đang lưu và thông số của danh mục', async () => {
    const { service } = makeService({
      stored: [{ key: 'moderation_retention_days', value: 90 }],
    });

    const result = await service.getAll();
    const item = result.groups
      .flatMap((g) => g.items)
      .find((i) => i.key === 'moderation_retention_days');

    expect(item).toMatchObject({
      value: 90,
      min: 7,
      max: 365,
      unit: 'days',
      type: 'number',
    });
  });

  it('không trả khoá ngoài danh mục dù có trong bảng', async () => {
    const { service } = makeService({
      stored: [
        { key: 'ranking_weight_play', value: 1 },
        { key: 'ranking_window_days', value: 7 },
        { key: 'price_change_notice_days', value: 9 },
      ],
    });

    const keys = (await service.getAll()).groups.flatMap((g) =>
      g.items.map((i) => i.key),
    );

    expect(keys).not.toContain('ranking_weight_play');
    expect(keys).not.toContain('ranking_window_days');
    expect(keys).toHaveLength(5);
  });

  it('chỉ truy vấn các khoá của danh mục', async () => {
    const { service, settings } = makeService({ stored: [] });

    await service.getAll();

    expect(settings.in).toHaveBeenCalledWith('key', [
      QUOTA,
      'price_change_notice_days',
      'jam_edit_cooldown_sec',
      'registration_enabled',
      'moderation_retention_days',
    ]);
  });

  it('giá trị sai kiểu → mặc định; chuỗi số và "false" được hiểu như nơi đọc thật', async () => {
    const { service } = makeService({
      stored: [
        { key: QUOTA, value: '20971520' },
        { key: 'price_change_notice_days', value: 'abc' },
        { key: 'jam_edit_cooldown_sec', value: null },
        { key: 'registration_enabled', value: 'false' },
        { key: 'moderation_retention_days', value: true },
      ],
    });

    const flat = (await service.getAll()).groups.flatMap((g) => g.items);
    const byKey = Object.fromEntries(flat.map((i) => [i.key, i.value]));

    expect(byKey).toEqual({
      [QUOTA]: 20_971_520,
      price_change_notice_days: 7,
      jam_edit_cooldown_sec: 5,
      registration_enabled: false,
      moderation_retention_days: 30,
    });
  });

  it('đọc lỗi → 500 (không giả làm mặc định)', async () => {
    const { service } = makeService({ readError: true });

    await expect(service.getAll()).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(errorLog).toHaveBeenCalled();
  });
});
