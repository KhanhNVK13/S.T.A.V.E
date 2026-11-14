import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  focusFirstInvalid,
  requiredMessage,
  validateEmail,
  validateMaxLength,
  validatePassword,
  validateRequired,
} from './validation';
import { setLang } from './i18n';

beforeEach(() => setLang('vi'));

const REQUIRED = 'Vui lòng nhập trường này.';
const BAD_EMAIL = 'Email chưa đúng định dạng, ví dụ ban@email.com.';

describe('FE-LIB-49 validation.ts', () => {
  describe('validateEmail', () => {
    it('UTCID01 "ban@email.com" → null', () => {
      expect(validateEmail('ban@email.com')).toBeNull();
    });

    it('UTCID02 "  ban@email.com  " → null (value is trimmed)', () => {
      expect(validateEmail('  ban@email.com  ')).toBeNull();
    });

    it('UTCID03 "" or only spaces → required message', () => {
      expect(validateEmail('')).toBe(REQUIRED);
      expect(validateEmail('   ')).toBe(REQUIRED);
      expect(requiredMessage()).toBe(REQUIRED);
    });

    it('UTCID04 "ban-email.com" (no @) → format message', () => {
      expect(validateEmail('ban-email.com')).toBe(BAD_EMAIL);
    });

    it('UTCID05 "ban@email" (no dot in domain) → format message', () => {
      expect(validateEmail('ban@email')).toBe(BAD_EMAIL);
    });
  });

  describe('validateRequired', () => {
    it('UTCID06 "abc" → null', () => {
      expect(validateRequired('abc')).toBeNull();
    });

    it('UTCID07 "   " (spaces only) → required message', () => {
      expect(validateRequired('   ')).toBe(REQUIRED);
    });

    it('UTCID08 "" with a custom message → the custom message', () => {
      const customMsg = 'Bắt buộc nhập tên dự án.';
      expect(validateRequired('', customMsg)).toBe(customMsg);
    });
  });

  describe('validateMaxLength', () => {
    it('UTCID09 exactly max characters → null', () => {
      expect(validateMaxLength('abcd', 4, 'Mã')).toBeNull();
    });

    it('UTCID10 max + 1 characters → "<label> tối đa <max> ký tự."', () => {
      expect(validateMaxLength('abcde', 4, 'Mã')).toBe('Mã tối đa 4 ký tự.');
    });

    it('UTCID11 max characters plus surrounding spaces → null (length measured after trim)', () => {
      expect(validateMaxLength('  abcd  ', 4, 'Mã')).toBeNull();
    });
  });

  describe('validatePassword', () => {
    it('UTCID14 8 characters → null (the shortest allowed password)', () => {
      expect(validatePassword('12345678')).toBeNull();
    });

    it('UTCID15 7 characters → "Mật khẩu phải có ít nhất 8 ký tự."', () => {
      expect(validatePassword('1234567')).toBe('Mật khẩu phải có ít nhất 8 ký tự.');
    });

    it('UTCID16 empty password → required message', () => {
      expect(validatePassword('')).toBe(REQUIRED);
    });

    it('UTCID17 7 characters with a custom message → the custom message', () => {
      expect(validatePassword('1234567', 'Quá ngắn')).toBe('Quá ngắn');
    });
  });

  describe('focusFirstInvalid', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('UTCID12 root with an aria-invalid="true" element → that element is focused on the next animation frame', () => {
      const container = document.createElement('div');
      const input1 = document.createElement('input');
      const input2 = document.createElement('input');
      input2.setAttribute('aria-invalid', 'true');
      container.appendChild(input1);
      container.appendChild(input2);
      document.body.appendChild(container);

      const focusSpy = vi.spyOn(input2, 'focus');
      focusFirstInvalid(container);
      expect(focusSpy).not.toHaveBeenCalled();
      vi.runAllTimers();

      expect(focusSpy).toHaveBeenCalledTimes(1);
      document.body.removeChild(container);
    });

    it('UTCID13 root is null → returns without error and focuses nothing', () => {
      const raf = vi.spyOn(globalThis, 'requestAnimationFrame');
      expect(() => focusFirstInvalid(null)).not.toThrow();
      expect(raf).not.toHaveBeenCalled();
    });

    it('does nothing if no element has aria-invalid="true"', () => {
      const container = document.createElement('div');
      const input = document.createElement('input');
      container.appendChild(input);
      document.body.appendChild(container);

      const focusSpy = vi.spyOn(input, 'focus');
      focusFirstInvalid(container);
      vi.runAllTimers();

      expect(focusSpy).not.toHaveBeenCalled();
      document.body.removeChild(container);
    });
  });
});
