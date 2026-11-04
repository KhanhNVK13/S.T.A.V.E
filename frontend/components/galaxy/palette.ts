import { resolveCssColors } from "../../lib/resolve-css-colors";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface GalaxyPalette {
  star: Rgb;
  link: Rgb;
  active: Rgb;
}

export function toRgb(css: string): Rgb {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { r: 1, g: 1, b: 1 };
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return { r: r / 255, g: g / 255, b: b / 255 };
}

export function rgba({ r, g, b }: Rgb, alpha: number): string {
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
}

/** Màu cảnh sao lấy từ token, không hardcode hex. */
export function readGalaxyPalette(): GalaxyPalette {
  const css = resolveCssColors({
    star: "var(--foreground)",
    link: "var(--muted-foreground)",
    active: "var(--accent)",
  });
  return { star: toRgb(css.star), link: toRgb(css.link), active: toRgb(css.active) };
}
