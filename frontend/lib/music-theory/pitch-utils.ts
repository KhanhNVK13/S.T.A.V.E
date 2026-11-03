import type { DraftMeta } from "@stave/shared-types";

/**
 * UC-72 (1): ticks mỗi ô nhịp = ppq * tử/số * 4 (đúng công thức của
 * diff.service.ts — tính theo nhịp 4 phách, nhân hệ số tỷ lệ).
 */
export function ticksPerBar(meta: DraftMeta): number {
  const [numerator = 4, denominator = 4] = meta.timeSignature ?? [4, 4];
  const tp = (meta.ppq ?? 480) * (numerator / denominator) * 4;
  return Number.isFinite(tp) && tp > 0 ? tp : 1;
}

/** 1: nốt thuộc ô nhịp floor(start / ticksPerBar) + 1 (1-indexed). */
export function noteStartBar(startTicks: number, tpb: number): number {
  return Math.floor(startTicks / tpb) + 1;
}

/** Lớp cao độ (0..11), pitch 0..127 mod 12. */
export function pitchClass(pitch: number): number {
  return ((Math.round(pitch) % 12) + 12) % 12;
}

/** 1: bỏ track trống (không có nốt) và track bộ gõ khỏi phân tích. */
export function isDrumTrack(instrument: string | null): boolean {
  return instrument === "Standard Drum Kit" || instrument === "Orchestra Drum Kit";
}

/** Hệ số tương quan Pearson giữa hai mảng cùng độ dài. */
export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = a.length;
  if (n === 0) return 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  if (den === 0) return 0;
  return num / den;
}
