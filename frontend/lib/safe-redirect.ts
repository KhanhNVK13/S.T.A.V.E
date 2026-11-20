export const DEFAULT_AFTER_LOGIN_PATH = "/";

const AUTH_LOOP_PATH_RE =
  /^\/(login|register|forgot-password|reset-password|auth\/callback)(?:[/?#]|$)/;

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

export function sanitizeNextPath(value: string | null | undefined): string | null {
  if (!value || safeRedirectPath(value) !== value) {
    return null;
  }
  if (value === DEFAULT_AFTER_LOGIN_PATH || AUTH_LOOP_PATH_RE.test(value)) {
    return null;
  }
  return value;
}

export function readNextParam(search: string): string | null {
  const params = new URLSearchParams(search);
  return sanitizeNextPath(params.get("next") ?? params.get("redirect"));
}

export function withNextParam(basePath: string, nextPath: string | null | undefined): string {
  const validNext = sanitizeNextPath(nextPath);
  if (!validNext) return basePath;
  const separator = basePath.includes("?") ? "&" : "?";
  return `${basePath}${separator}next=${encodeURIComponent(validNext)}`;
}
