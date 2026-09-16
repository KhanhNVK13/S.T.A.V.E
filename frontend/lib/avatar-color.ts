/**
 * Màu avatar suy ra tất định từ id (hash đơn giản) — không dùng Math.random(),
 * để cùng 1 người/project luôn ra cùng 1 màu ở mọi lần render (CLAUDE.md 4.7).
 *
 * Chỉ dùng token semantic (accent/success/warning/danger/metal) thay vì bảng
 * màu Tailwind cố định: avatar phải đổi màu theo theme người dùng chọn
 * (preset hoặc palette trích từ ảnh — UC-79), không được neo vào 1 gam màu
 * riêng nằm ngoài hệ token.
 */
const AVATAR_PALETTE = [
  { bg: "bg-accent-muted", text: "text-accent" },
  { bg: "bg-success-muted", text: "text-success" },
  { bg: "bg-warning-muted", text: "text-warning" },
  { bg: "bg-danger-muted", text: "text-danger" },
  { bg: "bg-metal-muted", text: "text-metal" },
] as const;

export function colorFromId(id: string): (typeof AVATAR_PALETTE)[number] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
