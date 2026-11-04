import { tNow } from "../i18n";
import type { DraftMeta } from "@stave/shared-types";
import {
  KEY_AMBIGUITY_THRESHOLD,
  KS_MAJOR_PROFILE,
  KS_MINOR_PROFILE,
  PITCH_CLASS_NAMES,
} from "./constants";
import { isDrumTrack, pitchClass, pearsonCorrelation } from "./pitch-utils";

/** 2: biểu đồ lớp cao độ (12 ô) cộng trọng số bằng duration. */
export function pitchClassHistogram(
  notes: { pitch: number; duration: number }[],
): number[] {
  const h = new Array<number>(12).fill(0);
  for (const n of notes) h[pitchClass(n.pitch)] += n.duration;
  return h;
}

export interface KeyResult {
  /** Tông mạnh nhất (ví dụ "C trưởng"). */
  primary: string;
  /** Tông gốc (0..11). */
  root: number;
  /** true = thứ, false = trưởng. */
  isMinor: boolean;
  /** Khả năng thứ hai (3.E2), null nếu không khả thi / không gần. */
  alternative: string | null;
  /** Tương quan của tông chính. */
  correlation: number;
}

function keyLabel(root: number, isMinor: boolean): string {
  return `${PITCH_CLASS_NAMES[root]} ${isMinor ? tNow("theory.minor") : tNow("theory.major")}`;
}

/**
 * 2: nhận diện tông bằng Krumhansl–Schmuckler trên 24 hồ sơ (12 trưởng +
 * 12 thứ), chọn tương quan Pearson cao nhất. Tông tốt thứ hai chỉ hiện khi
 * chênh dưới KEY_AMBIGUITY_THRESHOLD (3.E2).
 *
 * `hasNotes` (trackId -> true) dùng để bỏ track trống; `instruments`
 * (trackId -> tên) bỏ track bộ gõ.
 */
export function detectKey(
  meta: DraftMeta,
  notes: { pitch: number; duration: number; trackId: string }[],
  trackIds: string[],
  hasNotes: Set<string>,
  instruments: Map<string, string | null>,
): KeyResult {
  void meta; // giữ tham số để khớp chữ ký module (ticks không dùng ở đây)
  const analyzable = new Set(
    trackIds.filter((id) => hasNotes.has(id) && !isDrumTrack(instruments.get(id) ?? null)),
  );
  const hist = pitchClassHistogram(notes.filter((n) => analyzable.has(n.trackId)));

  const scored: { root: number; minor: boolean; r: number }[] = [];
  for (let root = 0; root < 12; root++) {
    const major = rotated(KS_MAJOR_PROFILE, root);
    const minor = rotated(KS_MINOR_PROFILE, root);
    scored.push({ root, minor: false, r: pearsonCorrelation(hist, major) });
    scored.push({ root, minor: true, r: pearsonCorrelation(hist, minor) });
  }
  scored.sort((a, b) => b.r - a.r);
  const top = scored[0];
  const second = scored[1];
  const alt = top.r - second.r < KEY_AMBIGUITY_THRESHOLD ? keyLabel(second.root, second.minor) : null;

  return {
    primary: keyLabel(top.root, top.minor),
    root: top.root,
    isMinor: top.minor,
    alternative: alt,
    correlation: top.r,
  };
}

/** Xoay hồ sơ về nốt gốc (chỉ số 0 của hồ sơ = nốt gốc). */
function rotated(profile: number[], root: number): number[] {
  const out = new Array<number>(12);
  for (let i = 0; i < 12; i++) out[(i + root) % 12] = profile[i];
  return out;
}
