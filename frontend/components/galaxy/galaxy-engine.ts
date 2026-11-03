import type { GalaxyItem } from "./constellation";
import type { GalaxyPalette } from "./palette";

export interface GalaxyEngine {
  setItems(items: GalaxyItem[]): void;
  setActive(id: string | null): void;
  setPalette(palette: GalaxyPalette): void;
  dispose(): void;
}

/** Làm mượt độ sáng của từng chòm sao: nhanh lên chậm xuống kiểu "Glide". */
export function easeLevels(levels: number[], targets: number[], dt: number): boolean {
  let moving = false;
  const k = 1 - Math.exp(-dt * 5);
  for (let i = 0; i < levels.length; i++) {
    const next = levels[i] + (targets[i] - levels[i]) * k;
    levels[i] = Math.abs(targets[i] - next) < 0.005 ? targets[i] : next;
    if (levels[i] !== targets[i]) moving = true;
  }
  return moving;
}
