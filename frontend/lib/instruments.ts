/**
 * instruments.ts
 * General MIDI (GM) instrument definitions for UC-30: Assign instrument to track.
 * 128 standard GM instruments organized by category.
 */

export interface GMInstrument {
  id: number;       // GM program number (0-127)
  name: string;      // Display name
  category: string;  // Category for grouping
}

export const GM_INSTRUMENTS: GMInstrument[] = [
  // ── Piano (1-8) ────────────────────────────────────────────
  { id: 0,   name: "Acoustic Grand Piano", category: "Piano" },
  { id: 1,   name: "Bright Acoustic Piano", category: "Piano" },
  { id: 2,   name: "Electric Grand Piano", category: "Piano" },
  { id: 3,   name: "Honky-tonk Piano", category: "Piano" },
  { id: 4,   name: "Electric Piano 1", category: "Piano" },
  { id: 5,   name: "Electric Piano 2", category: "Piano" },
  { id: 6,   name: "Harpsichord", category: "Piano" },
  { id: 7,   name: "Clavinet", category: "Piano" },

  // ── Chromatic Percussion (8-15) ──────────────────────────────
  { id: 8,   name: "Celesta", category: "Chromatic Percussion" },
  { id: 9,   name: "Glockenspiel", category: "Chromatic Percussion" },
  { id: 10,  name: "Music Box", category: "Chromatic Percussion" },
  { id: 11,  name: "Vibraphone", category: "Chromatic Percussion" },
  { id: 12,  name: "Marimba", category: "Chromatic Percussion" },
  { id: 13,  name: "Xylophone", category: "Chromatic Percussion" },
  { id: 14,  name: "Tubular Bells", category: "Chromatic Percussion" },
  { id: 15,  name: "Dulcimer", category: "Chromatic Percussion" },

  // ── Organ (16-23) ────────────────────────────────────────────
  { id: 16,  name: "Drawbar Organ", category: "Organ" },
  { id: 17,  name: "Percussive Organ", category: "Organ" },
  { id: 18,  name: "Rock Organ", category: "Organ" },
  { id: 19,  name: "Church Organ", category: "Organ" },
  { id: 20,  name: "Reed Organ", category: "Organ" },
  { id: 21,  name: "Accordion", category: "Organ" },
  { id: 22,  name: "Harmonica", category: "Organ" },
  { id: 23,  name: "Tango Accordion", category: "Organ" },

  // ── Guitar (24-31) ───────────────────────────────────────────
  { id: 24,  name: "Acoustic Guitar (nylon)", category: "Guitar" },
  { id: 25,  name: "Acoustic Guitar (steel)", category: "Guitar" },
  { id: 26,  name: "Electric Guitar (jazz)", category: "Guitar" },
  { id: 27,  name: "Electric Guitar (clean)", category: "Guitar" },
  { id: 28,  name: "Electric Guitar (muted)", category: "Guitar" },
  { id: 29,  name: "Overdriven Guitar", category: "Guitar" },
  { id: 30,  name: "Distortion Guitar", category: "Guitar" },
  { id: 31,  name: "Guitar Harmonics", category: "Guitar" },

  // ── Bass (32-39) ─────────────────────────────────────────────
  { id: 32,  name: "Acoustic Bass", category: "Bass" },
  { id: 33,  name: "Electric Bass (finger)", category: "Bass" },
  { id: 34,  name: "Electric Bass (pick)", category: "Bass" },
  { id: 35,  name: "Fretless Bass", category: "Bass" },
  { id: 36,  name: "Slap Bass 1", category: "Bass" },
  { id: 37,  name: "Slap Bass 2", category: "Bass" },
  { id: 38,  name: "Synth Bass 1", category: "Bass" },
  { id: 39,  name: "Synth Bass 2", category: "Bass" },

  // ── Strings (40-47) ──────────────────────────────────────────
  { id: 40,  name: "Violin", category: "Strings" },
  { id: 41,  name: "Viola", category: "Strings" },
  { id: 42,  name: "Cello", category: "Strings" },
  { id: 43,  name: "Contrabass", category: "Strings" },
  { id: 44,  name: "Tremolo Strings", category: "Strings" },
  { id: 45,  name: "Pizzicato Strings", category: "Strings" },
  { id: 46,  name: "Orchestral Harp", category: "Strings" },
  { id: 47,  name: "Timpani", category: "Strings" },

  // ── Ensemble (48-55) ─────────────────────────────────────────
  { id: 48,  name: "String Ensemble 1", category: "Ensemble" },
  { id: 49,  name: "String Ensemble 2", category: "Ensemble" },
  { id: 50,  name: "Synth Strings 1", category: "Ensemble" },
  { id: 51,  name: "Synth Strings 2", category: "Ensemble" },
  { id: 52,  name: "Choir Aahs", category: "Ensemble" },
  { id: 53,  name: "Voice Oohs", category: "Ensemble" },
  { id: 54,  name: "Synth Choir", category: "Ensemble" },
  { id: 55,  name: "Orchestra Hit", category: "Ensemble" },

  // ── Brass (56-63) ────────────────────────────────────────────
  { id: 56,  name: "Trumpet", category: "Brass" },
  { id: 57,  name: "Trombone", category: "Brass" },
  { id: 58,  name: "Tuba", category: "Brass" },
  { id: 59,  name: "Muted Trumpet", category: "Brass" },
  { id: 60,  name: "French Horn", category: "Brass" },
  { id: 61,  name: "Brass Section", category: "Brass" },
  { id: 62,  name: "Synth Brass 1", category: "Brass" },
  { id: 63,  name: "Synth Brass 2", category: "Brass" },

  // ── Reed (64-71) ─────────────────────────────────────────────
  { id: 64,  name: "Soprano Sax", category: "Reed" },
  { id: 65,  name: "Alto Sax", category: "Reed" },
  { id: 66,  name: "Tenor Sax", category: "Reed" },
  { id: 67,  name: "Baritone Sax", category: "Reed" },
  { id: 68,  name: "Oboe", category: "Reed" },
  { id: 69,  name: "English Horn", category: "Reed" },
  { id: 70,  name: "Bassoon", category: "Reed" },
  { id: 71,  name: "Clarinet", category: "Reed" },

  // ── Pipe (72-79) ─────────────────────────────────────────────
  { id: 72,  name: "Piccolo", category: "Pipe" },
  { id: 73,  name: "Flute", category: "Pipe" },
  { id: 74,  name: "Recorder", category: "Pipe" },
  { id: 75,  name: "Pan Flute", category: "Pipe" },
  { id: 76,  name: "Blown Bottle", category: "Pipe" },
  { id: 77,  name: "Shakuhachi", category: "Pipe" },
  { id: 78,  name: "Whistle", category: "Pipe" },
  { id: 79,  name: "Ocarina", category: "Pipe" },

  // ── Synth Lead (80-87) ────────────────────────────────────────
  { id: 80,  name: "Lead 1 (square)", category: "Synth Lead" },
  { id: 81,  name: "Lead 2 (sawtooth)", category: "Synth Lead" },
  { id: 82,  name: "Lead 3 (calliope)", category: "Synth Lead" },
  { id: 83,  name: "Lead 4 (chiff)", category: "Synth Lead" },
  { id: 84,  name: "Lead 5 (charang)", category: "Synth Lead" },
  { id: 85,  name: "Lead 6 (voice)", category: "Synth Lead" },
  { id: 86,  name: "Lead 7 (fifths)", category: "Synth Lead" },
  { id: 87,  name: "Lead 8 (bass+lead)", category: "Synth Lead" },

  // ── Synth Pad (88-95) ────────────────────────────────────────
  { id: 88,  name: "Pad 1 (new age)", category: "Synth Pad" },
  { id: 89,  name: "Pad 2 (warm)", category: "Synth Pad" },
  { id: 90,  name: "Pad 3 (polysynth)", category: "Synth Pad" },
  { id: 91,  name: "Pad 4 (choir)", category: "Synth Pad" },
  { id: 92,  name: "Pad 5 (bowed)", category: "Synth Pad" },
  { id: 93,  name: "Pad 6 (metallic)", category: "Synth Pad" },
  { id: 94,  name: "Pad 7 (halo)", category: "Synth Pad" },
  { id: 95,  name: "Pad 8 (sweep)", category: "Synth Pad" },

  // ── Synth Effects (96-103) ────────────────────────────────────
  { id: 96,  name: "FX 1 (rain)", category: "Synth Effects" },
  { id: 97,  name: "FX 2 (soundtrack)", category: "Synth Effects" },
  { id: 98,  name: "FX 3 (crystal)", category: "Synth Effects" },
  { id: 99,  name: "FX 4 (atmosphere)", category: "Synth Effects" },
  { id: 100, name: "FX 5 (brightness)", category: "Synth Effects" },
  { id: 101, name: "FX 6 (goblins)", category: "Synth Effects" },
  { id: 102, name: "FX 7 (echoes)", category: "Synth Effects" },
  { id: 103, name: "FX 8 (sci-fi)", category: "Synth Effects" },

  // ── Ethnic (104-111) ─────────────────────────────────────────
  { id: 104, name: "Sitar", category: "Ethnic" },
  { id: 105, name: "Banjo", category: "Ethnic" },
  { id: 106, name: "Shamisen", category: "Ethnic" },
  { id: 107, name: "Koto", category: "Ethnic" },
  { id: 108, name: "Kalimba", category: "Ethnic" },
  { id: 109, name: "Bagpipe", category: "Ethnic" },
  { id: 110, name: "Fiddle", category: "Ethnic" },
  { id: 111, name: "Shanai", category: "Ethnic" },

  // ── Percussive (112-119) ──────────────────────────────────────
  { id: 112, name: "Tinkle Bell", category: "Percussive" },
  { id: 113, name: "Agogo", category: "Percussive" },
  { id: 114, name: "Steel Drums", category: "Percussive" },
  { id: 115, name: "Woodblock", category: "Percussive" },
  { id: 116, name: "Taiko Drum", category: "Percussive" },
  { id: 117, name: "Melodic Tom", category: "Percussive" },
  { id: 118, name: "Synth Drum", category: "Percussive" },
  { id: 119, name: "Reverse Cymbal", category: "Percussive" },

  // ── Sound Effects (120-127) ────────────────────────────────────
  { id: 120, name: "Guitar Fret Noise", category: "Sound Effects" },
  { id: 121, name: "Breath Noise", category: "Sound Effects" },
  { id: 122, name: "Seashore", category: "Sound Effects" },
  { id: 123, name: "Bird Tweet", category: "Sound Effects" },
  { id: 124, name: "Telephone Ring", category: "Sound Effects" },
  { id: 125, name: "Helicopter", category: "Sound Effects" },
  { id: 126, name: "Applause", category: "Sound Effects" },
  { id: 127, name: "Gunshot", category: "Sound Effects" },
];

/** Get instrument by GM program number */
export function getInstrumentById(id: number): GMInstrument | undefined {
  return GM_INSTRUMENTS.find((inst) => inst.id === id);
}

/** Get instrument by name */
export function getInstrumentByName(name: string): GMInstrument | undefined {
  return GM_INSTRUMENTS.find((inst) => inst.name === name);
}

/** Get all instrument categories */
export function getInstrumentCategories(): string[] {
  const categories = new Set(GM_INSTRUMENTS.map((inst) => inst.category));
  return Array.from(categories);
}

/** Get instruments by category */
export function getInstrumentsByCategory(category: string): GMInstrument[] {
  return GM_INSTRUMENTS.filter((inst) => inst.category === category);
}
