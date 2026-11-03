/**
 * UC-72 (Music Theory Insight) — hằng số cho module thuần chạy trong trình
 * duyệt. Rule: module CHỈ mô tả những gì đã có trong bản nhạc (BR-82),
 * không bao giờ gợi ý sửa hay đánh giá đúng/sai.
 *
 * Các ngưỡng đặt thành hằng số có tên để chỉnh (theo cách làm của UC-71).
 */

/** 2.E1: dưới ngưỡng nốt / ô nhịp → "Chưa đủ nốt để nhận diện". */
export const MIN_NOTES = 8;
export const MIN_NOTE_BARS = 2;

/** Chênh tương quan Krumhansl–Schmuckler; thứ hai dưới ngưỡng này hiện cả hai như khả năng (3.E2). */
export const KEY_AMBIGUITY_THRESHOLD = 0.05;

/**
 * Hồ sơ Krumhansl–Schmuckler (1992) cho 12 tông trưởng và 12 tông thứ
 * (mỗi hồ sơ đặt theo nốt gốc của nó, chỉ số 0..11 là quãng semitone từ gốc).
 */
export const KS_MAJOR_PROFILE = [
  6.35, 2.23, 3.28, 1.54, 2.5, 2.44, 3.37, 2.42, 2.93, 2.16, 2.82, 2.69,
];
export const KS_MINOR_PROFILE = [
  6.33, 2.68, 3.52, 2.24, 2.08, 2.64, 3.34, 2.55, 2.24, 1.88, 1.77, 2.96,
];

/** Tên 12 lớp cao độ, chỉ số = semitone (0 = C). */
export const PITCH_CLASS_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

export type ChordType =
  | "major"
  | "minor"
  | "diminished"
  | "augmented"
  | "dominant7"
  | "major7"
  | "minor7";

export interface ChordSpec {
  type: ChordType;
  /** Tập lớp cao độ (quãng semitone từ nốt gốc). */
  pcs: number[];
  /** Hậu tố tên khi hợp âm ở ngoài tông ("hợp âm ngoài tông ghi nguyên tên"). */
  suffix: string;
}

export const CHORD_SPECS: ChordSpec[] = [
  { type: "major", pcs: [0, 4, 7], suffix: "" },
  { type: "minor", pcs: [0, 3, 7], suffix: "m" },
  { type: "diminished", pcs: [0, 3, 6], suffix: "dim" },
  { type: "augmented", pcs: [0, 4, 8], suffix: "aug" },
  { type: "dominant7", pcs: [0, 4, 7, 10], suffix: "7" },
  { type: "major7", pcs: [0, 4, 7, 11], suffix: "maj7" },
  { type: "minor7", pcs: [0, 3, 7, 10], suffix: "m7" },
];

/**
 * Hợp âm theo bậc trong 12 tông (bậc 1..7, quãng từ nốt gốc) — dùng để đổi
 * hợp âm thành số La Mã; không khớp thì ghi nguyên tên (rule 4).
 */
export interface KeyDegree {
  degree: number;
  rootOffset: number;
  type: ChordType;
  numeral: string;
}

export const MAJOR_DEGREES: KeyDegree[] = [
  { degree: 1, rootOffset: 0, type: "major", numeral: "I" },
  { degree: 2, rootOffset: 2, type: "minor", numeral: "ii" },
  { degree: 3, rootOffset: 4, type: "minor", numeral: "iii" },
  { degree: 4, rootOffset: 5, type: "major", numeral: "IV" },
  { degree: 5, rootOffset: 7, type: "major", numeral: "V" },
  { degree: 6, rootOffset: 9, type: "minor", numeral: "vi" },
  { degree: 7, rootOffset: 11, type: "diminished", numeral: "vii°" },
];

