#!/usr/bin/env node
/**
 * Extracts the two GM drum kits STAVE plays from the GeneralUser GS SoundFont
 * (by S. Christian Collins, GeneralUser GS License v2.0 — see
 * public/instruments/CREDITS.txt):
 *   bank 128 program 0  "Standard 1" -> "Standard Drum Kit"
 *   bank 128 program 48 "Orchestral" -> "Orchestra Drum Kit"
 *
 * Writes every sample those kits use as its original Ogg Vorbis stream (an
 * SF3 stores each sample as a self-contained Ogg file inside the smpl chunk,
 * so nothing is decoded or re-encoded) plus kits.json, the per-zone
 * generator table lib/soundfont-kit.ts plays from.
 *
 * Usage: node scripts/extract-generaluser-drums.mjs path/to/GeneralUserGS.sf3
 * Source used: soundfonts/GeneralUserGS.sf3 from github.com/spessasus/SpessaSynth
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KITS = [
  { name: "Standard Drum Kit", bank: 128, program: 0 },
  { name: "Orchestra Drum Kit", bank: 128, program: 48 },
];
const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/instruments/generaluser_drums",
);

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/extract-generaluser-drums.mjs <GeneralUserGS.sf3>");
  process.exit(1);
}
const buf = fs.readFileSync(src);
const fourcc = (o) => buf.toString("latin1", o, o + 4);
if (fourcc(0) !== "RIFF" || fourcc(8) !== "sfbk") throw new Error(`${src} is not a SoundFont file`);

// ── RIFF chunks ────────────────────────────────────────────────────────────
const pdta = {};
const info = {};
let smplStart = -1;
for (let o = 12; o < buf.length - 8; ) {
  const id = fourcc(o);
  const size = buf.readUInt32LE(o + 4);
  if (id === "LIST") {
    const type = fourcc(o + 8);
    for (let p = o + 12, end = o + 8 + size; p < end - 8; ) {
      const sid = fourcc(p);
      const ssize = buf.readUInt32LE(p + 4);
      if (type === "pdta") pdta[sid] = { start: p + 8, size: ssize };
      if (type === "INFO") info[sid] = buf.toString("latin1", p + 8, p + 8 + ssize).replace(/\0+$/, "");
      if (type === "sdta" && sid === "smpl") smplStart = p + 8;
      p += 8 + ssize + (ssize & 1);
    }
  }
  o += 8 + size + (size & 1);
}
const table = (id, recSize) => {
  const { start, size } = pdta[id];
  return { count: size / recSize, at: (i) => start + i * recSize };
};
const phdr = table("phdr", 38);
const pbag = table("pbag", 4);
const pgen = table("pgen", 4);
const inst = table("inst", 22);
const ibag = table("ibag", 4);
const igen = table("igen", 4);
const shdr = table("shdr", 46);
const name20 = (o) => buf.toString("latin1", o, o + 20).replace(/\0.*$/s, "").trim();

// ── Generators (SoundFont 2.04 §8.1) ─────────────────────────────────────────
const KEY_RANGE = 43;
const VEL_RANGE = 44;
const INSTRUMENT = 41;
const SAMPLE_ID = 53;
// Defaults for every generator the runtime uses.
const DEFAULTS = {
  0: 0, 4: 0, 8: 13500, 9: 0, 11: 0, 17: 0,
  25: -12000, 26: -12000, 27: -12000, 28: -12000, 29: 0, 30: -12000,
  33: -12000, 34: -12000, 35: -12000, 36: -12000, 37: 0, 38: -12000,
  39: 0, 40: 0, 48: 0, 51: 0, 52: 0, 56: 100, 57: 0, 58: -1,
};
// Generators a preset zone may not set (§8.1.2); anything else a preset zone
// sets is added on top of the instrument zone's value.
const INSTRUMENT_ONLY = new Set([0, 1, 2, 3, 4, 12, 45, 46, 47, 50, 54, 57, 58]);

function readGens(gen, from, to) {
  const g = {};
  for (let i = from; i < to; i++) {
    const a = gen.at(i);
    const op = buf.readUInt16LE(a);
    g[op] = op === KEY_RANGE || op === VEL_RANGE ? [buf[a + 2], buf[a + 3]] : buf.readInt16LE(a + 2);
  }
  return g;
}
function zonesOf(hdr, bag, gen, index, bagField) {
  const first = buf.readUInt16LE(hdr.at(index) + bagField);
  const last = buf.readUInt16LE(hdr.at(index + 1) + bagField);
  const out = [];
  for (let b = first; b < last; b++) {
    out.push(readGens(gen, buf.readUInt16LE(bag.at(b)), buf.readUInt16LE(bag.at(b + 1))));
  }
  return out;
}
const intersect = (a, b) => [Math.max(a[0], b[0]), Math.min(a[1], b[1])];
const numericOps = (g) =>
  Object.fromEntries(Object.entries(g).filter(([op]) => ![KEY_RANGE, VEL_RANGE, INSTRUMENT, SAMPLE_ID].includes(+op)));

// ── Samples ────────────────────────────────────────────────────────────────
const sampleFiles = new Map(); // shdr index -> file name
const usedFileNames = new Set();
function sampleFile(index) {
  if (sampleFiles.has(index)) return sampleFiles.get(index);
  const s = shdr.at(index);
  const start = buf.readUInt32LE(s + 20);
  const end = buf.readUInt32LE(s + 24);
  const type = buf.readUInt16LE(s + 44);
  if (!(type & 0x10)) throw new Error(`sample ${index} is not compressed — expected an SF3`);
  const bytes = buf.subarray(smplStart + start, smplStart + end);
  if (bytes.toString("latin1", 0, 4) !== "OggS") throw new Error(`sample ${index} is not an Ogg stream`);
  let base = name20(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `sample-${index}`;
  if (usedFileNames.has(base)) base = `${base}-${index}`;
  usedFileNames.add(base);
  const file = `${base}.ogg`;
  fs.writeFileSync(path.join(OUT_DIR, file), bytes);
  sampleFiles.set(index, file);
  return file;
}

// ── Kits ───────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR)) {
  if (f.endsWith(".ogg") || f === "kits.json") fs.unlinkSync(path.join(OUT_DIR, f));
}

const kits = {};
for (const kit of KITS) {
  let presetIndex = -1;
  for (let i = 0; i < phdr.count - 1; i++) {
    const a = phdr.at(i);
    if (buf.readUInt16LE(a + 22) === kit.bank && buf.readUInt16LE(a + 20) === kit.program) presetIndex = i;
  }
  if (presetIndex < 0) throw new Error(`bank ${kit.bank} program ${kit.program} not found`);

  const pz = zonesOf(phdr, pbag, pgen, presetIndex, 24);
  const pGlobal = pz.length && pz[0][INSTRUMENT] === undefined ? pz[0] : {};
  const zones = [];
  for (const p of pz) {
    if (p[INSTRUMENT] === undefined) continue;
    const iz = zonesOf(inst, ibag, igen, p[INSTRUMENT], 20);
    const iGlobal = iz.length && iz[0][SAMPLE_ID] === undefined ? iz[0] : {};
    for (const z of iz) {
      if (z[SAMPLE_ID] === undefined) continue;
      const key = intersect(z[KEY_RANGE] ?? iGlobal[KEY_RANGE] ?? [0, 127], p[KEY_RANGE] ?? pGlobal[KEY_RANGE] ?? [0, 127]);
      const vel = intersect(z[VEL_RANGE] ?? iGlobal[VEL_RANGE] ?? [0, 127], p[VEL_RANGE] ?? pGlobal[VEL_RANGE] ?? [0, 127]);
      if (key[0] > key[1] || vel[0] > vel[1]) continue;

      const g = { ...DEFAULTS, ...numericOps(iGlobal), ...numericOps(z) };
      const presetGens = { ...numericOps(pGlobal), ...numericOps(p) };
      for (const [op, value] of Object.entries(presetGens)) {
        if (!INSTRUMENT_ONLY.has(+op)) g[op] = (g[op] ?? 0) + value;
      }

      const s = shdr.at(z[SAMPLE_ID]);
      const originalPitch = buf[s + 40];
      zones.push({
        keyLo: key[0],
        keyHi: key[1],
        velLo: vel[0],
        velHi: vel[1],
        file: sampleFile(z[SAMPLE_ID]),
        root: g[58] >= 0 ? g[58] : originalPitch === 255 ? 60 : originalPitch,
        tune: g[51] * 100 + g[52] + buf.readInt8(s + 41),
        scaleTuning: g[56],
        attenuation: g[48],
        pan: g[17],
        startOffset: g[0] + g[4] * 32768,
        sampleRate: buf.readUInt32LE(s + 36),
        volEnv: [g[33], g[34], g[35], g[36], g[37], g[38]],
        keyToVolEnvHold: g[39],
        keyToVolEnvDecay: g[40],
        filterFc: g[8],
        filterQ: g[9],
        modEnvToFilterFc: g[11],
        modEnv: [g[25], g[26], g[27], g[28], g[29], g[30]],
        exclusiveClass: g[57],
      });
    }
  }
  kits[kit.name] = zones;
  console.log(`${kit.name} <- "${name20(phdr.at(presetIndex))}": ${zones.length} zones`);
}

fs.writeFileSync(
  path.join(OUT_DIR, "kits.json"),
  JSON.stringify({ source: `${info.INAM ?? "GeneralUser GS"} by ${info.IENG ?? "S. Christian Collins"}`, kits }),
);
console.log(`${sampleFiles.size} samples + kits.json written to ${OUT_DIR}`);
