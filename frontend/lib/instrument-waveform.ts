/**
 * instrument-waveform.ts
 * UC-37/UC-38: Map a GM instrument name to an OscillatorType.
 *
 * Shared by playback (midi-editor.tsx startPlayback) and audio export
 * (audio-exporter.ts) so both paths synthesize a track with the exact same
 * timbre — before this was split into two copies and export always used a
 * bare sine wave regardless of the track's assigned instrument, so the
 * exported file sounded different from what the user heard on Play.
 */
export function getOscillatorType(instrument: string | null): OscillatorType {
  if (!instrument) return "triangle"; // Default

  const instLower = instrument.toLowerCase();

  // Piano family → triangle (soft, rounded)
  if (instLower.includes("piano") || instLower.includes("grand") || instLower.includes("electric piano")) {
    return "triangle";
  }
  // Organ → sawtooth (bright, sustained)
  if (instLower.includes("organ") || instLower.includes("accordion")) {
    return "sawtooth";
  }
  // Guitar → triangle (similar to piano)
  if (instLower.includes("guitar") || instLower.includes("harp")) {
    return "triangle";
  }
  // Bass → sawtooth (deep, rich)
  if (instLower.includes("bass")) {
    return "sawtooth";
  }
  // Brass/Lead → square (bright, cutting)
  if (instLower.includes("brass") || instLower.includes("trumpet") || instLower.includes("synth lead")) {
    return "square";
  }
  // Strings → triangle (smooth)
  if (instLower.includes("violin") || instLower.includes("cello") || instLower.includes("string")) {
    return "triangle";
  }
  // Synth pads → sine (pure, smooth)
  if (instLower.includes("synth pad") || instLower.includes("sweep") || instLower.includes("atmosphere")) {
    return "sine";
  }
  // Default → triangle
  return "triangle";
}
