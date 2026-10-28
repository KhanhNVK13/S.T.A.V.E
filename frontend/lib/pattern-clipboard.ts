import type { PatternClipboard } from "./paste-pattern";

const STORAGE_KEY = "stave_pattern_clipboard";

let current: PatternClipboard | null = null;

function isClipboard(value: unknown): value is PatternClipboard {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PatternClipboard>;
  return (
    Array.isArray(candidate.notes) &&
    Array.isArray(candidate.tracks) &&
    typeof candidate.ppq === "number" &&
    candidate.ppq > 0
  );
}

export function getPatternClipboard(): PatternClipboard | null {
  if (current) return current;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isClipboard(parsed) && parsed.notes.length > 0) {
      current = parsed;
      return current;
    }
  } catch {}
  return null;
}

export function setPatternClipboard(value: PatternClipboard): void {
  current = value;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {}
}
