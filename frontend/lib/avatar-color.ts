/**
 * Màu avatar suy ra tất định từ id (hash đơn giản) — không dùng Math.random(),
 * để cùng 1 người/project luôn ra cùng 1 màu ở mọi lần render (CLAUDE.md 4.7).
 */
const AVATAR_PALETTE = [
  { bg: "bg-blue-100", text: "text-blue-700" },
  { bg: "bg-indigo-100", text: "text-indigo-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-rose-100", text: "text-rose-700" },
  { bg: "bg-violet-100", text: "text-violet-700" },
  { bg: "bg-cyan-100", text: "text-cyan-700" },
  { bg: "bg-orange-100", text: "text-orange-700" },
] as const;

export function colorFromId(id: string): (typeof AVATAR_PALETTE)[number] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
