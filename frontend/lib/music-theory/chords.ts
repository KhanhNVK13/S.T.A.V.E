import type { DraftMeta } from "@stave/shared-types";
import {
  CHORD_SPECS,
  MAJOR_DEGREES,
  MINOR_DEGREES,
  MIN_PITCH_CLASSES_PER_BAR,
  PITCH_CLASS_NAMES,
  type ChordType,
} from "./constants";
import { isDrumTrack, pitchClass, ticksPerBar } from "./pitch-utils";

export interface BarChord {
  /** Ô nhịp 1-indexed. */
  bar: number;
  /** null = ô nhịp có ít hơn MIN_PITCH_CLASSES_PER_BAR lớp cao độ → để trống (rule 3). */
  root: number | null;
  /** Type hợp âm (trưởng/thứ/giảm/tăng/7...); null kèm root. */
  chordType: ChordType | null;
  /** Tên hiển thị ("C", "Am", "G7"); null khi để trống. */
  name: string | null;
}

export interface ChordAnalysis {
  chordsByBar: Map<number, BarChord>;
}

function chordName(root: number, suffix: string): string {
  return PITCH_CLASS_NAMES[root] + suffix;
}

/**
 * 3: hợp âm mỗi ô nhịp. Trọng số theo lớp cao độ (cộng duration); đối chiếu
 * 7 mẫu (trưởng, thứ, giảm, tăng, 7 thuộc, 7 trưởng, 7 thứ) cho cả 12 nốt
 * gốc; điểm = trọng số lớp trong mẫu − trọng số lớp ngoài mẫu; chọn mẫu
 * điểm cao nhất. Ô nhịp < MIN_PITCH_CLASSES_PER_BAR lớp cao độ → để trống.
 */
export function analyzeChords(
  meta: DraftMeta,
  notes: { pitch: number; duration: number; start: number; trackId: string }[],
  trackIds: string[],
  hasNotes: Set<string>,
  instruments: Map<string, string | null>,
): ChordAnalysis {
  const tpb = ticksPerBar(meta);
  const analyzable = new Set(
    trackIds.filter((id) => hasNotes.has(id) && !isDrumTrack(instruments.get(id) ?? null)),
  );
  const weighted = notes.filter((n) => analyzable.has(n.trackId));

  // Trọng số theo (ô nhịp, lớp cao độ).
  const perBarPc = new Map<number, Map<number, number>>();
  for (const n of weighted) {
    const bar = Math.floor(n.start / tpb) + 1;
    const pc = pitchClass(n.pitch);
    let m = perBarPc.get(bar);
    if (!m) {
      m = new Map();
      perBarPc.set(bar, m);
    }
    m.set(pc, (m.get(pc) ?? 0) + n.duration);
  }

  const chordsByBar = new Map<number, BarChord>();
  for (const [bar, pcWeights] of perBarPc.entries()) {
    const pcCount = pcWeights.size;
    if (pcCount < MIN_PITCH_CLASSES_PER_BAR) {
      chordsByBar.set(bar, { bar, root: null, chordType: null, name: null });
      continue;
    }

    let best:
      | {
          root: number;
          type: ChordType;
          suffix: string;
          score: number;
          pcsCount: number;
        }
      | null = null;
    for (let root = 0; root < 12; root++) {
      for (const spec of CHORD_SPECS) {
        const inPcs = new Set(spec.pcs.map((o) => (root + o) % 12));
        let score = 0;
        for (const [pc, w] of pcWeights) {
          score += inPcs.has(pc) ? w : -w;
        }
        // The vu.md score (inside − outside) ties a triad with its 7th-chord
        // superset (the extra member is unweighted). Tie-break: prefer the
        // simpler chord (fewer pitch classes) so a 3-note triad reads as a
        // triad, and only falls back to a 7th if that is strictly better.
        if (
          !best ||
          score > best.score ||
          (score === best.score && spec.pcs.length < best.pcsCount)
        ) {
          best = {
            root,
            type: spec.type,
            suffix: spec.suffix,
            score,
            pcsCount: spec.pcs.length,
          };
        }
      }
    }
    if (best) {
      chordsByBar.set(bar, {
        bar,
        root: best.root,
        chordType: best.type,
        name: chordName(best.root, best.suffix),
      });
    }
  }
  return { chordsByBar };
}

/** 4: đổi hợp âm thành bậc (số La Mã) theo tông; hợp âm ngoài tông ghi nguyên tên. */
export function toDiatonicNumerals(
  chordsByBar: Map<number, BarChord>,
  keyRoot: number,
  keyIsMinor: boolean,
): Map<number, string> {
  const degrees = keyIsMinor ? MINOR_DEGREES : MAJOR_DEGREES;
  const out = new Map<number, string>();
  for (const [bar, chord] of chordsByBar) {
    if (chord.root === null) continue;
    const relative = ((chord.root - keyRoot) % 12 + 12) % 12;
    const match = degrees.find(
      (d) => d.rootOffset === relative && d.type === chord.chordType,
    );
    out.set(bar, match ? match.numeral : chord.name ?? String(relative));
  }
  return out;
}
