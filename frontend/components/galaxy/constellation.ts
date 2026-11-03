export interface GalaxyItem {
  id: string;
  weight: number;
}

export interface LaidOutStar {
  x: number;
  y: number;
  z: number;
  size: number;
  phase: number;
}

export interface LaidOutConstellation {
  id: string;
  cx: number;
  cy: number;
  stars: LaidOutStar[];
  links: Array<[number, number]>;
  staffY: number[];
  staffHalf: number;
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STAFF_LINES = [-2, -1, 0, 1, 2];

/** Độ sáng 0..1 của một dự án, suy từ lượt nghe + fork (thang log để dự án nhỏ vẫn thấy được). */
export function weightOf(playCount: number, forkCount: number): number {
  return Math.min(1, Math.log10(1 + playCount + forkCount * 4) / 3);
}

/**
 * Dàn chòm sao của mọi dự án trên một khung có nửa chiều cao = 1 và x ∈ [-aspect, aspect].
 * Hình dạng mỗi chòm sao suy từ id nên luôn giống nhau giữa các lần tải.
 */
export function layoutGalaxy(items: GalaxyItem[], aspect: number): LaidOutConstellation[] {
  const count = items.length;
  if (count === 0) return [];
  const cols = count <= 6 ? 2 : aspect >= 1.4 ? 4 : 3;
  const rows = Math.ceil(count / cols);
  const cellW = (2 * aspect) / cols;
  const cellH = Math.min((2 / rows) * 0.98, 0.5);
  const width = cellW * 0.78;
  const step = Math.min(cellH * 0.1, width * 0.045);

  return items.map((item, i) => {
    const rand = seeded(hashString(item.id));
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = -aspect + (col + 0.5) * cellW + (rand() - 0.5) * cellW * 0.06;
    const cy = (rows * cellH) / 2 - (row + 0.5) * cellH;
    const base = 0.009 * (0.85 + item.weight * 0.75);
    const total = 5 + Math.floor(rand() * 4);

    const stars: LaidOutStar[] = [];
    const links: Array<[number, number]> = [];
    for (let j = 0; j < total; j++) {
      stars.push({
        x: cx + (j / (total - 1) - 0.5) * width,
        y: cy + Math.round(rand() * 6 - 3) * 0.5 * step,
        z: (rand() - 0.5) * 0.3,
        size: base * (0.8 + rand() * 0.5),
        phase: rand(),
      });
      if (j > 0) links.push([j - 1, j]);
    }

    const fork = 1 + Math.floor(rand() * (total - 3));
    let previous = fork;
    for (let b = 1; b <= 2 + Math.floor(rand() * 2); b++) {
      stars.push({
        x: stars[fork].x + b * width * 0.085,
        y: stars[fork].y - step * (0.9 + b * 0.85),
        z: (rand() - 0.5) * 0.3,
        size: base * 0.75,
        phase: rand(),
      });
      links.push([previous, stars.length - 1]);
      previous = stars.length - 1;
    }

    return {
      id: item.id,
      cx,
      cy,
      stars,
      links,
      staffY: STAFF_LINES.map((line) => cy + line * step),
      staffHalf: width * 0.58,
    };
  });
}
