export const TRACK_COLOR_PALETTE = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
  "#f97316", "#84cc16", "#06b6d4", "#a855f7",
];

export function nextTrackColor(usedColors: readonly string[]): string {
  const used = new Set(usedColors.map((c) => c.toLowerCase()));
  const free = TRACK_COLOR_PALETTE.find((c) => !used.has(c));
  return free ?? TRACK_COLOR_PALETTE[usedColors.length % TRACK_COLOR_PALETTE.length];
}
