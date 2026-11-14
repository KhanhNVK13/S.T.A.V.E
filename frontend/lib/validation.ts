import { tNow } from "./i18n";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requiredMessage(): string {
  return tNow("validation.required");
}

export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return requiredMessage();
  if (!EMAIL_PATTERN.test(email)) return tNow("validation.email");
  return null;
}

export const PASSWORD_MIN_LENGTH = 8;

export function validatePassword(value: string, shortMessage = tNow("auth.passwordTooShort")): string | null {
  if (!value) return requiredMessage();
  if (value.length < PASSWORD_MIN_LENGTH) return shortMessage;
  return null;
}

export function validateRequired(value: string, message = requiredMessage()): string | null {
  return value.trim() ? null : message;
}

export function validateMaxLength(value: string, max: number, label: string): string | null {
  return value.trim().length > max ? tNow("validation.maxLength", { label, max }) : null;
}

export function focusFirstInvalid(root: ParentNode | null): void {
  if (!root) return;
  requestAnimationFrame(() => {
    root.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  });
}
