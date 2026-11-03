export type SkyColors = {
  star: [number, number, number];
  accent: [number, number, number];
  branch: [number, number, number];
  background: [number, number, number];
};

export interface SkyEngine {
  kind: "webgl" | "canvas2d";
  start(): void;
  setProgress(p: number): void;
  pulse(i: number): void;
  dispose(): void;
}

export const GALAXY_COUNT = 7;

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
