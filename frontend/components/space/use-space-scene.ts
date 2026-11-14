"use client";

import { useEffect } from "react";
import { requestSpaceScene, setSpaceProgress, type SpaceMode } from "./space-store";

/**
 * Trang gọi hook này để ép chế độ nền khi đang mount (route mặc định: "full"
 * chỉ cho "/", còn lại "quiet"). `anchor` = thiên hà (0–6) camera dừng ở đó.
 */
export function useSpaceScene(mode: SpaceMode, anchor = 0): void {
  useEffect(() => requestSpaceScene(mode, anchor), [mode, anchor]);
}

/**
 * Cho camera trôi từ thiên hà `from` tới `from + span` theo độ cuộn của
 * `<main id="main">` (vùng cuộn của trang, không phải `window`).
 */
export function useSpaceScroll(from: number, span: number): void {
  useEffect(() => {
    const main = document.getElementById("main");
    if (!main) return;
    let queued = false;
    const update = () => {
      queued = false;
      const range = main.scrollHeight - main.clientHeight;
      const ratio = range > 0 ? Math.min(1, main.scrollTop / range) : 0;
      setSpaceProgress(from + ratio * span);
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    update();
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main.removeEventListener("scroll", onScroll);
      setSpaceProgress(null);
    };
  }, [from, span]);
}
