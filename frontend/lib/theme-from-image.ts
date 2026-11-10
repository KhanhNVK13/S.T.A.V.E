// UC-79 — sinh theme (bảng màu trang trí) từ 1 ảnh, hoàn toàn trên trình
// duyệt. Không dùng thư viện màu bên ngoài: các phép chuyển đổi sRGB ↔ OKLCH
// và độ tương phản WCAG được viết tay theo công thức chuẩn Oklab/Oklch
// (Björn Ottosson) và WCAG 2.1.
//
// BR-90: chỉ tạo 10 biến trang trí (PALETTE_KEYS), không đụng --accent/--
// success/--warning/--danger.
// BR-91: không lấy độ sáng từ ảnh — giữ nguyên L/C của preset "space" hiện
// hành, chỉ thay sắc độ H (trích từ ảnh) rồi đảm bảo tương phản chữ >= 4.5:1.

import {
  PALETTE_KEYS,
  type Palette,
  type PaletteKey,
} from "@stave/shared-types";

export type ThemeFromImageErrorCode = "not_enough_color" | "no_pixels";

export class ThemeFromImageError extends Error {
  code: ThemeFromImageErrorCode;

  constructor(code: ThemeFromImageErrorCode) {
    super(code);
    this.code = code;
    this.name = "ThemeFromImageError";
  }
}

/** Một điểm ảnh RGB, mỗi kênh 0..255. */
export type Rgb = [number, number, number];

/** Một điểm trong hệ OKLCH: L 0..1, C 0..0.4, H 0..<360 (độ). */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** Một cụm màu sau khi phân cụm. */
export interface ColorCluster {
  color: Rgb;
  /** chroma của màu đại diện (0..0.4). */
  chroma: number;
  /** tỉ lệ điểm ảnh thuộc cụm so với tổng (0..1). */
  share: number;
}

// ---------------------------------------------------------------------------
// Chuyển đổi sRGB <-> OKLCH (Oklab/Oklch chuẩn).
// ---------------------------------------------------------------------------

