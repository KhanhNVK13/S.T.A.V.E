"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "../context/auth-context";
import { useI18n } from "../context/i18n-context";
import { getStoredSessionId, pushAccountLanguage } from "../lib/api-client";
import { useSessionReady } from "../lib/use-session-ready";

type AccountLang = "en" | "vi";

const RETRY_DELAYS_MS = [1500, 4000];

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function pushLanguageWithRetry(
  lang: AccountLang,
  isCancelled: () => boolean,
  delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<boolean> {
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (isCancelled() || !getStoredSessionId()) return false;
    try {
      await pushAccountLanguage(lang);
      return true;
    } catch {
      if (attempt < delays.length) await wait(delays[attempt]);
    }
  }
  return false;
}

export function AccountLanguageSync() {
  const { user, profile } = useAuth();
  const { lang } = useI18n();
  const ready = useSessionReady();
  const profileLanguage = profile?.language;
  const attempted = useRef<string | null>(null);
  const synced = useRef<{ userId: string; lang: AccountLang } | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!ready || !userId) {
      attempted.current = null;
      synced.current = null;
      return;
    }
    const key = `${userId}:${lang}`;
    if (attempted.current === key) return;
    const known = synced.current?.userId === userId ? synced.current.lang : profileLanguage;
    if (known === lang) {
      attempted.current = key;
      return;
    }
    attempted.current = key;
    let cancelled = false;
    let finished = false;
    void pushLanguageWithRetry(lang, () => cancelled).then((ok) => {
      finished = true;
      if (cancelled) return;
      if (ok) synced.current = { userId, lang };
      else attempted.current = null;
    });
    return () => {
      cancelled = true;
      if (!finished) attempted.current = null;
    };
  }, [ready, userId, lang, profileLanguage]);

  return null;
}
