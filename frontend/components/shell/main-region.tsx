import type { ReactNode } from "react";

/**
 * `min-h-0` là bắt buộc: không có nó phần tử flex không co lại dưới chiều cao
 * nội dung, `main` tràn khỏi viewport và vùng cuộn nội bộ (MIDI Editor) mất
 * chiều cao xác định. `main` là vùng cuộn của trang; trang cao bằng vùng này
 * dùng min-h-full, không dùng 100vh.
 */
export function MainRegion({ children }: { children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
      {children}
    </main>
  );
}
