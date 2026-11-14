export const REAUTH_WINDOW_SECONDS = 5 * 60;

export function hasPasswordProvider(providers: unknown): boolean {
  return !Array.isArray(providers) || providers.includes("email");
}

export function hasRecentOAuthLogin(
  accessToken: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!accessToken) return false;
  try {
    const part = accessToken.split(".")[1] ?? "";
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as {
      amr?: { method?: string; timestamp?: number }[];
    };
    const nowSeconds = nowMs / 1000;
    return (payload.amr ?? []).some(
      (entry) =>
        entry.method === "oauth" &&
        typeof entry.timestamp === "number" &&
        nowSeconds - entry.timestamp >= 0 &&
        nowSeconds - entry.timestamp <= REAUTH_WINDOW_SECONDS,
    );
  } catch {
    return false;
  }
}

export function isLastSignInMethod(providers: readonly string[], target: string): boolean {
  return providers.includes(target) && providers.every((provider) => provider === target);
}
