/**
 * Màu avatar suy ra tất định từ id (hash đơn giản) — không dùng Math.random(),
 * để cùng 1 người/project luôn ra cùng 1 màu ở mọi lần render (CLAUDE.md 4.7).
 *
 * Chỉ dùng token semantic (accent/success/warning/danger/metal), chữ trên nền
 * muted dùng bản -foreground để đạt tương phản >= 4.5:1; không dùng bảng màu
 * Tailwind cố định.
 */
const AVATAR_PALETTE = [
  { bg: "bg-accent-muted", text: "text-accent" },
  { bg: "bg-success-muted", text: "text-success-foreground" },
  { bg: "bg-warning-muted", text: "text-warning-foreground" },
  { bg: "bg-danger-muted", text: "text-danger" },
  { bg: "bg-metal-muted", text: "text-metal-foreground" },
] as const;

export function colorFromId(id: string): (typeof AVATAR_PALETTE)[number] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
