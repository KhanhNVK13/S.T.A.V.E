const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Số hiệu MIDI → tên nốt theo quy ước quốc tế (60 → "C4"). */
export function pitchName(pitch: number): string {
  return NOTE_NAMES[pitch % 12] + Math.floor(pitch / 12 - 1);
}
