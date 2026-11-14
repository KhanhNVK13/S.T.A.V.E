import { describe, expect, it } from "vitest";
import {
  ThemeFromImageError,
  buildPalette,
  clusterColors,
  contrastRatio,
  ensureContrast,
  extractPalette,
  formatOklch,
  oklchToSrgb,
  pickHues,
  relativeLuminance,
  srgbToOklch,
  type Rgb,
} from "../theme-from-image";
import { PALETTE_KEYS, isValidPalette } from "@stave/shared-types";

describe("UC-79 chuyển đổi màu sRGB <-> OKLCH", () => {
  it("chuyển trắng tuyệt đối sang L=1, C=0", () => {
    const { l, c } = srgbToOklch(255, 255, 255);
    expect(l).toBeCloseTo(1, 5);
    expect(c).toBeCloseTo(0, 5);
  });

  it("chuyển đen tuyệt đối sang L=0, C=0", () => {
    const { l, c } = srgbToOklch(0, 0, 0);
    expect(l).toBeCloseTo(0, 5);
    expect(c).toBeCloseTo(0, 5);
  });

  it("chuyển đỏ thuần sang hue ~29.2 độ", () => {
    const { l, c, h } = srgbToOklch(255, 0, 0);
    expect(l).toBeCloseTo(0.6279, 3);
    expect(c).toBeCloseTo(0.2577, 3);
    expect(h).toBeCloseTo(29.23, 1);
  });

  it("làm tròn điểm khi đi về hướng ngược lại", () => {
    const { l, c, h } = srgbToOklch(64, 128, 200);
    const [r, g, b] = oklchToSrgb(l, c, h);
    expect(r).toBeCloseTo(64, 0);
    expect(g).toBeCloseTo(128, 0);
    expect(b).toBeCloseTo(200, 0);
  });
});

describe("UC-79 độ tương phản WCAG", () => {
  it("đen/trắng đạt đúng 21:1", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });

  it("cùng 1 màu cho tỉ số 1:1", () => {
    expect(contrastRatio([120, 30, 200], [120, 30, 200])).toBeCloseTo(1, 5);
  });

  it("relative luminance của trắng = 1, đen = 0", () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0, 5);
  });

  it("luôn trong khoảng [1, 21]", () => {
    expect(contrastRatio([0, 0, 0], [0, 0, 0])).toBe(1);
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
  });
});

describe("UC-79 phân cụm màu", () => {
  it("gom 2 nhóm màu rõ ràng vào 2 cụm", () => {
    const pixels: Rgb[] = [];
    for (let i = 0; i < 50; i += 1) pixels.push([200, 30, 40]);
    for (let i = 0; i < 50; i += 1) pixels.push([20, 40, 190]);

    const clusters = clusterColors(pixels, 5);
    expect(clusters.length).toBeGreaterThanOrEqual(2);
    expect(clusters[0].share).toBeGreaterThan(0.4);
  });

  it("trả về mảng rỗng khi không có pixel", () => {
    expect(clusterColors([], 5)).toEqual([]);
  });
});

describe("UC-79 chọn sắc độ", () => {
  it("h1 là hue của cụm (chroma × share) lớn nhất", () => {
    const clusters = clusterColors(
      [[200, 30, 40], [200, 30, 40], [200, 30, 40], [20, 40, 190]],
      5,
    );
    const { h1 } = pickHues(clusters);
    const top = clusters.slice().sort((a, b) => b.chroma * b.share - a.chroma * a.share)[0];
    expect(h1).toBeCloseTo(srgbToOklch(top.color[0], top.color[1], top.color[2]).h, 1);
  });

  it("h2 cách h1 ít nhất 30 độ, hoặc mặc định h1 + 30", () => {
    const clusters = clusterColors([[200, 30, 40], [20, 40, 190]], 5);
    const { h1, h2 } = pickHues(clusters);
    const diff = Math.abs(h1 - h2) % 360;
    const angular = diff > 180 ? 360 - diff : diff;
    expect(angular).toBeGreaterThanOrEqual(30);
  });
});

describe("UC-79 bảng màu sinh ra", () => {
  it("luôn có đúng 10 khoá", () => {
    const palette = buildPalette(200, 30);
    expect(Object.keys(palette).sort()).toEqual([...PALETTE_KEYS].sort());
    expect(Object.keys(palette)).toHaveLength(10);
  });

  it("không chứa khoá cấm --accent/--success/--warning/--danger", () => {
    const palette = buildPalette(200, 30);
    for (const key of Object.keys(palette)) {
      expect(key.startsWith("--accent")).toBe(false);
      expect(key.startsWith("--success")).toBe(false);
      expect(key.startsWith("--warning")).toBe(false);
      expect(key.startsWith("--danger")).toBe(false);
    }
  });

  it("mọi giá trị là OKLCH hợp lệ theo validator dùng chung", () => {
    expect(isValidPalette(buildPalette(200, 30))).toBe(true);
  });

  it("h1 dùng cho nhóm trung tính, h2 cho nhóm kim loại", () => {
    const palette = buildPalette(200, 30);
    const neutralHue = Number(palette["--background"].match(/([\d.]+)\)$/)?.[1]);
    const metalHue = Number(palette["--metal"].match(/([\d.]+)\)$/)?.[1]);
    expect(neutralHue).toBeCloseTo(200, 1);
    expect(metalHue).toBeCloseTo(30, 1);
  });

  it("formatOklch làm tròn L/C 4 chữ số, H 2 chữ số", () => {
    expect(formatOklch(0.123456, 0.98765, 45.678)).toBe("oklch(0.1235 0.9877 45.68)");
  });
});

