import { describe, expect, it } from 'vitest';
import { apiErrorMessage, authErrorMessage } from './error-message';
import { ApiError } from './api-client';

// ============================================================================
// SHEET: FE-LIB-12 (apiErrorMessage)
// ============================================================================
describe('FE-LIB-12 apiErrorMessage', () => {
  const fallback = 'Lưu thất bại.';

  it('UTCID01 maps known error message "Project not found"', () => {
    const err = new ApiError(404, 'Project not found');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Không tìm thấy dự án. Có thể dự án đã bị xoá hoặc bạn không có quyền xem.',
    );
  });

  it('UTCID02 passes through messages already in Vietnamese', () => {
    const err = new ApiError(400, 'Tên dự án đã tồn tại');
    expect(apiErrorMessage(err, fallback)).toBe('Tên dự án đã tồn tại');
  });

  it('UTCID03 maps branch named "HEAD" error pattern', () => {
    const err = new ApiError(400, 'Cannot create a branch named "HEAD"');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Tên nhánh này không dùng được. Hãy chọn tên khác.',
    );
  });

  it('UTCID04 maps 401 Unauthorized status', () => {
    const err = new ApiError(401, 'Unauthorized');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
    );
  });

  it('UTCID05 maps 403 Forbidden status', () => {
    const err = new ApiError(403, 'Forbidden');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Bạn không có quyền thực hiện thao tác này.',
    );
  });

  it('UTCID06 maps unknown 404 to fallback + not found message', () => {
    const err = new ApiError(404, 'Not Found');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Lưu thất bại. Dữ liệu không còn tồn tại — hãy tải lại trang.',
    );
  });

  it('UTCID07 maps unknown 409 to fallback + conflict message', () => {
    const err = new ApiError(409, 'Conflict');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Lưu thất bại. Dữ liệu vừa thay đổi — hãy tải lại trang rồi thử lại.',
    );
  });

  it('UTCID08 maps 413 to fallback + payload too large message', () => {
    const err = new ApiError(413, 'Payload Too Large');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Lưu thất bại. Dữ liệu gửi lên quá lớn.',
    );
  });

  it('UTCID09 maps 429 Too Many Requests status', () => {
    const err = new ApiError(429, 'Too Many Requests');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Bạn thao tác quá nhanh. Hãy đợi một lát rồi thử lại.',
    );
  });

  it('UTCID10 maps 500 status to fallback + server error message', () => {
    const err = new ApiError(500, 'Internal error');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Lưu thất bại. Máy chủ đang gặp sự cố, hãy thử lại sau.',
    );
  });

  it('UTCID11 returns fallback for unhandled 499 status', () => {
    const err = new ApiError(499, 'Client closed');
    expect(apiErrorMessage(err, fallback)).toBe(fallback);
  });

  it('UTCID12 returns fallback for generic 400 Bad Request', () => {
    const err = new ApiError(400, 'Bad Request');
    expect(apiErrorMessage(err, fallback)).toBe(fallback);
  });

  it('UTCID13 maps TypeError with fetch message to connection error', () => {
    const err = new TypeError('Failed to fetch');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Lưu thất bại. Không kết nối được máy chủ — kiểm tra mạng rồi thử lại.',
    );
  });

  it('UTCID14 returns fallback for generic Error instance', () => {
    const err = new Error('boom');
    expect(apiErrorMessage(err, fallback)).toBe(fallback);
  });

  it('UTCID15 returns empty string when err is null and fallback is empty', () => {
    expect(apiErrorMessage(null, '')).toBe('');
  });
});

// ============================================================================
// SHEET: FE-LIB-13 (authErrorMessage)
// ============================================================================
describe('FE-LIB-13 authErrorMessage', () => {
  it('UTCID01 returns default message for null', () => {
    expect(authErrorMessage(null)).toBe('Có lỗi xảy ra. Hãy thử lại.');
  });

  it('UTCID02 returns default message for undefined', () => {
    expect(authErrorMessage(undefined)).toBe('Có lỗi xảy ra. Hãy thử lại.');
  });

  it('UTCID03 maps invalid_credentials code', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' })).toBe(
      'Email hoặc mật khẩu không đúng.',
    );
  });

  it('UTCID04 maps user_banned code', () => {
    expect(authErrorMessage({ code: 'user_banned' })).toBe(
      'Tài khoản này đang bị đình chỉ.',
    );
  });

  it('UTCID05 maps status 429 to rate limit message', () => {
    expect(authErrorMessage({ code: 'unknown_x', status: 429 })).toBe(
      'Bạn thao tác quá nhanh. Hãy đợi một lát rồi thử lại.',
    );
  });

  it('UTCID06 maps network error message containing fetch', () => {
    expect(authErrorMessage({ message: 'Failed to fetch' })).toBe(
      'Không kết nối được máy chủ — kiểm tra mạng rồi thử lại.',
    );
  });

  it('UTCID07 returns default message for unknown code with status 400', () => {
    expect(authErrorMessage({ code: 'unknown_x', status: 400, message: 'x' })).toBe(
      'Có lỗi xảy ra. Hãy thử lại.',
    );
  });

  it('UTCID08 returns default message for empty error object', () => {
    expect(authErrorMessage({})).toBe('Có lỗi xảy ra. Hãy thử lại.');
  });
});

