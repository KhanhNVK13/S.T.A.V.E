import {
  isWithinRetention,
  retainedUntil,
  splitSoundsToRemove,
  validateRemoveBody,
} from './moderation-removal.logic';

const HIDDEN_AT = '2026-11-01T00:00:00.000Z';
const DAY = 86_400_000;

describe('retainedUntil', () => {
  it('cộng đúng số ngày lưu giữ', () => {
    expect(retainedUntil(HIDDEN_AT, 30).toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
  });

  it('days = 0, âm, NaN, số thực -> dùng mặc định 30', () => {
    const expected = '2026-12-01T00:00:00.000Z';
    expect(retainedUntil(HIDDEN_AT, 0).toISOString()).toBe(expected);
    expect(retainedUntil(HIDDEN_AT, -5).toISOString()).toBe(expected);
    expect(retainedUntil(HIDDEN_AT, Number.NaN).toISOString()).toBe(expected);
    expect(retainedUntil(HIDDEN_AT, 7.5).toISOString()).toBe(expected);
  });
});

describe('isWithinRetention', () => {
  it('trước hạn -> true', () => {
    expect(isWithinRetention(new Date(HIDDEN_AT), HIDDEN_AT, 30)).toBe(true);
  });

  it('đúng thời điểm hết hạn -> true', () => {
    expect(
      isWithinRetention(
        new Date(Date.parse(HIDDEN_AT) + 30 * DAY),
        HIDDEN_AT,
        30,
      ),
    ).toBe(true);
  });

  it('quá hạn 1ms -> false', () => {
    expect(
      isWithinRetention(
        new Date(Date.parse(HIDDEN_AT) + 30 * DAY + 1),
        HIDDEN_AT,
        30,
      ),
    ).toBe(false);
  });

  it('days = 0 -> dùng 30 chứ không dùng 0', () => {
    expect(
      isWithinRetention(
        new Date(Date.parse(HIDDEN_AT) + 30 * DAY),
        HIDDEN_AT,
        0,
      ),
    ).toBe(true);
  });
});

describe('validateRemoveBody', () => {
  const soundId = '11111111-1111-4111-8111-111111111111';

  it('lý do 10 ký tự -> chấp nhận', () => {
    const result = validateRemoveBody({
      reason: 'x'.repeat(10),
      policy: 'copyright',
    });
    expect(result.ok).toBe(true);
    expect(result.body?.reason).toBe('x'.repeat(10));
  });

  it('lý do 9 ký tự -> từ chối', () => {
    const result = validateRemoveBody({
      reason: 'x'.repeat(9),
      policy: 'copyright',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('10');
  });

  it('lý do chỉ khoảng trắng rồi 1 chữ -> từ chối (trim trước khi đếm)', () => {
    const result = validateRemoveBody({
      reason: '          x',
      policy: 'copyright',
    });
    expect(result.ok).toBe(false);
  });

  it('lý do không phải chuỗi -> từ chối', () => {
    expect(validateRemoveBody({ reason: 42, policy: 'copyright' }).ok).toBe(
      false,
    );
  });

  it('policy lạ -> từ chối và nêu danh sách hợp lệ', () => {
    const result = validateRemoveBody({
      reason: 'x'.repeat(10),
      policy: 'nonsense',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('copyright');
  });

  it('policy thiếu -> từ chối', () => {
    expect(validateRemoveBody({ reason: 'x'.repeat(10) }).ok).toBe(false);
  });

  it('removeSoundIds: mã không phải UUID -> từ chối', () => {
    const result = validateRemoveBody({
      reason: 'x'.repeat(10),
      policy: 'copyright',
      removeSoundIds: ['not-a-uuid'],
    });
    expect(result.ok).toBe(false);
  });

  it('removeSoundIds: 51 phần tử -> từ chối', () => {
    const ids = Array.from(
      { length: 51 },
      (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    );
    const result = validateRemoveBody({
      reason: 'x'.repeat(10),
      policy: 'copyright',
      removeSoundIds: ids,
    });
    expect(result.ok).toBe(false);
  });

  it('removeSoundIds: trùng lặp -> được khử', () => {
    const result = validateRemoveBody({
      reason: 'x'.repeat(10),
      policy: 'copyright',
      removeSoundIds: [soundId, soundId],
    });
    expect(result.ok).toBe(true);
    expect(result.body?.removeSoundIds).toEqual([soundId]);
  });

  it('removeSoundIds không truyền -> mảng rỗng, vẫn hợp lệ', () => {
    const result = validateRemoveBody({
      reason: 'x'.repeat(10),
      policy: 'copyright',
    });
    expect(result.ok).toBe(true);
    expect(result.body?.removeSoundIds).toEqual([]);
  });

  it('body null -> từ chối', () => {
    expect(validateRemoveBody(null).ok).toBe(false);
  });
});

describe('splitSoundsToRemove', () => {
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';

  it('id không thuộc tập sound của chủ -> nằm trong rejected', () => {
    const result = splitSoundsToRemove([a, b], [a]);
    expect(result.accepted).toEqual([a]);
    expect(result.rejected).toEqual([b]);
  });

  it('tất cả hợp lệ -> rejected rỗng', () => {
    const result = splitSoundsToRemove([a, b], [a, b]);
    expect(result.accepted).toEqual([a, b]);
    expect(result.rejected).toEqual([]);
  });

  it('không yêu cầu gì -> accepted và rejected rỗng', () => {
    const result = splitSoundsToRemove([], [a]);
    expect(result).toEqual({ accepted: [], rejected: [] });
  });

  it('trùng lặp trong yêu cầu -> chỉ giữ một lần', () => {
    const result = splitSoundsToRemove([a, a], [a]);
    expect(result.accepted).toEqual([a]);
  });
});