export const MINOR_DEGREES: KeyDegree[] = [
  { degree: 1, rootOffset: 0, type: "minor", numeral: "i" },
  { degree: 2, rootOffset: 2, type: "diminished", numeral: "ii°" },
  { degree: 3, rootOffset: 3, type: "major", numeral: "III" },
  { degree: 4, rootOffset: 5, type: "minor", numeral: "iv" },
  { degree: 5, rootOffset: 7, type: "major", numeral: "V" },
  { degree: 6, rootOffset: 8, type: "major", numeral: "VI" },
  { degree: 7, rootOffset: 10, type: "major", numeral: "VII" },
];

export interface ProgressionPattern {
  id: string;
  /** Số La Mã theo bậc (so với tông đã chọn), khớp chính xác từng vị trí. */
  numerals: string[];
  /** Mô tả tiếng Việt: tên, là gì, thường xuất hiện thế nào — CHỈ mô tả. */
  description: string;
}

export const PROGRESSION_PATTERNS: ProgressionPattern[] = [
  {
    id: "i-v-vi-iv",
    numerals: ["I", "V", "vi", "IV"],
    description:
      "Hành trình 4 hợp âm của nhạc pop: chủ (I) → hợp âm 5 (V) → hợp âm 6 thứ (vi) → hợp âm 4 (IV). Rất phổ biến, âm hưởng ổn định và gần gũi.",
  },
  {
    id: "vi-iv-i-v",
    numerals: ["vi", "IV", "I", "V"],
    description:
      "Mở ở hợp âm 6 (vi) rồi qua hợp âm 4 (IV), về chủ (I) và khép bằng hợp âm 5 (V) — cảm giác chuyển động, chờ được giải quyết.",
  },
  {
    id: "i-vi-iv-v",
    numerals: ["I", "vi", "IV", "V"],
    description:
      "Tuần tự 4 hợp âm của thập niên 50 (I–vi–IV–V), âm hưởng rock & roll.",
  },
  {
    id: "ii-v-i",
    numerals: ["ii", "V", "I"],
    description:
      "Mạch giải quyết chuẩn: hợp âm 2 (ii) tiến lên hợp âm 5 (V) rồi về chủ (I), điển hình trong jazz và pop.",
  },
  {
    id: "i-iv-v",
    numerals: ["I", "IV", "V"],
    description:
      "Khung 3 hợp âm chủ đạo (I–IV–V), nền tảng quen thuộc của folk và country.",
  },
  {
    id: "blues-12",
    numerals: ["I", "I", "I", "I", "IV", "IV", "I", "I", "V", "IV", "I", "I"],
    description:
      "Mẫu blues 12 ô nhịp: I I I I IV IV I I V IV I I — đi từ chủ, qua hợp âm 4, hợp âm 5 rồi về chủ.",
  },
];

export interface CadenceSpec {
  id: string;
  from: string;
  to: string;
  title: string;
  description: string;
}

/** 6: kết (cadence) ở cuối câu — so 2 hợp âm cuối. */
export const CADENCE_SPECS: CadenceSpec[] = [
  {
    id: "authentic",
    from: "V",
    to: "I",
    title: "Kết trọn",
    description:
      "Hợp âm 5 về chủ (V → I) ở cuối câu — nghe trọn vẹn, chắc chắn.",
  },
  {
    id: "plagal",
    from: "IV",
    to: "I",
    title: "Kết plagal",
    description:
      "Hợp âm 4 về chủ (IV → I) — kết nhẹ nhàng kiểu “amen”, thường ở khúc cuối.",
  },
  {
    id: "deceptive",
    from: "V",
    to: "vi",
    title: "Kết lừa",
    description:
      "Hợp âm 5 về hợp âm 6 (V → vi) — nghe như kết nhưng lại rẽ đi, tạo bất ngờ.",
  },
];

/** Ô nhịp có ít hơn 3 lớp cao độ khác nhau thì để trống (rule 3). */
export const MIN_PITCH_CLASSES_PER_BAR = 3;
