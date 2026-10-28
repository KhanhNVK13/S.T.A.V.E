"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { getUnreadNotificationCount } from "../lib/api-client";

const POLL_INTERVAL_MS = 60_000;
export const NOTIFICATIONS_CHANGED_EVENT = "stave:notifications-changed";

export function NotificationBell() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setCount(await getUnreadNotificationCount());
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
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
  }, [refresh]);

  const label = count > 0 ? `Thông báo, ${count} chưa đọc` : "Thông báo";

  return (
    <Link
      href="/notifications"
      aria-label={label}
      title="Thông báo"
      className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-subtle hover:text-foreground"
    >
      <Bell className="h-[18px] w-[18px]" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-xs font-bold leading-4 text-accent-foreground"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
