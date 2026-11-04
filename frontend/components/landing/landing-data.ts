/** Dữ liệu MẪU minh hoạ cho trang chủ (không phải dự án thật). */

export interface SampleCommit {
  hash: string;
  msg: string;
  author: string;
  when: string;
  ago: string;
}

export const SAMPLE_COMMITS: SampleCommit[] = [
  { hash: "e41b9a0", msg: "Chord frame Am – F – C – G", author: "Khanh", when: "Oct 12", ago: "2 weeks ago" },
  { hash: "7c03d5e", msg: "Add a root-note bass line", author: "Khanh", when: "Oct 14", ago: "2 weeks ago" },
  { hash: "b92af61", msg: "Verse melody, bars 1–2", author: "Minh Anh", when: "Oct 18", ago: "12 days ago" },
  { hash: "3fd81c7", msg: "Melody bars 3–4, remove duplicate notes on the C chord", author: "Minh Anh", when: "Oct 21", ago: "9 days ago" },
  { hash: "a58e204", msg: "Shift bass back half a beat for swing", author: "Khanh", when: "Oct 26", ago: "4 days ago" },
  { hash: "d70c9b3", msg: "Normalize velocity for pad and melody", author: "Khanh", when: "Oct 29", ago: "yesterday" },
];

export interface SampleNote {
  id: number;
  t: number;
  s: number;
  d: number;
  p: number;
  born: number;
  died: number | null;
  chg: number | null;
}

export function buildSampleSong(): SampleNote[] {
  const notes: SampleNote[] = [];
  let id = 0;
  const add = (t: number, s: number, d: number, p: number, born: number, extra?: Partial<SampleNote>) => {
    const n: SampleNote = { id: id++, t, s, d, p, born, died: null, chg: null, ...extra };
    notes.push(n);
    return n;
  };
  const chords = [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]];
  const roots = [45, 41, 48, 43];
  chords.forEach((ch, bar) => {
    ch.forEach((p) => {
      const n = add(0, bar * 16, 16, p, 0);
      if (bar === 2 && p === 64) n.died = 3;
      if (bar < 2) n.chg = 5;
    });
  });
  roots.forEach((r, bar) => {
    const shifted = bar === 1 || bar === 2;
    const steps: [number, number, number][] = [[0, 6, r], [8, 4, r], [12, 4, r + 7]];
    steps.forEach(([off, dur, pitch]) => {
      if (!shifted) add(1, bar * 16 + off, dur, pitch, 1);
      else {
        add(1, bar * 16 + off, dur, pitch, 1, { died: 4 });
        add(1, bar * 16 + off + 2, Math.max(2, dur - 2), pitch, 4);
      }
    });
  });
  const mel: [number, number, number][][] = [
    [[0, 4, 72], [4, 2, 74], [6, 2, 76], [8, 6, 72]],
    [[16, 4, 69], [20, 4, 72], [24, 8, 71]],
    [[32, 4, 72], [36, 2, 76], [38, 2, 77], [40, 6, 76]],
    [[48, 6, 74], [54, 2, 72], [56, 8, 69]],
  ];
  mel.forEach((bar, i) => {
    bar.forEach(([s, d, p]) => {
      const o = add(2, s, d, p, i < 2 ? 2 : 3);
      if (i === 1) o.chg = 5;
    });
  });
  return notes;
}

function alive(n: SampleNote, k: number): boolean {
  return n.born <= k && (n.died === null || n.died > k);
}

export type NoteClass = "n-dim" | "n-add" | "n-del" | "n-mod";

export function diffClass(n: SampleNote, from: number, to: number): NoteClass | null {
  const a = alive(n, from);
  const b = alive(n, to);
  if (a && b) return n.chg !== null && n.chg > from && n.chg <= to ? "n-mod" : "n-dim";
  if (b) return "n-add";
  if (a) return "n-del";
  return null;
}

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
