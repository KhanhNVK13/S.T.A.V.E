/**
 * redesign/tokens.ts
 *
 * Bảng màu của MIDI Editor. Trước đây là các mã hex CỐ ĐỊNH chép từ mockup
 * `docs/STAVE design component sample/.../STAVE.dc.html`; nay trỏ thẳng vào hệ
 * token semantic ở `app/globals.css`.
 *
 * Lý do bắt buộc phải đổi: UC-78/UC-79 cho người dùng đổi theme bằng cách ghi
 * đè các biến CSS đó. Nếu editor vẫn giữ hex riêng thì đổi theme xong mở trình
 * soạn nhạc sẽ thấy màu cũ y nguyên — tức tính năng hỏng ở đúng màn hình quan
 * trọng nhất.
 *
 * Mọi giá trị ở đây là chuỗi CSS (`var()` / `color-mix()`), CHỈ dùng được cho
 * DOM (inline style, className). Canvas 2D KHÔNG parse được `var()` — piano
 * roll vì thế phải resolve màu lúc chạy qua `lib/resolve-css-colors.ts`.
 */
export const DC = {
  // Nền & bề mặt
  pageBg: "var(--background)",
  surface: "var(--surface)",
  rulerBg: "var(--surface-subtle)",

  // Viền — 2 mức nhạt hơn `--border`, pha thẳng trong CSS để vẫn đổi theo theme
  border: "var(--border)",
  borderSoft: "color-mix(in oklab, var(--border) 55%, var(--surface))",
  borderSofter: "color-mix(in oklab, var(--border) 35%, var(--surface))",

  // Chữ
  text: "var(--foreground)",
  textMuted: "var(--muted-foreground)",

  // Accent
  accent: "var(--accent)",
  accentSoft: "var(--accent-muted)",
  accentDeep: "var(--accent-hover)",

  // Trạng thái
  danger: "var(--danger)",
  dangerSoft: "var(--danger-muted)",
  dangerBorder: "color-mix(in oklab, var(--danger) 25%, var(--surface))",
  warning: "var(--warning)",
  success: "var(--success)",

  // Lưới piano roll (phần vẽ bằng DOM; phần canvas xem `piano-roll.tsx`)
  gridBar: "color-mix(in oklab, var(--border) 70%, var(--surface))",
  gridRow: "color-mix(in oklab, var(--border) 40%, var(--surface))",

  mono: "var(--font-stave-mono)",
} as const;

/** Chiều cao các dải cố định trong mockup. */
export const DC_SIZE = {
  headerH: 60,
  toolStripH: 48,
  footerH: 34,
  trackPanelW: 262,
  historyPanelW: 322,
} as const;
