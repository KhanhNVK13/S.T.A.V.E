/**
 * UC-72 (Music Theory Insight) — module thuần chạy trong trình duyệt:
 * nhận diện tông (Krumhansl–Schmuckler), hợp âm theo ô nhịp, bậc La Mã,
 * tiến trình và kết (cadence). CHỈ mô tả những gì đã có trong bản nhạc
 * (BR-82), không gợi ý sửa, không chạm nốt nào của dự án.
 */
export { analyze, type Insight, type InsightAnalysis } from "./analyze";
export { pitchClass, ticksPerBar, noteStartBar, isDrumTrack } from "./pitch-utils";
export { detectKey, type KeyResult } from "./key";
export {
  analyzeChords,
  toDiatonicNumerals,
  type BarChord,
  type ChordAnalysis,
} from "./chords";
export { detectProgressions, detectCadence } from "./patterns";
export {
  MIN_NOTES,
  MIN_NOTE_BARS,
  KEY_AMBIGUITY_THRESHOLD,
  MIN_PITCH_CLASSES_PER_BAR,
  PITCH_CLASS_NAMES,
  PROGRESSION_PATTERNS,
  CADENCE_SPECS,
} from "./constants";
