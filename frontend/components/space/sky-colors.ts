import { resolveCssColors } from "../../lib/resolve-css-colors";
import type { SkyColors } from "./sky-types";

const BRANCH_FALLBACK = "#4fd6c4";

function toRgb(css: string): [number, number, number] {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [255, 255, 255];
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#ffffff";
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

export function readSkyColors(): SkyColors {
  const css = resolveCssColors({
    star: "var(--foreground)",
    accent: "var(--accent)",
    branch: BRANCH_FALLBACK,
    background: "var(--background)",
  });
  return {
    star: toRgb(css.star),
    accent: toRgb(css.accent),
    branch: toRgb(css.branch),
    background: toRgb(css.background),
  };
}

export function rgba(c: [number, number, number], a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
