export const DEFAULT_AFTER_LOGIN_PATH = "/projects";

export function safeRedirectPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return DEFAULT_AFTER_LOGIN_PATH;
  }
  return value;
}
