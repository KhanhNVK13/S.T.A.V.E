"use client";

import { useEffect } from "react";
import { requestSpaceScene, type SpaceMode } from "./space-store";

/**
 * Trang gọi hook này để ép chế độ nền khi đang mount (route mặc định: "full"
 * chỉ cho "/", còn lại "quiet"). `anchor` = thiên hà (0–6) camera dừng ở đó.
 */
export function useSpaceScene(mode: SpaceMode, anchor = 0): void {
  useEffect(() => requestSpaceScene(mode, anchor), [mode, anchor]);
}