describe("UC-79 ensureContrast", () => {
  it("luôn đạt >= 4.5:1 với dải hue 0..359", () => {
    for (let h = 0; h < 360; h += 1) {
      const palette = ensureContrast(buildPalette(h, (h + 30) % 360));

      const bg = oklchToSrgb(...parse(palette["--background"]));
      const surface = oklchToSrgb(...parse(palette["--surface"]));
      const fg = oklchToSrgb(...parse(palette["--foreground"]));
      const muted = oklchToSrgb(...parse(palette["--muted-foreground"]));

      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(muted, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(fg, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("giữ nguyên L/C của chữ khi đã đạt tương phản", () => {
    const palette = ensureContrast(buildPalette(120, 200));
    const before = parse(palette["--foreground"]);
    expect(palette["--foreground"]).toBe(formatOklch(before[0], before[1], before[2]));
  });
});

describe("UC-79 ảnh không đủ màu", () => {
  it("ném not_enough_color với ảnh đơn sắc", () => {
    const pixels: Rgb[] = [];
    for (let i = 0; i < 200; i += 1) pixels.push([120, 120, 120]);
    expect(() => extractPalette(pixels)).toThrow(ThemeFromImageError);
    try {
      extractPalette(pixels);
    } catch (err) {
      expect((err as ThemeFromImageError).code).toBe("not_enough_color");
    }
  });

  it("ném not_enough_color khi cụm lớn nhất chiếm > 85% điểm ảnh", () => {
    const pixels: Rgb[] = [];
    for (let i = 0; i < 95; i += 1) pixels.push([10, 10, 10]);
    for (let i = 0; i < 5; i += 1) pixels.push([220, 30, 30]);
    expect(() => extractPalette(pixels)).toThrow(/not_enough_color/);
  });

  it("ném no_pixels khi không có pixel nào", () => {
    expect(() => extractPalette([])).toThrow(/no_pixels/);
  });

  it("chấp nhận ảnh nhiều màu và trả về palette hợp lệ", () => {
    const pixels: Rgb[] = [];
    for (let i = 0; i < 60; i += 1) pixels.push([220, 30, 40]);
    for (let i = 0; i < 30; i += 1) pixels.push([20, 60, 200]);
    for (let i = 0; i < 30; i += 1) pixels.push([40, 200, 90]);

    const palette = extractPalette(pixels);
    expect(isValidPalette(palette)).toBe(true);
  });
});

describe("FE-LIB-50 theme-from-image extractPalette(pixels)", () => {
  const colourful = (): Rgb[] => {
    const pixels: Rgb[] = [];
    for (let i = 0; i < 60; i += 1) pixels.push([220, 30, 40]);
    for (let i = 0; i < 30; i += 1) pixels.push([20, 60, 200]);
    for (let i = 0; i < 30; i += 1) pixels.push([40, 200, 90]);
    return pixels;
  };

  it("UTCID01 (N): a multi-colour image gives a palette that passes the shared validator", () => {
    expect(isValidPalette(extractPalette(colourful()))).toBe(true);
  });

  it("UTCID02 (N): the palette has exactly the ten decorative variables", () => {
    const palette = extractPalette(colourful());
    expect(Object.keys(palette).sort()).toEqual([...PALETTE_KEYS].sort());
  });

  it("UTCID03 (N): the palette never touches accent, success, warning or danger", () => {
    const keys = Object.keys(extractPalette(colourful()));
    expect(keys.some((key) => /^--(accent|success|warning|danger)/.test(key))).toBe(false);
  });

  it("UTCID04 (N): text stays readable on the extracted background and surface (at least 4.5:1)", () => {
    const palette = extractPalette(colourful());
    const bg = oklchToSrgb(...parse(palette["--background"]));
    const surface = oklchToSrgb(...parse(palette["--surface"]));
    const fg = oklchToSrgb(...parse(palette["--foreground"]));
    const muted = oklchToSrgb(...parse(palette["--muted-foreground"]));
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(muted, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(fg, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("UTCID05 (A): a single-colour image is refused as not enough colour", () => {
    const pixels: Rgb[] = Array.from({ length: 200 }, () => [120, 120, 120]);
    expect(() => extractPalette(pixels)).toThrow(/not_enough_color/);
  });

  it("UTCID06 (B): an image where one colour covers more than 85% is refused", () => {
    const pixels: Rgb[] = [];
    for (let i = 0; i < 95; i += 1) pixels.push([10, 10, 10]);
    for (let i = 0; i < 5; i += 1) pixels.push([220, 30, 30]);
    expect(() => extractPalette(pixels)).toThrow(/not_enough_color/);
  });

  it("UTCID07 (A): an image with no pixels is refused", () => {
    expect(() => extractPalette([])).toThrow(/no_pixels/);
  });

  it("UTCID08 (A): an image made only of greys is refused as not enough colour", () => {
    const pixels: Rgb[] = [];
    for (let i = 0; i < 60; i += 1) pixels.push([60, 60, 60]);
    for (let i = 0; i < 60; i += 1) pixels.push([200, 200, 200]);
    expect(() => extractPalette(pixels)).toThrow(/not_enough_color/);
  });

  it("UTCID09 (N): the pixels are only read, never changed", () => {
    const pixels = colourful();
    const copy = structuredClone(pixels);
    extractPalette(pixels);
    expect(pixels).toEqual(copy);
  });
});

function parse(token: string): [number, number, number] {
  const m = token.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (!m) throw new Error(`bad token: ${token}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
