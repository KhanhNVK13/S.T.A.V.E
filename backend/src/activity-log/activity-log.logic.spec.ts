import { BadRequestException } from '@nestjs/common';
import {
  decodeCursor,
  encodeCursor,
  maskIp,
  parseActivityQuery,
  prefixesForType,
} from './activity-log.logic';

const UUID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-06T10:00:00.000Z');

describe('maskIp', () => {
  it('che octet cuối của IPv4', () => {
    expect(maskIp('203.0.113.45')).toBe('203.0.113.*');
  });

  it('bỏ cổng của IPv4', () => {
    expect(maskIp('203.0.113.45:51234')).toBe('203.0.113.*');
  });

  it('xử lý IPv4-mapped như IPv4', () => {
    expect(maskIp('::ffff:203.0.113.45')).toBe('203.0.113.*');
    expect(maskIp('::FFFF:203.0.113.45')).toBe('203.0.113.*');
  });

  it('xử lý IPv4-mapped dạng thập lục như IPv4', () => {
    expect(maskIp('::ffff:cb00:712d')).toBe('203.0.113.*');
  });

  it('giữ 3 nhóm đầu của IPv6 đầy đủ', () => {
    expect(maskIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe(
      '2001:db8:85a3::*',
    );
  });

  it('bỏ cổng và ngoặc của IPv6 dạng [v6]:cổng', () => {
    const masked = maskIp('[2001:db8::1]:443');
    expect(masked).toBe('2001:db8:0::*');
    expect(masked).not.toContain('443');
    expect(masked).not.toContain('[');
  });

  it('nhận IPv6 trong ngoặc không cổng', () => {
    expect(maskIp('[2001:db8:1:2:3:4:5:6]')).toBe('2001:db8:1::*');
  });

  it('bỏ zone id của IPv6', () => {
    expect(maskIp('fe80::1%eth0')).toBe('fe80:0:0::*');
  });

  it('quyết định: IPv6 rút gọn ::1 được mở rộng rồi che nhất quán', () => {
    expect(maskIp('::1')).toBe('0:0:0::*');
  });

  it('không bao giờ để lộ nhóm cuối của IPv6', () => {
    expect(maskIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).not.toContain(
      '7348',
    );
  });

  it.each([
    '',
    '   ',
    'abc',
    '999.1.1.1',
    '1.2.3',
    '1.2.3.4.5',
    '::g',
    'a.b.c.d',
  ])('trả null cho giá trị không hợp lệ %p', (value) => {
    expect(maskIp(value)).toBeNull();
  });

  it('trả null cho null và undefined', () => {
    expect(maskIp(null)).toBeNull();
    expect(maskIp(undefined)).toBeNull();
  });
});

describe('maskIp — hậu tố CIDR', () => {
  it('bỏ hậu tố /32 của IPv4 (kiểu inet ép sang text)', () => {
    expect(maskIp('203.0.113.45/32')).toBe('203.0.113.*');
  });

  it('chấp nhận hậu tố mạng khác của IPv4 và vẫn che octet cuối', () => {
    expect(maskIp('203.0.113.0/24')).toBe('203.0.113.*');
  });

  it('bỏ hậu tố /128 của IPv6', () => {
    expect(maskIp('2001:db8:85a3:8d3:1319:8a2e:370:7348/128')).toBe(
      '2001:db8:85a3::*',
    );
    expect(maskIp('::1/128')).toBe('0:0:0::*');
  });

  it('bỏ hậu tố của IPv4-mapped', () => {
    expect(maskIp('::ffff:203.0.113.45/128')).toBe('203.0.113.*');
  });

  it('không để lộ octet cuối khi có hậu tố', () => {
    expect(maskIp('203.0.113.45/32')).not.toContain('45');
  });

  it.each([
    '203.0.113.45/33',
    '203.0.113.45/',
    '203.0.113.45/-1',
    '203.0.113.45/abc',
    '203.0.113.45/32/32',
    '2001:db8::1/129',
    '/32',
    'abc/32',
  ])('trả null cho hậu tố không hợp lệ %p', (value) => {
    expect(maskIp(value)).toBeNull();
  });
});

describe('maskIp — cổng', () => {
  it.each([
    ['203.0.113.45:0', '203.0.113.*'],
    ['203.0.113.45:80', '203.0.113.*'],
    ['203.0.113.45:65535', '203.0.113.*'],
    ['[2001:db8::1]:0', '2001:db8:0::*'],
    ['[2001:db8::1]:65535', '2001:db8:0::*'],
  ])('nhận cổng trong 0–65535: %p', (value, expected) => {
    expect(maskIp(value)).toBe(expected);
  });

  it.each([
    '203.0.113.45:65536',
    '203.0.113.45:99999',
    '203.0.113.45:123456',
    '203.0.113.45:',
    '[2001:db8::1]:65536',
    '[2001:db8::1]:999999',
  ])('trả null cho cổng ngoài phạm vi hoặc rỗng %p', (value) => {
    expect(maskIp(value)).toBeNull();
  });
});

describe('prefixesForType', () => {
  it('ánh xạ từng loại sang đúng tiền tố', () => {
    expect(prefixesForType('signin')).toEqual(['auth.']);
    expect(prefixesForType('projects')).toEqual(['project.']);
    expect(prefixesForType('subscription')).toEqual(['subscription.']);
    expect(prefixesForType('community')).toEqual(['community.']);
  });

  it('trả null (tất cả) khi không chọn loại', () => {
    expect(prefixesForType(undefined)).toBeNull();
  });
});

describe('cursor', () => {
  it('khứ hồi giữ nguyên chuỗi có micro giây', () => {
    const createdAt = '2026-10-20T13:45:12.123456+00:00';
    const decoded = decodeCursor(encodeCursor({ createdAt, id: UUID }));
    expect(decoded).toEqual({ createdAt, id: UUID });
    expect(decoded.createdAt).toBe(createdAt);
  });

  it('khứ hồi giữ nguyên chuỗi dạng Z và không có phần giây lẻ', () => {
    const createdAt = '2026-10-20T13:45:12Z';
    expect(decodeCursor(encodeCursor({ createdAt, id: UUID })).createdAt).toBe(
      createdAt,
    );
  });

  it('hai thời điểm chỉ khác micro giây cho hai con trỏ khác nhau', () => {
    const a = encodeCursor({
      createdAt: '2026-10-20T13:45:12.123456+00:00',
      id: UUID,
    });
    const b = encodeCursor({
      createdAt: '2026-10-20T13:45:12.123457+00:00',
      id: UUID,
    });
    expect(a).not.toBe(b);
  });

  it('chuỗi rác (không phải base64url/JSON) bị từ chối', () => {
    expect(() => decodeCursor('###rác###')).toThrow(BadRequestException);
    expect(() => decodeCursor('')).toThrow(BadRequestException);
    expect(() => decodeCursor('abc')).toThrow(BadRequestException);
  });

  it('JSON sai hình dạng bị từ chối', () => {
    const wrap = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    expect(() => decodeCursor(wrap([1, 2]))).toThrow(BadRequestException);
    expect(() => decodeCursor(wrap({ createdAt: 1, id: UUID }))).toThrow(
      BadRequestException,
    );
    expect(() =>
      decodeCursor(wrap({ createdAt: '2026-10-20T13:45:12Z' })),
    ).toThrow(BadRequestException);
    expect(() => decodeCursor(wrap(null))).toThrow(BadRequestException);
  });

  it('createdAt chứa ký tự tiêm lọc bị từ chối', () => {
    const injected = encodeCursor({
      createdAt: '2026-01-01T00:00:00Z),id.gt.0',
      id: UUID,
    });
    expect(() => decodeCursor(injected)).toThrow(BadRequestException);
  });

  it('id không phải UUID bị từ chối', () => {
    const bad = encodeCursor({
      createdAt: '2026-10-20T13:45:12Z',
      id: '1) or (1=1',
    });
    expect(() => decodeCursor(bad)).toThrow(BadRequestException);
  });

  it('createdAt không phải ngày giờ có thật bị từ chối', () => {
    for (const createdAt of [
      '2026-13-01T00:00:00Z',
      '2026-02-30T00:00:00Z',
      '2026-10-20T25:00:00Z',
    ]) {
      expect(() => decodeCursor(encodeCursor({ createdAt, id: UUID }))).toThrow(
        BadRequestException,
      );
    }
  });

  it('con trỏ quá dài bị từ chối', () => {
    expect(() => decodeCursor('A'.repeat(2000))).toThrow(BadRequestException);
  });
});

describe('parseActivityQuery', () => {
  it('mặc định 30 ngày gần nhất, limit 50, không lọc loại, không con trỏ', () => {
    const parsed = parseActivityQuery({}, NOW);
    expect(parsed.to).toBe('2026-11-06T10:00:00.000Z');
    expect(parsed.from).toBe('2026-10-07T10:00:00.000Z');
    expect(parsed.limit).toBe(50);
    expect(parsed.type).toBeUndefined();
    expect(parsed.cursor).toBeNull();
  });

  it('nhận from/to ISO và chuẩn hoá về ISO UTC', () => {
    const parsed = parseActivityQuery(
      { from: '2026-10-01T00:00:00Z', to: '2026-10-31T23:59:59.999Z' },
      NOW,
    );
    expect(parsed.from).toBe('2026-10-01T00:00:00.000Z');
    expect(parsed.to).toBe('2026-10-31T23:59:59.999Z');
  });

  it('nhận ngày không có giờ: from đầu ngày, to cuối ngày', () => {
    const parsed = parseActivityQuery(
      { from: '2026-10-01', to: '2026-10-31' },
      NOW,
    );
    expect(parsed.from).toBe('2026-10-01T00:00:00.000Z');
    expect(parsed.to).toBe('2026-10-31T23:59:59.999Z');
  });

  it('chỉ có from thì to là bây giờ', () => {
    const parsed = parseActivityQuery({ from: '2026-11-01' }, NOW);
    expect(parsed.to).toBe('2026-11-06T10:00:00.000Z');
  });

  it('chỉ có to thì from lùi 30 ngày từ to', () => {
    const parsed = parseActivityQuery({ to: '2026-10-31T00:00:00Z' }, NOW);
    expect(parsed.from).toBe('2026-10-01T00:00:00.000Z');
  });

  it('from lớn hơn to bị từ chối', () => {
    expect(() =>
      parseActivityQuery({ from: '2026-11-02', to: '2026-11-01' }, NOW),
    ).toThrow(BadRequestException);
  });

  it('from bằng to được chấp nhận', () => {
    expect(() =>
      parseActivityQuery(
        { from: '2026-11-01T00:00:00Z', to: '2026-11-01T00:00:00Z' },
        NOW,
      ),
    ).not.toThrow();
  });

  it('ISO sai bị từ chối', () => {
    for (const bad of [
      'hôm qua',
      '2026-13-01',
      '2026-02-30',
      '1',
      '2026/10/01',
    ]) {
      expect(() => parseActivityQuery({ from: bad }, NOW)).toThrow(
        BadRequestException,
      );
      expect(() => parseActivityQuery({ to: bad }, NOW)).toThrow(
        BadRequestException,
      );
    }
  });

  it('limit nằm trong 1 đến 100', () => {
    expect(parseActivityQuery({ limit: '1' }, NOW).limit).toBe(1);
    expect(parseActivityQuery({ limit: '100' }, NOW).limit).toBe(100);
  });

  it('limit ngoài khoảng hoặc không phải số nguyên bị từ chối', () => {
    for (const bad of ['0', '101', 'abc', '-5', '1.5', '', '10abc']) {
      expect(() => parseActivityQuery({ limit: bad }, NOW)).toThrow(
        BadRequestException,
      );
    }
  });

  it('type thuộc danh mục được nhận', () => {
    for (const type of ['signin', 'projects', 'subscription', 'community']) {
      expect(parseActivityQuery({ type }, NOW).type).toBe(type);
    }
  });

  it('type lạ bị từ chối', () => {
    expect(() => parseActivityQuery({ type: 'admin' }, NOW)).toThrow(
      BadRequestException,
    );
    expect(() => parseActivityQuery({ type: 'auth.' }, NOW)).toThrow(
      BadRequestException,
    );
  });

  it('giá trị lặp (mảng) bị từ chối thay vì lấy phần tử đầu', () => {
    expect(() =>
      parseActivityQuery({ type: ['signin', 'projects'] }, NOW),
    ).toThrow(BadRequestException);
    expect(() => parseActivityQuery({ limit: ['5', '6'] }, NOW)).toThrow(
      BadRequestException,
    );
  });

  it('giải mã con trỏ hợp lệ và từ chối con trỏ rác', () => {
    const cursor = encodeCursor({
      createdAt: '2026-10-20T13:45:12.123456+00:00',
      id: UUID,
    });
    expect(parseActivityQuery({ cursor }, NOW).cursor).toEqual({
      createdAt: '2026-10-20T13:45:12.123456+00:00',
      id: UUID,
    });
    expect(() => parseActivityQuery({ cursor: 'rác' }, NOW)).toThrow(
      BadRequestException,
    );
  });
});
