"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Toast } from "./ui/toast";
import { takeFlashToast, type FlashToast } from "../lib/flash-toast";

export function FlashToastHost() {
  const pathname = usePathname();
  const [flash, setFlash] = useState<FlashToast | null>(null);
  const dismiss = useCallback(() => setFlash(null), []);

  useEffect(() => {
    const next = takeFlashToast();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage chỉ đọc được ở client
    if (next) setFlash(next);
  }, [pathname]);

  if (!flash) return null;
  return <Toast message={flash.message} variant={flash.variant} onDismiss={dismiss} />;
}
