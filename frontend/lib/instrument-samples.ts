/**
 * instrument-samples.ts
 * Maps a GM melodic instrument name to a real sampled-instrument set for
 * Tone.Sampler. (GM drum kits don't go through here — they play GeneralUser
 * GS samples via soundfont-kit.ts.)
 *
 * Melodic samples are the FluidR3_GM SoundFont by Frank Wen, as pre-rendered
 * per-note MP3s (CC BY 3.0, https://github.com/gleitz/midi-js-soundfonts),
 * self-hosted under `frontend/public/instruments/<slug>/` rather than fetched
 * from the third-party GitHub Pages host at runtime. Attribution: see
 * public/instruments/CREDITS.txt and SiteFooter.
 *
 * Only instruments actually seen in real test projects (plus a few added on
 * request: Steel Drums, Taiko Drum, Synth Drum) are bundled so far
 * (see PROJECT_STATE.md) — any instrument without a bundled sample set falls
 * back to the existing oscillator synth (createTrackVoice in
 * tone-synth-engine.ts), so assigning an instrument that isn't in this list
 * is not an error, just not upgraded yet. Adding a new instrument later is
 * just downloading its sample folder + adding one line here, no other code
 * changes needed.
 */

// Every instrument's sample set uses this same 88-note file naming (flats,
// not sharps — matches the source repo's convention; Tone.js's note parser
// accepts either).
const SAMPLE_NOTES = [
  "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7",
  "Ab1", "Ab2", "Ab3", "Ab4", "Ab5", "Ab6", "Ab7",
  "B0", "B1", "B2", "B3", "B4", "B5", "B6", "B7",
  "Bb0", "Bb1", "Bb2", "Bb3", "Bb4", "Bb5", "Bb6", "Bb7",
  "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8",
  "D1", "D2", "D3", "D4", "D5", "D6", "D7",
  "Db1", "Db2", "Db3", "Db4", "Db5", "Db6", "Db7",
  "E1", "E2", "E3", "E4", "E5", "E6", "E7",
  "Eb1", "Eb2", "Eb3", "Eb4", "Eb5", "Eb6", "Eb7",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7",
  "G1", "G2", "G3", "G4", "G5", "G6", "G7",
  "Gb1", "Gb2", "Gb3", "Gb4", "Gb5", "Gb6", "Gb7",
];

/** GM instrument display name (matches GM_INSTRUMENTS[].name) → sample folder slug. */
const INSTRUMENT_SAMPLE_SLUGS: Record<string, string> = {
  "Acoustic Grand Piano": "acoustic_grand_piano",
  "Piccolo": "piccolo",
  "Flute": "flute",
  "Oboe": "oboe",
  "Clarinet": "clarinet",
  "Bassoon": "bassoon",
  "French Horn": "french_horn",
  "Trumpet": "trumpet",
  "Muted Trumpet": "muted_trumpet",
  "Trombone": "trombone",
  "Tuba": "tuba",
  "Timpani": "timpani",
  "Choir Aahs": "choir_aahs",
  "String Ensemble 1": "string_ensemble_1",
  "Pizzicato Strings": "pizzicato_strings",
  "Tremolo Strings": "tremolo_strings",
  "Acoustic Bass": "acoustic_bass",
  "Steel Drums": "steel_drums",
  "Taiko Drum": "taiko_drum",
  "Synth Drum": "synth_drum",
};

export interface InstrumentSamplerOptions {
  urls: Record<string, string>;
  baseUrl: string;
}

/** Returns Tone.Sampler-ready options for this instrument, or null if no sample set is bundled (caller should fall back to the oscillator synth). */
export function getInstrumentSamplerOptions(instrument: string | null): InstrumentSamplerOptions | null {
  if (!instrument) return null;
  const slug = INSTRUMENT_SAMPLE_SLUGS[instrument];
  if (!slug) return null;

  const urls: Record<string, string> = {};
  for (const note of SAMPLE_NOTES) urls[note] = `${note}.mp3`;
  return { urls, baseUrl: `/instruments/${slug}/` };
}