function linearize(channel01: number): number {
  const v = channel01;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function gammaEncode(v: number): number {
  const x = Math.max(0, Math.min(1, v));
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

const DEGREE = Math.PI / 180;

/** RGB 0..255 -> OKLCH (L 0..1, C, H 0..<360). */
export function srgbToOklch(r: number, g: number, b: number): Oklch {
  const R = linearize(clampByte(r) / 255);
  const G = linearize(clampByte(g) / 255);
  const B = linearize(clampByte(b) / 255);

  const l_ = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m_ = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s_ = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;

  const lSt = Math.cbrt(l_);
  const mSt = Math.cbrt(m_);
  const sSt = Math.cbrt(s_);
  const L = 0.2104542553 * lSt + 0.793617785 * mSt - 0.0040720468 * sSt;
  const a = 1.9779984951 * lSt - 2.428592205 * mSt + 0.4505937099 * sSt;
  const bO = 0.0259040371 * lSt + 0.7827717662 * mSt - 0.808675766 * sSt;

  let h = Math.atan2(bO, a) / DEGREE;
  if (h < 0) h += 360;
  const c = Math.sqrt(a * a + bO * bO);

  return { l: clampUnit(L), c: clampChroma(c), h: normalizeHue(h) };
}

/** OKLCH (L 0..1, C, H) -> RGB 0..255 (clamp). */
export function oklchToSrgb(l: number, c: number, h: number): Rgb {
  const lC = clampUnit(l);
  const cC = clampChroma(c);
  const hC = normalizeHue(h);

  const a = cC * Math.cos(hC * DEGREE);
  const bO = cC * Math.sin(hC * DEGREE);

  const l_ = lC + 0.3963377774 * a + 0.2158037573 * bO;
  const m_ = lC - 0.1055613458 * a - 0.0638541728 * bO;
  const s_ = lC - 0.0894841775 * a - 1.291485548 * bO;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const R = gammaEncode(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3);
  const G = gammaEncode(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3);
  const B = gammaEncode(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3);

  return [
    Math.round(clampByte(R) * 255),
    Math.round(clampByte(G) * 255),
    Math.round(clampByte(B) * 255),
  ];
}

// ---------------------------------------------------------------------------
// Độ tương phản WCAG 2.1.
// ---------------------------------------------------------------------------

/** Relative luminance (WCAG) của RGB 0..255, kết quả 0..1. */
export function relativeLuminance(r: number, g: number, b: number): number {
  const srgbToLinear = (v: number) => {
    const x = clampByte(v) / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Tỉ số tương phản WCAG của 2 màu RGB 0..255, luôn trong [1, 21]. */
export function contrastRatio(rgb1: Rgb, rgb2: Rgb): number {
  const l1 = relativeLuminance(rgb1[0], rgb1[1], rgb1[2]);
  const l2 = relativeLuminance(rgb2[0], rgb2[1], rgb2[2]);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  const ratio = (hi + 0.05) / (lo + 0.05);
  return Math.max(1, Math.min(21, ratio));
}

// ---------------------------------------------------------------------------
// Phân cụm màu (k-means, không thư viện).
// ---------------------------------------------------------------------------

/** Gom pixels thành tối đa `k` cụm. Trả các cụm có màu đại diện, chroma, tỉ lệ. */
export function clusterColors(
  pixels: Rgb[],
  k = 5,
): ColorCluster[] {
  if (pixels.length === 0) return [];

  // Chọn tâm khởi đầu bằng cách lấy đều dọc mảng (xác định, không random).
  const centers: Rgb[] = [];
  const step = Math.max(1, Math.floor(pixels.length / k));
  for (let i = 0; i < k; i += 1) {
    const idx = Math.min(i * step, pixels.length - 1);
    centers.push([pixels[idx][0], pixels[idx][1], pixels[idx][2]]);
  }

  // Chạy k-means vài vòng đủ hội tụ.
  const labels = new Array<number>(pixels.length).fill(0);
  for (let iter = 0; iter < 10; iter += 1) {
    for (let p = 0; p < pixels.length; p += 1) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centers.length; c += 1) {
        const d = distSq(pixels[p], centers[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      labels[p] = best;
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let p = 0; p < pixels.length; p += 1) {
      const t = sums[labels[p]];
      const px = pixels[p];
      t[0] += px[0];
      t[1] += px[1];
      t[2] += px[2];
      t[3] += 1;
    }
    for (let c = 0; c < centers.length; c += 1) {
      if (sums[c][3] > 0) {
        centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      }
    }
  }

  const counts = new Array<number>(centers.length).fill(0);
  for (let p = 0; p < pixels.length; p += 1) counts[labels[p]] += 1;

  const total = pixels.length;
  return centers
    .map((color, c) => {
      const rgb: Rgb = [Math.round(color[0]), Math.round(color[1]), Math.round(color[2])];
      const { c: chroma } = srgbToOklch(rgb[0], rgb[1], rgb[2]);
      return { color: rgb, chroma, share: counts[c] / total };
    })
    .filter((c) => c.share > 0)
    .sort((a, b) => b.share - a.share);
}

// ---------------------------------------------------------------------------
// Chọn sắc độ.
// ---------------------------------------------------------------------------

/** h1 = hue của cụm (chroma × share) lớn nhất; h2 = cụm kế tiếp cách h1 >= 30°. */
export function pickHues(clusters: ColorCluster[]): { h1: number; h2: number } {
  const ranked = clusters.slice().sort(
    (a, b) => b.chroma * b.share - a.chroma * a.share,
  );
  if (ranked.length === 0) return { h1: 0, h2: 30 };

  const h1 = hueOf(ranked[0]);

  // Tìm h2: cụm kế tiếp có hue cách h1 >= 30°. Không có thì h2 = h1 + 30°.
  let h2 = (h1 + 30) % 360;
  for (const cl of ranked.slice(1)) {
    const hue = hueOf(cl);
    if (angularDistance(hue, h1) >= 30) {
      h2 = hue;
      break;
    }
  }
  return { h1, h2 };
}

// ---------------------------------------------------------------------------
// Sinh bảng màu + đảm bảo tương phản.
// ---------------------------------------------------------------------------

/**
 * Độ sáng/sắc (L, C) tham chiếu lấy từ preset "space" hiện hành
 * (`frontend/app/globals.css`, khối `:root`). Chỉ thay sắc độ H (từ ảnh); L/C
 * giữ nguyên nên độ tương phản được bảo đảm ngay từ thiết kế. Nhóm "neutral"
 * dùng h1, nhóm "metal" dùng h2.
 */
const THEME_REFERENCE_TOKENS: Record<PaletteKey, { l: number; c: number; group: "neutral" | "metal" }> = {
  "--background": { l: 0.14, c: 0.022, group: "neutral" },
  "--surface": { l: 0.19, c: 0.03, group: "neutral" },
  "--surface-subtle": { l: 0.23, c: 0.035, group: "neutral" },
  "--surface-muted": { l: 0.25, c: 0.04, group: "neutral" },
  "--foreground": { l: 0.95, c: 0.012, group: "neutral" },
  "--muted-foreground": { l: 0.83, c: 0.03, group: "neutral" },
  "--border": { l: 0.34, c: 0.04, group: "neutral" },
  "--border-strong": { l: 0.54, c: 0.05, group: "neutral" },
  "--metal": { l: 0.82, c: 0.07, group: "metal" },
  "--metal-muted": { l: 0.24, c: 0.03, group: "metal" },
};

/** `oklch(L C H)` — L, C tối đa 4 chữ số thập phân; H tối đa 2. */
export function formatOklch(l: number, c: number, h: number): string {
  const L = roundTo(l, 4);
  const C = roundTo(c, 4);
  let H = roundTo(normalizeHue(h), 2);
  if (H >= 360) H = 359.99;
  return `oklch(${L} ${C} ${H})`;
}

/** Chép L/C tham chiếu, thay H: h1 cho 8 biến trung tính, h2 cho 2 biến kim loại. */
export function buildPalette(h1: number, h2: number): Palette {
  const palette = {} as Palette;
  for (const key of PALETTE_KEYS) {
    const ref = THEME_REFERENCE_TOKENS[key];
    const hue = ref.group === "metal" ? h2 : h1;
    palette[key] = formatOklch(ref.l, ref.c, hue);
  }
  return palette;
}

const MIN_CONTRAST = 4.5;

/**
 * Chỉnh L của chữ (`--foreground`, `--muted-foreground`) để đạt >= 4.5:1:
 * - foreground/background >= 4.5:1
 * - muted-foreground/background >= 4.5:1
 * - foreground/surface >= 4.5:1
 */
export function ensureContrast(palette: Palette): Palette {
  const bgRgb = oklchToSrgbFromToken(palette["--background"]);
  const surfaceRgb = oklchToSrgbFromToken(palette["--surface"]);
  const bgLum = relativeLuminance(bgRgb[0], bgRgb[1], bgRgb[2]);
  const surfaceLum = relativeLuminance(surfaceRgb[0], surfaceRgb[1], surfaceRgb[2]);

  const adjusted = { ...palette };

  // foreground phải đạt với cả background lẫn surface => so với lum nền lớn hơn.
  const fgToken = parseOklch(adjusted["--foreground"]);
  const targetFgLum = Math.max(bgLum, surfaceLum);
  adjusted["--foreground"] = formatOklch(
    ensureTextContrast(fgToken, targetFgLum),
    fgToken.c,
    fgToken.h,
  );

  // muted-foreground chỉ cần với background.
  const mutedToken = parseOklch(adjusted["--muted-foreground"]);
  adjusted["--muted-foreground"] = formatOklch(
    ensureTextContrast(mutedToken, bgLum),
    mutedToken.c,
    mutedToken.h,
  );

  return adjusted;
}

/** Tăng/giảm L của chữ (giữ C, H) tới khi contrast với nền (theo luminance) đạt. */
function ensureTextContrast(text: Oklch, bgLum: number): number {
  const textLum0 = luminanceOf(text);
  const textLighter = textLum0 >= bgLum;
  let l = text.l;
  for (let i = 0; i < 400; i += 1) {
    const lum = luminanceOf({ ...text, l });
    const hi = Math.max(lum, bgLum);
    const lo = Math.min(lum, bgLum);
    if ((hi + 0.05) / (lo + 0.05) >= MIN_CONTRAST) break;
    l = textLighter ? Math.min(1, l + 0.005) : Math.max(0, l - 0.005);
    if ((textLighter && l >= 1) || (!textLighter && l <= 0)) break;
  }
  return l;
}

// ---------------------------------------------------------------------------
// Pipeline: pixels -> palette (trả về palette, có thể ném ThemeFromImageError).
// ---------------------------------------------------------------------------

/**
 * Trích bảng màu từ tập pixels. Ném `ThemeFromImageError('not_enough_color')`
 * nếu: cụm lớn nhất > 85% điểm ảnh, HOẶC mọi cụm chroma < 0.03, HOẶC độ
 * chênh hue giữa các cụm chính < 15°.
 */
export function extractPalette(pixels: Rgb[]): Palette {
  if (pixels.length === 0) throw new ThemeFromImageError("no_pixels");

  const clusters = clusterColors(pixels, 5);
  assertEnoughColor(clusters);

  const { h1, h2 } = pickHues(clusters);
  return ensureContrast(buildPalette(h1, h2));
}

function assertEnoughColor(clusters: ColorCluster[]): void {
  const total = clusters.reduce((sum, c) => sum + c.share, 0);
  const largestShare = total > 0 ? Math.max(...clusters.map((c) => c.share)) : 1;
  if (largestShare > 0.85) {
    throw new ThemeFromImageError("not_enough_color");
  }

  const chromatic = clusters.filter((c) => c.chroma >= 0.03);
  if (chromatic.length === 0) {
    throw new ThemeFromImageError("not_enough_color");
  }

  const hues = chromatic.map((c) => hueOf(c));
  let maxSpread = 0;
  for (let i = 0; i < hues.length; i += 1) {
    for (let j = i + 1; j < hues.length; j += 1) {
      maxSpread = Math.max(maxSpread, angularDistance(hues[i], hues[j]));
    }
  }
  if (maxSpread < 15) {
    throw new ThemeFromImageError("not_enough_color");
  }
}

// ---------------------------------------------------------------------------
// Tiện ích nội bộ.
// ---------------------------------------------------------------------------

function hueOf(cluster: { color: Rgb; chroma?: number }): number {
  const oklch = srgbToOklch(cluster.color[0], cluster.color[1], cluster.color[2]);
  return oklch.h;
}

function angularDistance(a: number, b: number): number {
  const d = Math.abs(normalizeHue(a) - normalizeHue(b)) % 360;
  return d > 180 ? 360 - d : d;
}

function parseOklch(value: string): Oklch {
  const m = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+|none)\s*\)$/);
  if (!m) throw new ThemeFromImageError("no_pixels");
  return { l: Number(m[1]), c: Number(m[2]), h: m[3] === "none" ? 0 : Number(m[3]) };
}

function oklchToSrgbFromToken(value: string): Rgb {
  const { l, c, h } = parseOklch(value);
  return oklchToSrgb(l, c, h);
}

function luminanceOf(token: Oklch): number {
  const [r, g, b] = oklchToSrgb(token.l, token.c, token.h);
  return relativeLuminance(r, g, b);
}

function distSq(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function roundTo(n: number, digits: number): number {
  return Number(n.toFixed(digits));
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, v));
}

function clampUnit(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampChroma(v: number): number {
  return Math.max(0, Math.min(0.4, v));
}

function normalizeHue(h: number): number {
  return ((h % 360) + 360) % 360;
}
