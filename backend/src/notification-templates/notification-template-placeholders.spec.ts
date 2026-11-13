import {
  extractPlaceholders,
  findMalformedPlaceholders,
  renderPreview,
  validatePlaceholders,
  validateTemplatePlaceholders,
  NOTIFICATION_PLACEHOLDER_SAMPLES,
  TEMPLATE_BODY_MAX_LENGTH,
  TEMPLATE_NAME_MAX_LENGTH,
  TEMPLATE_SUBJECT_MAX_LENGTH,
} from '@stave/shared-types';

describe('extractPlaceholders', () => {
  it('lấy placeholder hợp lệ theo regex chặt', () => {
    expect(extractPlaceholders('{{inviterName}} mời {{projectName}}')).toEqual([
      'inviterName',
      'projectName',
    ]);
  });

  it('bỏ qua khoảng trắng quanh tên: {{ ten }} và {{ten}} là cùng một placeholder', () => {
    expect(extractPlaceholders('{{ ten }} và {{ten}}')).toEqual(['ten']);
  });

  it('phân biệt hoa thường: {{Ten}} khác {{ten}}', () => {
    expect(extractPlaceholders('{{Ten}} {{ten}}')).toEqual(['Ten', 'ten']);
  });

  it('không trùng lặp khi placeholder lặp nhiều lần', () => {
    expect(extractPlaceholders('{{a}} {{b}} {{a}} {{b}}')).toEqual(['a', 'b']);
  });

  it('giữ thứ tự lần xuất hiện đầu tiên', () => {
    expect(extractPlaceholders('{{b}} {{a}} {{b}}')).toEqual(['b', 'a']);
  });

  it('văn bản không có placeholder thì rỗng', () => {
    expect(extractPlaceholders('không có gì cả')).toEqual([]);
  });

  it('chuỗi rỗng thì rỗng', () => {
    expect(extractPlaceholders('')).toEqual([]);
  });

  it('không lấy placeholder sai cú pháp', () => {
    expect(extractPlaceholders('{{a-b}} {{x')).toEqual([]);
  });
});

describe('findMalformedPlaceholders', () => {
  it('phát hiện {{a-b}} sai cú pháp', () => {
    expect(findMalformedPlaceholders('{{a-b}}')).toEqual(['{{a-b}}']);
  });

  it('phát hiện {{ }} và {{}} rỗng tên', () => {
    expect(findMalformedPlaceholders('{{ }}')).toEqual(['{{ }}']);
    expect(findMalformedPlaceholders('{{}}')).toEqual(['{{}}']);
  });

  it('phát hiện {{x mở ngoặc không đóng', () => {
    expect(findMalformedPlaceholders('{{x')).toEqual(['{{x']);
  });

  it('phát hiện {x}} đóng ngoặc không mở', () => {
    expect(findMalformedPlaceholders('{x}}')).toEqual(['{x}}']);
  });

  it('văn bản không có placeholder thì rỗng', () => {
    expect(findMalformedPlaceholders('không có gì cả')).toEqual([]);
  });

  it('chuỗi rỗng thì rỗng', () => {
    expect(findMalformedPlaceholders('')).toEqual([]);
  });

  it('không báo placeholder hợp lệ là sai cú pháp', () => {
    expect(findMalformedPlaceholders('{{a}} {{ b }}')).toEqual([]);
  });

  it('báo nhiều mảnh sai cú pháp, không trùng lặp, giữ thứ tự', () => {
    expect(findMalformedPlaceholders('{{a-b}} {{c-d}} {{a-b}}')).toEqual([
      '{{a-b}}',
      '{{c-d}}',
    ]);
  });

  it('báo ngoặc thừa đứng sau placeholder hợp lệ', () => {
    expect(findMalformedPlaceholders('{{a}}}')).toEqual(['}']);
  });
});

