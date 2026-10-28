const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const REQUIRED_MESSAGE = "Vui lòng nhập trường này.";

export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return REQUIRED_MESSAGE;
  if (!EMAIL_PATTERN.test(email)) return "Email chưa đúng định dạng, ví dụ ban@email.com.";
  return null;
}

export function validateRequired(value: string, message = REQUIRED_MESSAGE): string | null {
  return value.trim() ? null : message;
}

export function validateMaxLength(value: string, max: number, label: string): string | null {
  return value.trim().length > max ? `${label} tối đa ${max} ký tự.` : null;
}

export function focusFirstInvalid(root: ParentNode | null): void {
  if (!root) return;
  requestAnimationFrame(() => {
    root.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  });
}
