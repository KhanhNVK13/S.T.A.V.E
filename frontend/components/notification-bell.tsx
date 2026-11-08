"use client";

import { useCallback, useEffect, useState } from "react";
import { getUnreadNotificationCount } from "../lib/api-client";

const POLL_INTERVAL_MS = 60_000;
export const NOTIFICATIONS_CHANGED_EVENT = "stave:notifications-changed";

export function useUnreadNotificationCount(enabled = true): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setCount(await getUnreadNotificationCount());
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp số chưa đọc lần đầu
    void refresh();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_INTERVAL_MS);

    function handleVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    function handleChanged() {
      void refresh();
    }

    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handleChanged);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handleChanged);
    };
  }, [refresh, enabled]);

  return count;
}
