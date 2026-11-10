// UC-79 — đọc 1 ảnh người dùng chọn vào canvas 64×64 và trả các pixel RGB
// (bỏ pixel trong suốt). Toàn bộ xử lý trên trình duyệt, không upload ảnh lên
// server (BR-91). Giải phóng object URL và canvas ngay khi đọc xong.

import type { Rgb } from "./theme-from-image";

const SAMPLE_SIZE = 64;

/**
 * Decode 1 file ảnh (PNG/JPEG/WebP) và trả mảng pixel `[r,g,b][]` ở 64×64.
 *
 * - Bỏ qua pixel có alpha < 128.
 * - Trả `[]` nếu ảnh không có đủ pixel có thể đọc được.
 * - Không giữ `File` hay object URL sau khi hoàn tất.
 */
export async function loadImagePixels(file: File): Promise<Rgb[]> {
  const url = URL.createObjectURL(file);
  let canvas: HTMLCanvasElement | null = null;

  try {
    const img = await loadImage(url);
    canvas = createScaledCanvas(img);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no_2d_context");

    const data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    const pixels: Rgb[] = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
    return pixels;
  } finally {
    URL.revokeObjectURL(url);
    canvas = null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode_failed"));
    img.src = url;
  });
}

function createScaledCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_2d_context");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return canvas;
}
