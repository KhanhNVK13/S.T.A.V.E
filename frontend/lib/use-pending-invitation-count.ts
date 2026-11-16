"use client";

import { useEffect, useRef, useState } from "react";
import { INVITATIONS_CHANGED_EVENT, listMyInvitations } from "./api-collab";

const POLL_INTERVAL_MS = 60_000;

export function usePendingInvitationCount(enabled = true): number {
  const [count, setCount] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    async function refresh() {
      const request = ++requestRef.current;
      try {
        const invitations = await listMyInvitations();
        if (active && request === requestRef.current) setCount(invitations.length);
      } catch {
        return;
      }
    }

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
    window.addEventListener(INVITATIONS_CHANGED_EVENT, handleChanged);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener(INVITATIONS_CHANGED_EVENT, handleChanged);
    };
  }, [enabled]);

  return enabled ? count : 0;
}
