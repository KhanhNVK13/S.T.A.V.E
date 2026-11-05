import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  REQUIRED_MESSAGE,
  focusFirstInvalid,
  validateEmail,
  validateMaxLength,
  validateRequired,
} from './validation';

// ============================================================================
// SHEET: FE-LIB-49 (validation.ts)
// ============================================================================
describe('FE-LIB-49 validation.ts', () => {
  describe('validateEmail', () => {
    it('UTCID01 accepts a standard valid email address and returns null', () => {
      expect(validateEmail('ban@email.com')).toBeNull();
    });

    it('UTCID02 trims leading and trailing whitespace on a valid email', () => {
      expect(validateEmail('  ban@email.com  ')).toBeNull();
    });

    it('UTCID03 returns REQUIRED_MESSAGE for an empty string', () => {
      expect(validateEmail('')).toBe(REQUIRED_MESSAGE);
    });

    it('UTCID04 returns REQUIRED_MESSAGE for whitespace-only input', () => {
      expect(validateEmail('   ')).toBe(REQUIRED_MESSAGE);
    });

    it('UTCID05 returns format error message when email is missing domain or @', () => {
      expect(validateEmail('not-an-email')).toBe(
        'Email chưa đúng định dạng, ví dụ ban@email.com.',
      );
    });
  });

  describe('validateRequired', () => {
    it('UTCID06 returns null when non-empty string is provided', () => {
      expect(validateRequired('valid text')).toBeNull();
    });

    it('UTCID07 returns default REQUIRED_MESSAGE when string is empty or whitespace', () => {
      expect(validateRequired('')).toBe(REQUIRED_MESSAGE);
      expect(validateRequired('   ')).toBe(REQUIRED_MESSAGE);
    });

    it('UTCID08 returns custom error message when provided and value is empty', () => {
      const customMsg = 'Bắt buộc nhập tên dự án.';
      expect(validateRequired('', customMsg)).toBe(customMsg);
    });
  });

  describe('validateMaxLength', () => {
    it('UTCID09 returns null when trimmed length is within or equal to max boundary', () => {
      expect(validateMaxLength('abcd', 4, 'Mã')).toBeNull();
      expect(validateMaxLength('abc', 4, 'Mã')).toBeNull();
    });

    it('UTCID10 returns error message when trimmed length exceeds max', () => {
      expect(validateMaxLength('abcde', 4, 'Mã')).toBe('Mã tối đa 4 ký tự.');
    });
  });

  describe('focusFirstInvalid', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('UTCID11 focuses the first element with aria-invalid="true" inside root', () => {
      const container = document.createElement('div');
      const input1 = document.createElement('input');
      const input2 = document.createElement('input');
      input2.setAttribute('aria-invalid', 'true');
      container.appendChild(input1);
      container.appendChild(input2);
      document.body.appendChild(container);

      const focusSpy = vi.spyOn(input2, 'focus');
      focusFirstInvalid(container);
      vi.runAllTimers();

      expect(focusSpy).toHaveBeenCalledTimes(1);
      document.body.removeChild(container);
    });

    it('UTCID12 handles null root gracefully without throwing error', () => {
      expect(() => focusFirstInvalid(null)).not.toThrow();
    });

    it('UTCID13 does nothing if no element has aria-invalid="true"', () => {
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

