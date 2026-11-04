import { tNow } from "../i18n";
import type { DraftSnapshot } from "@stave/shared-types";
import {
  CADENCE_SPECS,
  MIN_NOTES,
  MIN_NOTE_BARS,
  PROGRESSION_PATTERNS,
} from "./constants";
import { detectKey } from "./key";
import { analyzeChords, toDiatonicNumerals } from "./chords";
import { isDrumTrack, ticksPerBar } from "./pitch-utils";

export interface Insight {
  id: string;
  kind: "key" | "progression" | "cadence";
  title: string;
  description: string;
  fromBar: number | null;
  toBar: number | null;
  alternatives?: string[];
}

export interface InsightAnalysis {
  /** 2.E1: dưới 8 nốt hoặc dưới 2 ô nhịp có nốt → UI hiện "Chưa đủ nốt để nhận diện". */
  insufficient: boolean;
  /** 3.E1: không có insight nào (kể cả tông) → UI hiện "Chưa nhận ra mẫu nào". */
  insights: Insight[];
}

export interface AnalyzeContext {
  snapshot: DraftSnapshot;
  hasNotes: Set<string>;
  instruments: Map<string, string | null>;
  notes: { pitch: number; duration: number; start: number; trackId: string }[];
  tpb: number;
}

/**
 * 1: chuẩn bị — bỏ track trống/bộ gõ, tính ticks mỗi ô nhịp.
 * Dùng chung cho nhận diện tông / hợp âm / tiến trình.
 */
export function buildContext(snapshot: DraftSnapshot): AnalyzeContext {
  const hasNotes = new Set<string>();
  for (const n of snapshot.notes) hasNotes.add(n.trackId);
  const instruments = new Map<string, string | null>(
    snapshot.tracks.map((t) => [t.id, t.instrument]),
  );
  const notes = snapshot.notes.filter(
    (n) => hasNotes.has(n.trackId) && !isDrumTrack(instruments.get(n.trackId) ?? null),
  );
  return {
    snapshot,
    hasNotes,
    instruments,
    notes,
    tpb: ticksPerBar(snapshot.meta),
  };
}

function firstBar(ctx: AnalyzeContext): number {
  let min = Infinity;
  for (const n of ctx.notes) {
    const bar = Math.floor(n.start / ctx.tpb) + 1;
    if (bar < min) min = bar;
  }
  // Called only after the insufficiency guard (ctx.notes non-empty) → finite.
  return Number.isFinite(min) ? min : 1;
}

function lastBar(ctx: AnalyzeContext): number {
  let max = 0;
  for (const n of ctx.notes) {
    const bar = Math.floor(n.start / ctx.tpb) + 1;
    if (bar > max) max = bar;
  }
  return max;
}

/** 5: trượt cửa sổ qua các ô nhịp có số La Mã, đánh dấu vị trí khớp mẫu. */
function progressionMatches(
  numeralsByBar: Map<number, string>,
): Map<string, { fromBar: number; toBar: number }> {
  const entries = [...numeralsByBar.entries()].sort((a, b) => a[0] - b[0]);
  const bars = entries.map((e) => e[0]);
  const numerals = entries.map((e) => e[1]);
  const out = new Map<string, { fromBar: number; toBar: number }>();
  for (const p of PROGRESSION_PATTERNS) {
    let found: { fromBar: number; toBar: number } | null = null;
    const len = p.numerals.length;
    for (let i = 0; i + len <= numerals.length; i++) {
      // Hợp âm của các ô nhịp trống/không nhận ra bị bỏ khỏi chuỗi, nên cửa sổ
      // chỉ hợp lệ khi các ô nhịp đó liền nhau.
      if (bars[i + len - 1] - bars[i] !== len - 1) continue;
      let hit = true;
      for (let j = 0; j < len; j++) {
        if (numerals[i + j] !== p.numerals[j]) {
          hit = false;
          break;
        }
      }
      if (hit) {
        found = { fromBar: bars[i], toBar: bars[i + len - 1] };
        break;
      }
    }
    if (found) out.set(p.id, found);
  }
  return out;
}

/**
 * UC-72 (BR-82): nhận diện tông, hợp âm từng ô nhịp, bậc La Mã, tiến
 * trình và kết của bản nhạc. Kết quả là danh sách `Insight` — CHỈ mô tả
 * những gì đã có, không bao giờ gợi ý sửa.
 */
export function analyze(snapshot: DraftSnapshot): InsightAnalysis {
  const ctx = buildContext(snapshot);

  // 2.E1: quá ít nốt / quá ít ô nhịp có nốt.
  const noteBars = new Set(ctx.notes.map((n) => Math.floor(n.start / ctx.tpb) + 1));
  if (ctx.notes.length < MIN_NOTES || noteBars.size < MIN_NOTE_BARS) {
    return { insufficient: true, insights: [] };
  }

  const insights: Insight[] = [];
  const first = firstBar(ctx);
  const last = lastBar(ctx);

  // 2: tông.
  const key = detectKey(
    ctx.snapshot.meta,
    ctx.notes,
    ctx.snapshot.tracks.map((t) => t.id),
    ctx.hasNotes,
    ctx.instruments,
  );
  insights.push({
    id: "key",
    kind: "key",
    title: tNow("theory.keyTitle", { key: key.primary }),
    description: tNow("theory.keyDesc", { key: key.primary }),
    fromBar: first,
    toBar: last,
    alternatives: key.alternative ? [key.alternative] : undefined,
  });

  // 3 + 4: hợp âm theo ô nhịp, đổi thành bậc La Mã.
  const { chordsByBar } = analyzeChords(
    ctx.snapshot.meta,
    ctx.notes,
    ctx.snapshot.tracks.map((t) => t.id),
    ctx.hasNotes,
    ctx.instruments,
  );
  const numeralsByBar = toDiatonicNumerals(chordsByBar, key.root, key.isMinor);

  // 5: tiến trình (trượt cửa sổ qua các ô nhịp liên tiếp có bậc).
  for (const [patternId, range] of progressionMatches(numeralsByBar)) {
    const pattern = PROGRESSION_PATTERNS.find((p) => p.id === patternId);
    if (!pattern) continue;
    insights.push({
      id: `progression-${patternId}`,
      kind: "progression",
      title: tNow("theory.progTitle", { numerals: pattern.numerals.join("–") }),
      description: tNow(pattern.description),
      fromBar: range.fromBar,
      toBar: range.toBar,
    });
  }

  // 6: kết (cadence) ở cuối mỗi đoạn liền nhau (ô nhịp cuối hoặc trước khoảng nghỉ).
  const defined = [...numeralsByBar.entries()].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < defined.length; i++) {
    const [fromBarNo, fromNumeral] = defined[i - 1];
    const [toBarNo, toNumeral] = defined[i];
    if (toBarNo - fromBarNo !== 1) continue;
    const endsPhrase = i === defined.length - 1 || defined[i + 1][0] - toBarNo !== 1;
    if (!endsPhrase) continue;
    const cadence = CADENCE_SPECS.find((c) => c.from === fromNumeral && c.to === toNumeral);
    if (cadence) {
      insights.push({
        id: `cadence-${cadence.id}-${fromBarNo}`,
        kind: "cadence",
        title: tNow(cadence.title),
        description: tNow(cadence.description),
        fromBar: fromBarNo,
        toBar: toBarNo,
      });
    }
  }

  return { insufficient: false, insights };
}
