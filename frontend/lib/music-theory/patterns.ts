import { CADENCE_SPECS, PROGRESSION_PATTERNS } from "./constants";

/**
 * 5: nhận diện tiến trình — trượt cửa sổ qua các ô nhịp liên tiếp (số La Mã),
 * so với danh sách mẫu (I–V–vi–IV, vi–IV–I–V, I–vi–IV–V, ii–V–I, I–IV–V,
 * blues 12 ô). Mẫu blues khớp chính xác 12 ô; các mẫu ngắn (4–5 hợp âm)
 * khớp bất kỳ vị trí nào trong chuỗi.
 *
 * Chỉ mô tả, không khuyên (BR-82). Không nhận ra mẫu nào thì trả [] (3.E1) —
 * UI hiện "Chưa nhận ra mẫu nào", không bịa.
 */
export function detectProgressions(numerals: string[]): string[] {
  const ids = new Set<string>();
  for (const p of PROGRESSION_PATTERNS) {
    if (p.numerals.length === 12) {
      // Blues: khớp khi đúng 12 ô và toàn bộ chuỗi bằng mẫu.
      if (numerals.length === 12 && numerals.every((n, i) => n === p.numerals[i])) {
        ids.add(p.id);
      }
      continue;
    }
    const len = p.numerals.length;
    for (let i = 0; i + len <= numerals.length; i++) {
      let hit = true;
      for (let j = 0; j < len; j++) {
        if (numerals[i + j] !== p.numerals[j]) {
          hit = false;
          break;
        }
      }
      if (hit) {
        ids.add(p.id);
        break;
      }
    }
  }
  // Giữ thứ tự trong bảng PROGRESSION_PATTERNS.
  return PROGRESSION_PATTERNS.filter((p) => ids.has(p.id)).map((p) => p.id);
}

/**
 * 6: nhận diện kết (cadence) ở ô nhịp cuối (hoặc trước khoảng nghỉ):
 * so 2 hợp âm cuối (số La Mã) với CADENCE_SPECS (V→I trọn, IV→I plagal,
 * V→vi lừa). Không đủ 2 hợp âm → không có kết.
 */
export function detectCadence(numerals: string[]): {
  id: string;
  title: string;
  description: string;
} | null {
  if (numerals.length < 2) return null;
  const from = numerals[numerals.length - 2];
  const to = numerals[numerals.length - 1];
  for (const c of CADENCE_SPECS) {
    if (c.from === from && c.to === to) {
      return { id: c.id, title: c.title, description: c.description };
    }
  }
  return null;
}
