import { tNow } from "./i18n";

const NOTICE_KEY = "stave_auth_notice";

export function accountInactiveNotice(): string {
  return tNow("auth.inactiveNotice");
}

export function setAuthNotice(message: string): void {
  try {
    window.sessionStorage.setItem(NOTICE_KEY, message);
  } catch {}
}

export function takeAuthNotice(): string | null {
  try {
    const message = window.sessionStorage.getItem(NOTICE_KEY);
    if (message) window.sessionStorage.removeItem(NOTICE_KEY);
    return message;
  } catch {
    return null;
  }
}
