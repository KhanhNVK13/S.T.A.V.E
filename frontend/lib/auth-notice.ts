const NOTICE_KEY = "stave_auth_notice";

export const ACCOUNT_INACTIVE_NOTICE =
  "Tài khoản của bạn đang bị đình chỉ hoặc không còn hoạt động. Hãy liên hệ bộ phận hỗ trợ để được giúp đỡ.";

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
