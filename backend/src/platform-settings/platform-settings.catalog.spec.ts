import {
  BYTES_PER_MB,
  PLATFORM_SETTING_CATALOG,
  bytesToMb,
  mbToBytes,
  needsReductionConfirmation,
  validateChanges,
  validateSettingValue,
} from '@stave/shared-types';
import type { SettingDef } from '@stave/shared-types';

const MB = 1024 * 1024;

function def(key: string): SettingDef {
  const found = PLATFORM_SETTING_CATALOG.find((d) => d.key === key);
  if (!found) throw new Error(`catalog is missing ${key}`);
  return found;
}

const NUMERIC_DEFS = PLATFORM_SETTING_CATALOG.filter(
  (d) => d.type === 'number',
);

describe('PLATFORM_SETTING_CATALOG khớp bảng vu.md', () => {
  it('có đúng 5 khoá, không trùng', () => {
    const keys = PLATFORM_SETTING_CATALOG.map((d) => d.key);
    expect(keys).toEqual([
      'custom_sound_quota_bytes',
      'price_change_notice_days',
      'jam_edit_cooldown_sec',
      'registration_enabled',
      'moderation_retention_days',
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each([
    ['custom_sound_quota_bytes', 'limits', 5 * MB, 1024 * MB, 50 * MB, 'bytes'],
    ['price_change_notice_days', 'limits', 1, 60, 7, 'days'],
    ['jam_edit_cooldown_sec', 'community', 1, 3600, 5, 'seconds'],
    ['moderation_retention_days', 'retention', 7, 365, 30, 'days'],
  ])(
    '%s: nhóm %s, phạm vi %d–%d, mặc định %d, đơn vị %s',
    (key, group, min, max, dflt, unit) => {
      expect(def(key)).toMatchObject({
        key,
        group,
        type: 'number',
        min,
        max,
        default: dflt,
        unit,
      });
    },
  );

  it('registration_enabled là boolean mặc định bật, không có phạm vi', () => {
    const d = def('registration_enabled');
    expect(d).toMatchObject({
      group: 'registration',
      type: 'boolean',
      default: true,
    });
    expect(d.min).toBeUndefined();
    expect(d.max).toBeUndefined();
  });

  it('danh mục chỉ giữ khoá và thông số, không có chữ hiển thị', () => {
    for (const d of PLATFORM_SETTING_CATALOG) {
      expect(Object.keys(d)).not.toContain('label');
    }
  });

  it('mặc định của hạn mức bằng 50 MB (DEFAULT_QUOTA_BYTES trong custom-sounds, không export nên không import được)', () => {
    expect(def('custom_sound_quota_bytes').default).toBe(50 * 1024 * 1024);
  });
});

describe('validateSettingValue — biên của từng khoá số', () => {
  it.each(NUMERIC_DEFS.map((d) => [d.key, d] as const))(
    '%s: cận dưới và cận trên hợp lệ',
    (_key, d) => {
      expect(validateSettingValue(d, d.min as number)).toEqual({ ok: true });
      expect(validateSettingValue(d, d.max as number)).toEqual({ ok: true });
    },
  );

  it.each(NUMERIC_DEFS.map((d) => [d.key, d] as const))(
    '%s: dưới cận dưới 1 và trên cận trên 1 bị từ chối, kèm phạm vi',
    (_key, d) => {
      const expected = {
        ok: false,
        code: 'out_of_range',
        params: { min: d.min, max: d.max, unit: d.unit },
      };
      expect(validateSettingValue(d, (d.min as number) - 1)).toEqual(expected);
      expect(validateSettingValue(d, (d.max as number) + 1)).toEqual(expected);
    },
  );

  it('một giá trị ở giữa phạm vi hợp lệ', () => {
    expect(validateSettingValue(def('moderation_retention_days'), 30)).toEqual({
      ok: true,
    });
  });

  it('boolean đúng kiểu hợp lệ cả true lẫn false', () => {
    const d = def('registration_enabled');
    expect(validateSettingValue(d, true)).toEqual({ ok: true });
    expect(validateSettingValue(d, false)).toEqual({ ok: true });
  });
});

describe('validateSettingValue — sai kiểu', () => {
  const d = def('moderation_retention_days');

  it.each([
    ['không nguyên 7.5', 7.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['chuỗi "30"', '30'],
    ['null', null],
    ['undefined', undefined],
    ['đối tượng', {}],
    ['mảng', [30]],
    ['boolean true', true],
  ])('khoá số từ chối %s', (_name, value) => {
    const result = validateSettingValue(d, value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('not_integer');
      expect(result.params).toEqual({ min: 7, max: 365, unit: 'days' });
    }
  });

  it.each([
    ['số 1', 1],
    ['số 0', 0],
    ['chuỗi "true"', 'true'],
    ['null', null],
    ['undefined', undefined],
  ])('khoá boolean từ chối %s', (_name, value) => {
    expect(validateSettingValue(def('registration_enabled'), value)).toEqual({
      ok: false,
      code: 'not_boolean',
    });
  });
});

describe('validateChanges', () => {
  it('hợp lệ: trả lại danh sách nguyên vẹn, giữ thứ tự', () => {
    const input = [
      { key: 'registration_enabled', value: false },
      { key: 'price_change_notice_days', value: 14 },
    ];
    expect(validateChanges(input)).toEqual({ ok: true, changes: input });
  });

  it('khoá lạ bị từ chối', () => {
    expect(validateChanges([{ key: 'ranking_window_days', value: 7 }])).toEqual(
      {
        ok: false,
        errors: [{ key: 'ranking_window_days', code: 'unknown_key' }],
      },
    );
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'khoá đặc biệt của object %s coi là khoá lạ',
    (key) => {
      const result = validateChanges([{ key, value: 1 }]);
      expect(result).toEqual({
        ok: false,
        errors: [{ key, code: 'unknown_key' }],
      });
    },
  );

  it('khoá trùng trong cùng yêu cầu bị từ chối', () => {
    const result = validateChanges([
      { key: 'price_change_notice_days', value: 7 },
      { key: 'price_change_notice_days', value: 8 },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [{ key: 'price_change_notice_days', code: 'duplicate_key' }],
    });
  });

  it('mảng rỗng bị từ chối', () => {
    expect(validateChanges([])).toEqual({
      ok: false,
      errors: [{ key: '', code: 'empty_changes' }],
    });
  });

  it.each([
    ['không phải mảng', {}],
    ['null', null],
    ['undefined', undefined],
    ['chuỗi', 'abc'],
  ])('đầu vào %s bị từ chối như yêu cầu rỗng', (_name, input) => {
    expect(validateChanges(input)).toEqual({
      ok: false,
      errors: [{ key: '', code: 'empty_changes' }],
    });
  });

  it.each([
    ['phần tử null', [null]],
    ['phần tử là số', [5]],
    ['thiếu key', [{ value: 1 }]],
    ['key không phải chuỗi', [{ key: 7, value: 1 }]],
  ])('%s là mục không hợp lệ', (_name, input) => {
    const result = validateChanges(input);
    expect(result).toEqual({
      ok: false,
      errors: [{ key: '', code: 'invalid_entry' }],
    });
  });

  it('nhiều lỗi cùng lúc: trả đủ lỗi của từng khoá', () => {
    const result = validateChanges([
      { key: 'moderation_retention_days', value: 6 },
      { key: 'nope', value: 1 },
      { key: 'registration_enabled', value: 'yes' },
      { key: 'jam_edit_cooldown_sec', value: 5 },
      { key: 'price_change_notice_days', value: 2.5 },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          key: 'moderation_retention_days',
          code: 'out_of_range',
          params: { min: 7, max: 365, unit: 'days' },
        },
        { key: 'nope', code: 'unknown_key' },
        { key: 'registration_enabled', code: 'not_boolean' },
        {
          key: 'price_change_notice_days',
          code: 'not_integer',
          params: { min: 1, max: 60, unit: 'days' },
        },
      ],
    });
  });

  it('một khoá sai thì cả yêu cầu thất bại dù các khoá khác đúng', () => {
    const result = validateChanges([
      { key: 'jam_edit_cooldown_sec', value: 5 },
      { key: 'price_change_notice_days', value: 61 },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe('quy đổi MB ↔ byte', () => {
  it('1 MB = 1024 * 1024 byte (khớp DEFAULT_QUOTA_BYTES)', () => {
    expect(BYTES_PER_MB).toBe(1024 * 1024);
    expect(mbToBytes(50)).toBe(52_428_800);
  });

  it.each([
    [5, 5 * MB],
    [50, 50 * MB],
    [1024, 1024 * MB],
  ])('%d MB ↔ %d byte hai chiều khớp', (mb, bytes) => {
    expect(mbToBytes(mb)).toBe(bytes);
    expect(bytesToMb(bytes)).toBe(mb);
  });

  it('0,5 MB = 524288 byte', () => {
    expect(mbToBytes(0.5)).toBe(524_288);
    expect(bytesToMb(524_288)).toBe(0.5);
  });

  it('MB lẻ làm tròn về byte gần nhất (Math.round)', () => {
    expect(mbToBytes(0.3)).toBe(314_573);
    expect(mbToBytes(1.0000001)).toBe(MB + 0);
    expect(Number.isInteger(mbToBytes(12.345678))).toBe(true);
  });

  it('byte không chia hết cho MB cho ra số thực, không làm tròn', () => {
    expect(bytesToMb(MB + MB / 4)).toBe(1.25);
  });

  it('đầu vào không hữu hạn không bị che: NaN vẫn là NaN', () => {
    expect(Number.isNaN(mbToBytes(Number.NaN))).toBe(true);
    expect(Number.isNaN(bytesToMb(Number.NaN))).toBe(true);
  });
});

describe('needsReductionConfirmation', () => {
  const KEY = 'custom_sound_quota_bytes';

  it('nhỏ hơn mức dùng lớn nhất → cần xác nhận', () => {
    expect(needsReductionConfirmation(KEY, 10 * MB, 20 * MB)).toBe(true);
  });

  it('bằng mức dùng lớn nhất → không cần', () => {
    expect(needsReductionConfirmation(KEY, 20 * MB, 20 * MB)).toBe(false);
  });

  it('lớn hơn mức dùng lớn nhất → không cần', () => {
    expect(needsReductionConfirmation(KEY, 30 * MB, 20 * MB)).toBe(false);
  });

  it('mức dùng bằng 0 → không bao giờ cần', () => {
    expect(needsReductionConfirmation(KEY, 5 * MB, 0)).toBe(false);
  });

  it.each([
    'price_change_notice_days',
    'jam_edit_cooldown_sec',
    'moderation_retention_days',
    'registration_enabled',
    'khoa_la',
  ])('khoá %s luôn false dù giá trị nhỏ', (key) => {
    expect(needsReductionConfirmation(key, 1, 1_000_000)).toBe(false);
  });
});
