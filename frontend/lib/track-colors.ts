export const TRACK_COLOR_PALETTE = [
  "#6366f1", "#ec4899", "#d946ef", "#10b981",
  "#94a3b8", "#d4a373", "#8b5cf6", "#14b8a6",
  "#fda4af", "#84cc16", "#06b6d4", "#a855f7",
];

export const SYSTEM_MEANING_COLORS = ["#3b82f6", "#ef4444", "#f59e0b"] as const;

export function nextTrackColor(usedColors: readonly string[]): string {
  const used = new Set(usedColors.map((c) => c.toLowerCase()));
  const free = TRACK_COLOR_PALETTE.find((c) => !used.has(c));
  return free ?? TRACK_COLOR_PALETTE[usedColors.length % TRACK_COLOR_PALETTE.length];
}
