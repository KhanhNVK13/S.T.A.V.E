import { diffReportIds } from './reports.logic';

describe('diffReportIds', () => {
  it('khớp hoàn toàn -> cả hai rỗng', () => {
    expect(diffReportIds(['a', 'b'], ['b', 'a'])).toEqual({
      extra: [],
      missing: [],
    });
  });

  it('thiếu một id đã chọn (báo cáo mới) -> extra chứa nó', () => {
    expect(diffReportIds(['a'], ['a', 'b', 'c'])).toEqual({
      extra: ['b', 'c'],
      missing: [],
    });
  });

  it('id đã chọn không còn pending -> missing', () => {
    expect(diffReportIds(['a', 'x'], ['a'])).toEqual({
      extra: [],
      missing: ['x'],
    });
  });

  it('vừa có báo cáo mới vừa có id không còn pending', () => {
    expect(diffReportIds(['a', 'x'], ['a', 'b'])).toEqual({
      extra: ['b'],
      missing: ['x'],
    });
  });

  it('hai mảng rỗng', () => {
    expect(diffReportIds([], [])).toEqual({ extra: [], missing: [] });
  });

  it('không chọn gì mà còn pending -> tất cả là extra', () => {
    expect(diffReportIds([], ['a'])).toEqual({ extra: ['a'], missing: [] });
  });

  it('id trùng lặp ở hai phía không làm lệch kết quả', () => {
    expect(diffReportIds(['a', 'a', 'x', 'x'], ['a', 'a', 'b', 'b'])).toEqual({
      extra: ['b'],
      missing: ['x'],
    });
  });

  it('giữ thứ tự xuất hiện đầu tiên', () => {
    expect(diffReportIds(['z', 'y'], ['c', 'b', 'a'])).toEqual({
      extra: ['c', 'b', 'a'],
      missing: ['z', 'y'],
    });
  });

  it('không đổi dữ liệu đầu vào', () => {
    const selected = ['a', 'a'];
    const pending = ['b'];
    diffReportIds(selected, pending);
    expect(selected).toEqual(['a', 'a']);
    expect(pending).toEqual(['b']);
  });
});
