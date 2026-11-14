import { BadRequestException } from '@nestjs/common';
import {
  groupReportRows,
  mapStatusFilter,
  sanitizeReportDetails,
  type ReportRow,
} from './reports.logic';

describe('mapStatusFilter', () => {
  it('open -> pending', () => {
    expect(mapStatusFilter('open')).toEqual({ status: 'pending' });
  });

  it('upheld -> resolved + upheld', () => {
    expect(mapStatusFilter('upheld')).toEqual({
      status: 'resolved',
      resolution: 'upheld',
    });
  });

  it('dismissed -> resolved + dismissed', () => {
    expect(mapStatusFilter('dismissed')).toEqual({
      status: 'resolved',
      resolution: 'dismissed',
    });
  });

  it('giá trị lạ ném BadRequestException', () => {
    expect(() => mapStatusFilter('pending')).toThrow(BadRequestException);
    expect(() => mapStatusFilter('')).toThrow(BadRequestException);
    expect(() => mapStatusFilter(undefined)).toThrow(BadRequestException);
  });
});

describe('sanitizeReportDetails', () => {
  it('undefined, null, chuỗi trắng -> null', () => {
    expect(sanitizeReportDetails(undefined)).toBeNull();
    expect(sanitizeReportDetails(null)).toBeNull();
    expect(sanitizeReportDetails('')).toBeNull();
    expect(sanitizeReportDetails('   \n\t \r\n ')).toBeNull();
  });

  it('trim hai đầu', () => {
    expect(sanitizeReportDetails('  hello  ')).toBe('hello');
  });

  it('chuẩn hoá \\r\\n và \\r về \\n', () => {
    expect(sanitizeReportDetails('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('bỏ ký tự điều khiển, giữ xuống dòng', () => {
    expect(sanitizeReportDetails('a\u0000b\u0007c\u007fd\ne')).toBe('abcd\ne');
  });

  it('đổi tab thành dấu cách', () => {
    expect(sanitizeReportDetails('a\tb')).toBe('a b');
  });

  it('không quá 2 dòng trống liên tiếp (dòng chỉ có khoảng trắng cũng là dòng trống)', () => {
    expect(sanitizeReportDetails('a\n\n\n\n\nb')).toBe('a\n\nb');
    expect(sanitizeReportDetails('a\n  \n \n\t\nb')).toBe('a\n\nb');
  });

  it('không tự cắt chuỗi dài hơn 500', () => {
    expect(sanitizeReportDetails('x'.repeat(501))).toHaveLength(501);
  });

  it('giữ nguyên chữ có dấu và emoji', () => {
    expect(sanitizeReportDetails('Nhạc này đạo nhạc 🎵')).toBe(
      'Nhạc này đạo nhạc 🎵',
    );
  });
});

describe('BE-RPT-08 groupReportRows(rows)', () => {
  const row = (over: Partial<ReportRow>): ReportRow => ({
    id: 'r',
    project_id: 'p1',
    reason: 'spam',
    created_at: '2026-11-01T10:00:00.000Z',
    ...over,
  });

  it('UTCID01 gom theo project_id và đếm reportCount', () => {
    const groups = groupReportRows([
      row({ id: 'a', project_id: 'p1' }),
      row({ id: 'b', project_id: 'p2' }),
      row({ id: 'c', project_id: 'p1' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.projectId === 'p1')?.reportCount).toBe(2);
    expect(groups.find((g) => g.projectId === 'p2')?.reportCount).toBe(1);
  });

  it('UTCID02 reasons đếm đúng, nhiều trước, hoà thì theo thứ tự REPORT_REASONS', () => {
    const [group] = groupReportRows([
      row({ reason: 'other' }),
      row({ reason: 'spam' }),
      row({ reason: 'copyright' }),
      row({ reason: 'spam' }),
      row({ reason: 'harassment' }),
    ]);
    expect(group.reasons).toEqual([
      { reason: 'spam', count: 2 },
      { reason: 'copyright', count: 1 },
      { reason: 'harassment', count: 1 },
      { reason: 'other', count: 1 },
    ]);
  });

  it('UTCID03 lý do ngoài danh mục được tính vào other', () => {
    const [group] = groupReportRows([row({ reason: 'weird' })]);
    expect(group.reasons).toEqual([{ reason: 'other', count: 1 }]);
  });

  it('UTCID04 latestAt là thời điểm lớn nhất, sắp nhóm theo latestAt giảm dần', () => {
    const groups = groupReportRows([
      row({ project_id: 'old', created_at: '2026-10-01T00:00:00.000Z' }),
      row({ project_id: 'new', created_at: '2026-11-03T00:00:00.000Z' }),
      row({ project_id: 'old', created_at: '2026-10-05T00:00:00.000Z' }),
    ]);
    expect(groups.map((g) => g.projectId)).toEqual(['new', 'old']);
    expect(groups[1].latestAt).toBe('2026-10-05T00:00:00.000Z');
  });

  it('UTCID05 so sánh thời điểm theo giá trị chứ không theo chuỗi', () => {
    const groups = groupReportRows([
      row({ project_id: 'a', created_at: '2026-11-01T10:00:00+07:00' }),
      row({ project_id: 'b', created_at: '2026-11-01T05:00:00Z' }),
    ]);
    expect(groups.map((g) => g.projectId)).toEqual(['b', 'a']);
  });

  it('UTCID06 project_id null thành nhóm projectExists false', () => {
    const groups = groupReportRows([
      row({ project_id: null }),
      row({ project_id: null }),
      row({ project_id: 'p1' }),
    ]);
    const orphan = groups.find((g) => g.projectId === null);
    expect(orphan).toMatchObject({ projectExists: false, reportCount: 2 });
    expect(groups.find((g) => g.projectId === 'p1')?.projectExists).toBe(true);
  });

  it('UTCID07 lấy quyết định của báo cáo được xử lý gần nhất', () => {
    const [group] = groupReportRows([
      row({
        resolution: 'dismissed',
        resolution_note: 'cũ',
        resolved_at: '2026-11-01T00:00:00.000Z',
      }),
      row({
        resolution: 'upheld',
        resolution_note: 'mới',
        resolved_at: '2026-11-02T00:00:00.000Z',
      }),
    ]);
    expect(group).toMatchObject({
      resolution: 'upheld',
      resolutionNote: 'mới',
      resolvedAt: '2026-11-02T00:00:00.000Z',
    });
  });

  it('UTCID08 báo cáo đang mở không có trường quyết định', () => {
    const [group] = groupReportRows([row({})]);
    expect(group).not.toHaveProperty('resolution');
    expect(group).not.toHaveProperty('resolutionNote');
  });

  it('UTCID09 không đổi dữ liệu đầu vào', () => {
    const input = [row({ id: 'a' }), row({ id: 'b', project_id: 'p2' })];
    const snapshot = JSON.parse(JSON.stringify(input)) as ReportRow[];
    groupReportRows(input);
    expect(input).toEqual(snapshot);
  });

  it('UTCID10 danh sách rỗng -> mảng rỗng', () => {
    expect(groupReportRows([])).toEqual([]);
  });
});