describe('validatePlaceholders', () => {
  it('placeholder hợp lệ có trong danh sách thì valid', () => {
    const result = validatePlaceholders('{{projectName}}', ['projectName']);
    expect(result).toEqual({ valid: true, invalid: [], malformed: [] });
  });

  it('placeholder không thuộc loại thì invalid chứa đúng tên đó', () => {
    const result = validatePlaceholders('{{unknownName}}', ['projectName']);
    expect(result.valid).toBe(false);
    expect(result.invalid).toEqual(['unknownName']);
    expect(result.malformed).toEqual([]);
  });

  it('liệt kê đủ nhiều placeholder sai, không trùng lặp, giữ thứ tự xuất hiện', () => {
    const result = validatePlaceholders('{{zz}} {{aa}} {{zz}} {{bb}}', ['ok']);
    expect(result.invalid).toEqual(['zz', 'aa', 'bb']);
  });

  it('sai cú pháp thì vào malformed, không vào invalid', () => {
    const result = validatePlaceholders('{{a-b}}', ['a']);
    expect(result.valid).toBe(false);
    expect(result.invalid).toEqual([]);
    expect(result.malformed).toEqual(['{{a-b}}']);
  });

  it('khoảng trắng quanh tên không làm sai: {{ ten }} hợp lệ khi allowed có ten', () => {
    const result = validatePlaceholders('{{ ten }}', ['ten']);
    expect(result.valid).toBe(true);
  });

  it('phân biệt hoa thường theo danh sách thật', () => {
    const result = validatePlaceholders('{{Ten}} {{ten}}', ['ten']);
    expect(result.invalid).toEqual(['Ten']);
  });

  it('rỗng thì hợp lệ (không có placeholder nào)', () => {
    expect(validatePlaceholders('', ['a'])).toEqual({
      valid: true,
      invalid: [],
      malformed: [],
    });
  });
});

describe('validateTemplatePlaceholders', () => {
  it('kiểm trên cả tiêu đề lẫn nội dung', () => {
    const result = validateTemplatePlaceholders(
      '{{projectName}}',
      '{{reason}}',
      ['projectName'],
    );
    expect(result.valid).toBe(false);
    expect(result.invalid).toEqual(['reason']);
  });

  it('gộp lỗi của cả hai chuỗi, không trùng lặp', () => {
    const result = validateTemplatePlaceholders(
      '{{bad}}',
      '{{bad}} {{worse}}',
      ['ok'],
    );
    expect(result.invalid).toEqual(['bad', 'worse']);
  });

  it('gộp cả malformed của tiêu đề và nội dung', () => {
    const result = validateTemplatePlaceholders(
      '{{a-b}}',
      '{{c-d}}',
      ['ok'],
    );
    expect(result.malformed).toEqual(['{{a-b}}', '{{c-d}}']);
  });

  it('cả hai hợp lệ thì valid', () => {
    const result = validateTemplatePlaceholders(
      '{{projectName}}',
      'Dự án {{projectName}}',
      ['projectName'],
    );
    expect(result.valid).toBe(true);
  });
});

describe('renderPreview', () => {
  it('thay placeholder bằng giá trị ví dụ', () => {
    expect(renderPreview('Xin chào {{name}}!', { name: 'Lan' })).toBe('Xin chào Lan!');
  });

  it('thay mọi lần xuất hiện của một placeholder', () => {
    expect(renderPreview('{{a}} và {{a}}', { a: 'x' })).toBe('x và x');
  });

  it('placeholder không có giá trị ví dụ thì để nguyên dấu hiệu, không để trống', () => {
    expect(renderPreview('{{a}} {{b}}', { a: 'x' })).toBe('x {{b}}');
  });

  it('không diễn giải HTML, chỉ trả về chuỗi', () => {
    expect(renderPreview('<b>{{a}}</b>', { a: '<i>x</i>' })).toBe(
      '<b><i>x</i></b>',
    );
  });

  it('văn bản không có placeholder thì giữ nguyên', () => {
    expect(renderPreview('không có gì', {})).toBe('không có gì');
  });

  it('khoảng trắng quanh tên vẫn được thay', () => {
    expect(renderPreview('{{ a }}', { a: 'x' })).toBe('x');
  });
});

describe('hằng số dùng chung', () => {
  it('giới hạn độ dài đúng như đã chốt', () => {
    expect(TEMPLATE_NAME_MAX_LENGTH).toBe(100);
    expect(TEMPLATE_SUBJECT_MAX_LENGTH).toBe(150);
    expect(TEMPLATE_BODY_MAX_LENGTH).toBe(2000);
  });

  it('mọi placeholder trong bảng ví dụ đều có giá trị không rỗng', () => {
    for (const [key, value] of Object.entries(NOTIFICATION_PLACEHOLDER_SAMPLES)) {
      expect(value.length).toBeGreaterThan(0);
      expect(key).toMatch(/^[A-Za-z0-9_]+$/);
    }
  });

  it('email mẫu dùng domain example.com, không dùng email thật', () => {
    expect(NOTIFICATION_PLACEHOLDER_SAMPLES.email).toContain('example.com');
  });
});
