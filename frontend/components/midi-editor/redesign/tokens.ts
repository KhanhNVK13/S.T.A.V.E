/**
 * redesign/tokens.ts
 * Giá trị lấy trực tiếp từ mã nguồn thiết kế thật:
 *   docs/STAVE design component sample/STAVE design component/STAVE.dc.html
 *   (screen "editor", dòng 156–317 — cả 5 bản export trong thư mục đó giống
 *   hệt nhau, đã verify bằng md5)
 *
 * Cố ý KHÔNG dùng lại token của UI gốc (zinc/indigo nền tối) — đây là bảng
 * màu riêng của bản redesign. Trùng khớp với accent-700/accent-900 trong
 * globals.css là do design system của app vốn được rút ra từ chính mockup này.
 */
export const DC = {
  // Nền & bề mặt
  pageBg: "#F7F7F5",
  surface: "#ffffff",
  rulerBg: "#FBFBF9",

  // Viền
  border: "#E3E4E8",
  borderSoft: "#F0F0EE",
  borderSofter: "#F2F2F0",

  // Chữ
  text: "#1F2126",
  textMuted: "#8A8D93",

  // Accent (khớp accent-700 / accent-900 trong globals.css)
  accent: "#1D4ED8",
  accentSoft: "#EEF2FF",
  accentDeep: "#0F2A5C",

  // Trạng thái
  danger: "#B3242E",
  dangerSoft: "#FCF3F3",
  dangerBorder: "#F0D2D4",
  warning: "#E8B923",
  success: "#16a34a",

  // Lưới piano roll
  gridBar: "#E6E6E2",
  gridRow: "#F3F3F1",

  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const;

/** Chiều cao các dải cố định trong mockup. */
export const DC_SIZE = {
  headerH: 60,
  toolStripH: 48,
  footerH: 34,
  trackPanelW: 262,
  historyPanelW: 322,
} as const;
