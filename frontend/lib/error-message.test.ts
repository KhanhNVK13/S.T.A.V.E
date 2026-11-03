import { describe, expect, it } from 'vitest';
import { apiErrorMessage, authErrorMessage } from './error-message';
import { ApiError } from './api-client';

// =============================================================================
// FE-LIB-12 — error-message.apiErrorMessage(err, fallback)
// =============================================================================

describe('FE-LIB-12 apiErrorMessage(err, fallback)', () => {
  const fallback = 'Lưu thất bại.';

  it('UTCID01 (N) known message translates correctly', () => {
    const err = new ApiError(404, 'Project not found');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Không tìm thấy dự án. Có thể dự án đã bị xoá hoặc bạn không có quyền xem.',
    );
  });

  it('UTCID02 (N) Vietnamese message passes through', () => {
    const err = new ApiError(400, 'Tên dự án đã tồn tại');
    expect(apiErrorMessage(err, fallback)).toBe('Tên dự án đã tồn tại');
  });

  it('UTCID03 (N) cannot create branch prefix translates', () => {
    const err = new ApiError(400, 'Cannot create a branch named "foo"');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Tên nhánh này không dùng được. Hãy chọn tên khác.',
    );
  });

  it('UTCID04 (A) 401 returns expired session message', () => {
    const err = new ApiError(401, 'Unauthorized');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
    );
  });

  it('UTCID05 (A) 403 returns forbidden message', () => {
    const err = new ApiError(403, 'Forbidden');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Bạn không có quyền thực hiện thao tác này.',
    );
  });

  it('UTCID06 (A) 404 with unknown message returns fallback + data not found', () => {
    const err = new ApiError(404, 'Not Found');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Lưu thất bại. Dữ liệu không còn tồn tại — hãy tải lại trang.',
    );
  });

  it('UTCID07 (A) 409 returns fallback + data changed', () => {
    const err = new ApiError(409, 'Conflict');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Lưu thất bại. Dữ liệu vừa thay đổi — hãy tải lại trang rồi thử lại.',
    );
  });

  it('UTCID08 (A) 413 returns fallback + payload too large', () => {
    const err = new ApiError(413, 'Payload Too Large');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Lưu thất bại. Dữ liệu gửi lên quá lớn.',
    );
  });

  it('UTCID09 (A) 429 returns too many requests message', () => {
    const err = new ApiError(429, 'Too Many Requests');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Bạn thao tác quá nhanh. Hãy đợi một lát rồi thử lại.',
    );
  });

  it('UTCID10 (B) 500 returns fallback + server error message', () => {
    const err = new ApiError(500, 'Internal error');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Lưu thất bại. Máy chủ đang gặp sự cố, hãy thử lại sau.',
    );
  });

  it('UTCID11 (A) unmapped status returns fallback unchanged', () => {
    const err = new ApiError(499, 'Client closed');
    expect(apiErrorMessage(err, fallback)).toBe(fallback);
  });

  it('UTCID12 (A) 400 with non-Vietnamese unknown message returns fallback unchanged', () => {
    const err = new ApiError(400, 'Bad Request');
    expect(apiErrorMessage(err, fallback)).toBe(fallback);
  });

  it('UTCID13 (A) TypeError with Failed to fetch returns network error message', () => {
    const err = new TypeError('Failed to fetch');
    expect(apiErrorMessage(err, fallback)).toBe(
      'Lưu thất bại. Không kết nối được máy chủ — kiểm tra mạng rồi thử lại.',
    );
  });

  it('UTCID14 (A) generic Error returns fallback unchanged', () => {
    const err = new Error('boom');
    expect(apiErrorMessage(err, fallback)).toBe(fallback);
  });

  it('UTCID15 (A) null returns fallback unchanged', () => {
    expect(apiErrorMessage(null, '')).toBe('');
  });
});

// =============================================================================
// FE-LIB-13 — error-message.authErrorMessage(error)
// =============================================================================

describe('FE-LIB-13 authErrorMessage(error)', () => {
  it('UTCID01 (A) null returns generic error', () => {
    expect(authErrorMessage(null)).toBe('Có lỗi xảy ra. Hãy thử lại.');
  });

  it('UTCID02 (A) undefined returns generic error', () => {
    expect(authErrorMessage(undefined)).toBe('Có lỗi xảy ra. Hãy thử lại.');
  });

  it('UTCID03 (N) code "invalid_credentials" translates correctly', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' })).toBe(
      'Email hoặc mật khẩu không đúng.',
    );
  });

  it('UTCID04 (N) code "user_banned" translates correctly', () => {
    expect(authErrorMessage({ code: 'user_banned' })).toBe(
      'Tài khoản này đang bị đình chỉ.',
    );
  });

  it('UTCID05 (A) status 429 returns over request rate limit message', () => {
    expect(authErrorMessage({ code: 'unknown_x', status: 429 })).toBe(
      'Bạn thao tác quá nhanh. Hãy đợi một lát rồi thử lại.',
    );
  });

  it('UTCID06 (A) message with fetch returns network error message', () => {
    expect(authErrorMessage({ message: 'Failed to fetch' })).toBe(
      'Không kết nối được máy chủ — kiểm tra mạng rồi thử lại.',
    );
  });

  it('UTCID07 (A) unknown error code and status returns generic fallback', () => {
    expect(
      authErrorMessage({ code: 'unknown_x', status: 400, message: 'some error' }),
    ).toBe('Có lỗi xảy ra. Hãy thử lại.');
  });

  it('UTCID08 (B) empty error object returns generic fallback', () => {
    expect(authErrorMessage({})).toBe('Có lỗi xảy ra. Hãy thử lại.');
  });
});
