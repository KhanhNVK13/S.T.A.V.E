/**
 * FE-LIB-12 — error-message.apiErrorMessage(err, fallback)
 * FE-LIB-13 — error-message.authErrorMessage(error)
 *
 * Cả hai là hàm thuần: không mock, không network. `ApiError` được import từ
 * `api-client` thật nên `instanceof` chạy đúng với class production.
 *
 * Thứ tự xử lý của apiErrorMessage (quan trọng cho kỳ vọng):
 *   1. message có trong bảng API_MESSAGES → trả bản dịch
 *   2. message tiếng Việt → trả nguyên xi
 *   3. message bắt đầu bằng `Cannot create a branch named "` → gợi ý tên nhánh
 *   4. theo status (401/403/404/409/413/429/5xx)
 *   5. còn lại → fallback
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from './api-client';
import { setLang } from './i18n';
import { apiErrorMessage, authErrorMessage } from './error-message';

const FALLBACK = 'Lưu thất bại.';

beforeEach(() => setLang('vi'));

describe('FE-LIB-12 apiErrorMessage(err, fallback)', () => {
  it('translates a known API message ("Project not found")', () => {
    const err = new ApiError(404, 'Project not found');

    expect(apiErrorMessage(err, FALLBACK)).toBe(
      'Không tìm thấy dự án. Có thể dự án đã bị xoá hoặc bạn không có quyền xem.',
    );
  });

  it('passes a Vietnamese message through unchanged', () => {
    const err = new ApiError(400, 'Tên dự án đã tồn tại');

    expect(apiErrorMessage(err, FALLBACK)).toBe('Tên dự án đã tồn tại');
  });

  it('maps the reserved-branch-name message to the friendly notice', () => {
    const err = new ApiError(400, 'Cannot create a branch named "HEAD"');

    expect(apiErrorMessage(err, FALLBACK)).toBe(
      'Tên nhánh này không dùng được. Hãy chọn tên khác.',
    );
  });

  it('maps a 401 to the re-login notice', () => {
    const err = new ApiError(401, 'Unauthorized');

    expect(apiErrorMessage(err, FALLBACK)).toBe(
      'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
    );
  });

  it('maps a 403 to the permission notice', () => {
    const err = new ApiError(403, 'Forbidden');

    expect(apiErrorMessage(err, FALLBACK)).toBe(
      'Bạn không có quyền thực hiện thao tác này.',
    );
  });

  it('maps a 404 with an unknown message to the fallback + missing-data notice', () => {
    const err = new ApiError(404, 'Not Found');

    expect(apiErrorMessage(err, FALLBACK)).toBe(
      'Lưu thất bại. Dữ liệu không còn tồn tại — hãy tải lại trang.',
    );
  });

  it('maps a 409 to the fallback + changed-data notice', () => {
    const err = new ApiError(409, 'Conflict');

    expect(apiErrorMessage(err, FALLBACK)).toBe(
      'Lưu thất bại. Dữ liệu vừa thay đổi — hãy tải lại trang rồi thử lại.',
    );
  });

  it('maps a 413 to the fallback + payload-too-large notice', () => {
    const err = new ApiError(413, 'Payload Too Large');

    expect(apiErrorMessage(err, FALLBACK)).toBe(
      'Lưu thất bại. Dữ liệu gửi lên quá lớn.',
    );
  });

  it('maps a 429 to the rate-limit notice', () => {
    const err = new ApiError(429, 'Too Many Requests');

    expect(apiErrorMessage(err, FALLBACK)).toBe(
      'Bạn thao tác quá nhanh. Hãy đợi một lát rồi thử lại.',
    );
  });

  it('maps a 500 to the fallback + server-error notice', () => {
    const err = new ApiError(500, 'Internal error');

    expect(apiErrorMessage(err, FALLBACK)).toBe(
      'Lưu thất bại. Máy chủ đang gặp sự cố, hãy thử lại sau.',
    );
  });

  it('returns the fallback unchanged for an unmapped status (499)', () => {
    const err = new ApiError(499, 'Client closed');

    expect(apiErrorMessage(err, FALLBACK)).toBe(FALLBACK);
  });

  it('returns the fallback unchanged for a 400 without a known or Vietnamese message', () => {
    const err = new ApiError(400, 'Bad Request');

    expect(apiErrorMessage(err, FALLBACK)).toBe(FALLBACK);
  });

  it('maps a network TypeError to the fallback + connection notice', () => {
    const err = new TypeError('Failed to fetch');

    expect(apiErrorMessage(err, FALLBACK)).toBe(
      'Lưu thất bại. Không kết nối được máy chủ — kiểm tra mạng rồi thử lại.',
    );
  });

  it('returns the fallback for a generic Error', () => {
    const err = new Error('boom');

    expect(apiErrorMessage(err, FALLBACK)).toBe(FALLBACK);
  });

  it('returns the fallback unchanged for null and an empty fallback', () => {
    expect(apiErrorMessage(null, '')).toBe('');
    expect(apiErrorMessage(null, FALLBACK)).toBe(FALLBACK);
  });
});

describe('FE-LIB-13 authErrorMessage(error)', () => {
  it('returns the generic message for a null error', () => {
    expect(authErrorMessage(null)).toBe('Có lỗi xảy ra. Hãy thử lại.');
  });

  it('returns the generic message for an undefined error', () => {
    expect(authErrorMessage(undefined)).toBe('Có lỗi xảy ra. Hãy thử lại.');
  });

  it('maps the invalid_credentials code', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' })).toBe(
      'Email hoặc mật khẩu không đúng.',
    );
  });

  it('maps the user_banned code', () => {
    expect(authErrorMessage({ code: 'user_banned' })).toBe(
      'Tài khoản này đang bị đình chỉ.',
    );
  });

  it('maps a 429 status to the rate-limit message for an unknown code', () => {
    expect(authErrorMessage({ code: 'unknown_x', status: 429 })).toBe(
      'Bạn thao tác quá nhanh. Hãy đợi một lát rồi thử lại.',
    );
  });

  it('maps a network message to the connection notice', () => {
    expect(authErrorMessage({ message: 'Failed to fetch' })).toBe(
      'Không kết nối được máy chủ — kiểm tra mạng rồi thử lại.',
    );
  });

  it('returns the generic message for an unknown code, 400 status and plain message', () => {
    expect(
      authErrorMessage({ code: 'unknown_x', status: 400, message: 'x' }),
    ).toBe('Có lỗi xảy ra. Hãy thử lại.');
  });

  it('returns the generic message for an empty error object', () => {
    expect(authErrorMessage({})).toBe('Có lỗi xảy ra. Hãy thử lại.');
  });
});
