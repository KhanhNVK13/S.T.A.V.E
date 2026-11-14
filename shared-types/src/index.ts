/**
 * Shared shape of `drafts.snapshot` / `commits.snapshot` (jsonb) — see
 * docs/decisions/STAVE_NhomF_JSONB_RLS_DaChot.md for the finalized design.
 * Read by MIDI Editor, Version Control, and the projects/drafts API alike —
 * do not diverge per-module.
 */
export const DRAFT_SCHEMA_VERSION = 3;

export interface DraftMeta {
  tempo: number;
  timeSignature: [number, number];
  ppq: number;
}

export interface DraftTrack {
  id: string;
  name: string;
  order: number;
  color: string;
  muted: boolean;
  solo: boolean;
  /** 0-1, matches Tone.Gain */
  volume: number;
  /** -1..1, matches Tone.Panner */
  pan: number;
  /** UC-30: General MIDI instrument name, null = default (sine oscillator) */
  instrument: string | null;
  /** UC-57 (schemaVersion 3): pitch "0".."127" → custom_sound id; absent on older snapshots. */
  soundMap?: SoundMap;
}

export type SoundMap = Record<string, string>;

export const MAX_SOUND_MAP_ENTRIES = 128;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keeps only valid "pitch → sound id" entries; returns undefined when nothing valid is left. */
export function sanitizeSoundMap(value: unknown): SoundMap | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const out: SoundMap = {};
  let count = 0;
  for (const [key, soundId] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (count >= MAX_SOUND_MAP_ENTRIES) break;
    if (!/^\d{1,3}$/.test(key)) continue;
    const pitch = Number(key);
    if (pitch < 0 || pitch > 127) continue;
    if (typeof soundId !== "string" || !UUID_PATTERN.test(soundId)) continue;
    out[String(pitch)] = soundId;
    count++;
  }
  return count > 0 ? out : undefined;
}

export function isValidSoundMap(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const size = Object.keys(value).length;
  if (size > MAX_SOUND_MAP_ENTRIES) return false;
  const sanitized = sanitizeSoundMap(value) ?? {};
  if (Object.keys(sanitized).length !== size) return false;
  return new Set(Object.values(sanitized)).size === size;
}

export interface DraftNote {
  id: string;
  trackId: string;
  pitch: number;
  /** integer tick, not seconds/beats */
  start: number;
  /** integer tick, not seconds/beats */
  duration: number;
  velocity: number;
}

export interface DraftSnapshot {
  schemaVersion: number;
  meta: DraftMeta;
  tracks: DraftTrack[];
  notes: DraftNote[];
}

/**
 * Shape of a public project card returned by the Explore module (UC-08..12).
 * Read by both `backend/src/explore/explore.service.ts` and the frontend
 * `lib/api-client.ts` — keep in sync, do not redefine per side.
 */
export interface PublicProjectOwner {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface PublicProjectCard {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  license?: "CC-BY" | "CC-BY-SA" | "CC-BY-NC" | null;
  visibility: "public";
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  play_count: number;
  fork_count: number;
  owner: PublicProjectOwner;
  tags: string[];
}

/** Public commit-graph payload — GET /explore/projects/:id/graph. Metadata only, never snapshots. */
export interface PublicGraphBranch {
  id: string;
  name: string;
  is_default: boolean;
  head_commit_id: string | null;
}

export interface PublicGraphCommit {
  id: string;
  branch_id: string;
  parent_commit_id: string | null;
  merged_from_commit_id: string | null;
  message: string;
  created_at: string;
  author: PublicProjectOwner;
}

export interface PublicProjectGraph {
  branches: PublicGraphBranch[];
  /** Oldest → newest. A parent may be absent when the window was truncated. */
  commits: PublicGraphCommit[];
  /** Total commits in the project (>= commits.length). */
  total: number;
}

export interface PublicUserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  total_public_projects: number;
  total_forks: number;
}

export interface PublicFeaturedContent {
  hero: {
    title: string;
    subtitle: string;
    cta_primary: { label: string; href: string };
    cta_secondary: { label: string; href: string };
  };
  featured_projects: PublicProjectCard[];
  trending_projects: PublicProjectCard[];
  stats: {
    total_projects: number;
    total_users: number;
    total_forks: number;
  };
}

/**
 * General MIDI (GM) instrument definitions for UC-30: Assign instrument to track.
 * 128 standard GM instruments organized by category. Read by the MIDI Editor
 * (frontend) and by `backend/src/drafts/dto/update-draft.dto.ts` (server-side
 * validation of `DraftTrack.instrument`) — keep in sync, do not redefine per side.
 */
/**
 * The GM percussion kit (MIDI channel 10). A track assigned this plays each
 * note number as a different drum sound (35 = kick, 38 = snare, 42 = closed
 * hi-hat…), not as a pitch.
 */
export const DRUM_KIT_INSTRUMENT_NAME = "Standard Drum Kit";

/** GS/GM2 Orchestra kit (channel-10 program 48): concert bass drum, concert snare, timpani, concert cymbals. */
export const ORCHESTRA_KIT_INSTRUMENT_NAME = "Orchestra Drum Kit";

/**
 * Drum kits sit in GM_INSTRUMENTS at id = DRUM_KIT_ID_OFFSET + the kit's
 * channel-10 program number (SoundFont convention: bank 128 = percussion),
 * so the program to write on export is `id - DRUM_KIT_ID_OFFSET`.
 */
export const DRUM_KIT_ID_OFFSET = 128;

export function isDrumKitInstrument(name: string | null): name is string {
  return (
    name === DRUM_KIT_INSTRUMENT_NAME || name === ORCHESTRA_KIT_INSTRUMENT_NAME
  );
}

export interface GMInstrument {
  id: number; // GM program number (0-127); ≥128 = drum kit (see DRUM_KIT_ID_OFFSET)
  name: string; // Display name
  category: string; // Category for grouping
}

export const GM_INSTRUMENTS: GMInstrument[] = [
  // ── Piano (1-8) ────────────────────────────────────────────
  { id: 0, name: "Acoustic Grand Piano", category: "Piano" },
  { id: 1, name: "Bright Acoustic Piano", category: "Piano" },
  { id: 2, name: "Electric Grand Piano", category: "Piano" },
  { id: 3, name: "Honky-tonk Piano", category: "Piano" },
  { id: 4, name: "Electric Piano 1", category: "Piano" },
  { id: 5, name: "Electric Piano 2", category: "Piano" },
  { id: 6, name: "Harpsichord", category: "Piano" },
  { id: 7, name: "Clavinet", category: "Piano" },

  // ── Chromatic Percussion (8-15) ──────────────────────────────
  { id: 8, name: "Celesta", category: "Chromatic Percussion" },
  { id: 9, name: "Glockenspiel", category: "Chromatic Percussion" },
  { id: 10, name: "Music Box", category: "Chromatic Percussion" },
  { id: 11, name: "Vibraphone", category: "Chromatic Percussion" },
  { id: 12, name: "Marimba", category: "Chromatic Percussion" },
  { id: 13, name: "Xylophone", category: "Chromatic Percussion" },
  { id: 14, name: "Tubular Bells", category: "Chromatic Percussion" },
  { id: 15, name: "Dulcimer", category: "Chromatic Percussion" },

  // ── Organ (16-23) ────────────────────────────────────────────
  { id: 16, name: "Drawbar Organ", category: "Organ" },
  { id: 17, name: "Percussive Organ", category: "Organ" },
  { id: 18, name: "Rock Organ", category: "Organ" },
  { id: 19, name: "Church Organ", category: "Organ" },
  { id: 20, name: "Reed Organ", category: "Organ" },
  { id: 21, name: "Accordion", category: "Organ" },
  { id: 22, name: "Harmonica", category: "Organ" },
  { id: 23, name: "Tango Accordion", category: "Organ" },

  // ── Guitar (24-31) ───────────────────────────────────────────
  { id: 24, name: "Acoustic Guitar (nylon)", category: "Guitar" },
  { id: 25, name: "Acoustic Guitar (steel)", category: "Guitar" },
  { id: 26, name: "Electric Guitar (jazz)", category: "Guitar" },
  { id: 27, name: "Electric Guitar (clean)", category: "Guitar" },
  { id: 28, name: "Electric Guitar (muted)", category: "Guitar" },
  { id: 29, name: "Overdriven Guitar", category: "Guitar" },
  { id: 30, name: "Distortion Guitar", category: "Guitar" },
  { id: 31, name: "Guitar Harmonics", category: "Guitar" },

  // ── Bass (32-39) ─────────────────────────────────────────────
  { id: 32, name: "Acoustic Bass", category: "Bass" },
  { id: 33, name: "Electric Bass (finger)", category: "Bass" },
  { id: 34, name: "Electric Bass (pick)", category: "Bass" },
  { id: 35, name: "Fretless Bass", category: "Bass" },
  { id: 36, name: "Slap Bass 1", category: "Bass" },
  { id: 37, name: "Slap Bass 2", category: "Bass" },
  { id: 38, name: "Synth Bass 1", category: "Bass" },
  { id: 39, name: "Synth Bass 2", category: "Bass" },

  // ── Strings (40-47) ──────────────────────────────────────────
  { id: 40, name: "Violin", category: "Strings" },
  { id: 41, name: "Viola", category: "Strings" },
  { id: 42, name: "Cello", category: "Strings" },
  { id: 43, name: "Contrabass", category: "Strings" },
  { id: 44, name: "Tremolo Strings", category: "Strings" },
  { id: 45, name: "Pizzicato Strings", category: "Strings" },
  { id: 46, name: "Orchestral Harp", category: "Strings" },
  { id: 47, name: "Timpani", category: "Strings" },

  // ── Ensemble (48-55) ─────────────────────────────────────────
  { id: 48, name: "String Ensemble 1", category: "Ensemble" },
  { id: 49, name: "String Ensemble 2", category: "Ensemble" },
  { id: 50, name: "Synth Strings 1", category: "Ensemble" },
  { id: 51, name: "Synth Strings 2", category: "Ensemble" },
  { id: 52, name: "Choir Aahs", category: "Ensemble" },
  { id: 53, name: "Voice Oohs", category: "Ensemble" },
  { id: 54, name: "Synth Choir", category: "Ensemble" },
  { id: 55, name: "Orchestra Hit", category: "Ensemble" },

  // ── Brass (56-63) ────────────────────────────────────────────
  { id: 56, name: "Trumpet", category: "Brass" },
  { id: 57, name: "Trombone", category: "Brass" },
  { id: 58, name: "Tuba", category: "Brass" },
  { id: 59, name: "Muted Trumpet", category: "Brass" },
  { id: 60, name: "French Horn", category: "Brass" },
  { id: 61, name: "Brass Section", category: "Brass" },
  { id: 62, name: "Synth Brass 1", category: "Brass" },
  { id: 63, name: "Synth Brass 2", category: "Brass" },

  // ── Reed (64-71) ─────────────────────────────────────────────
  { id: 64, name: "Soprano Sax", category: "Reed" },
  { id: 65, name: "Alto Sax", category: "Reed" },
  { id: 66, name: "Tenor Sax", category: "Reed" },
  { id: 67, name: "Baritone Sax", category: "Reed" },
  { id: 68, name: "Oboe", category: "Reed" },
  { id: 69, name: "English Horn", category: "Reed" },
  { id: 70, name: "Bassoon", category: "Reed" },
  { id: 71, name: "Clarinet", category: "Reed" },

  // ── Pipe (72-79) ─────────────────────────────────────────────
  { id: 72, name: "Piccolo", category: "Pipe" },
  { id: 73, name: "Flute", category: "Pipe" },
  { id: 74, name: "Recorder", category: "Pipe" },
  { id: 75, name: "Pan Flute", category: "Pipe" },
  { id: 76, name: "Blown Bottle", category: "Pipe" },
  { id: 77, name: "Shakuhachi", category: "Pipe" },
  { id: 78, name: "Whistle", category: "Pipe" },
  { id: 79, name: "Ocarina", category: "Pipe" },

  // ── Synth Lead (80-87) ────────────────────────────────────────
  { id: 80, name: "Lead 1 (square)", category: "Synth Lead" },
  { id: 81, name: "Lead 2 (sawtooth)", category: "Synth Lead" },
  { id: 82, name: "Lead 3 (calliope)", category: "Synth Lead" },
  { id: 83, name: "Lead 4 (chiff)", category: "Synth Lead" },
  { id: 84, name: "Lead 5 (charang)", category: "Synth Lead" },
  { id: 85, name: "Lead 6 (voice)", category: "Synth Lead" },
  { id: 86, name: "Lead 7 (fifths)", category: "Synth Lead" },
  { id: 87, name: "Lead 8 (bass+lead)", category: "Synth Lead" },

  // ── Synth Pad (88-95) ────────────────────────────────────────
  { id: 88, name: "Pad 1 (new age)", category: "Synth Pad" },
  { id: 89, name: "Pad 2 (warm)", category: "Synth Pad" },
  { id: 90, name: "Pad 3 (polysynth)", category: "Synth Pad" },
  { id: 91, name: "Pad 4 (choir)", category: "Synth Pad" },
  { id: 92, name: "Pad 5 (bowed)", category: "Synth Pad" },
  { id: 93, name: "Pad 6 (metallic)", category: "Synth Pad" },
  { id: 94, name: "Pad 7 (halo)", category: "Synth Pad" },
  { id: 95, name: "Pad 8 (sweep)", category: "Synth Pad" },

  // ── Synth Effects (96-103) ────────────────────────────────────
  { id: 96, name: "FX 1 (rain)", category: "Synth Effects" },
  { id: 97, name: "FX 2 (soundtrack)", category: "Synth Effects" },
  { id: 98, name: "FX 3 (crystal)", category: "Synth Effects" },
  { id: 99, name: "FX 4 (atmosphere)", category: "Synth Effects" },
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

  // ── Drum Kits (channel 10) — id = DRUM_KIT_ID_OFFSET + kit program ──
  {
    id: DRUM_KIT_ID_OFFSET + 0,
    name: DRUM_KIT_INSTRUMENT_NAME,
    category: "Drum Kit",
  },
  {
    id: DRUM_KIT_ID_OFFSET + 48,
    name: ORCHESTRA_KIT_INSTRUMENT_NAME,
    category: "Drum Kit",
  },
];

/** Flat list of valid instrument names — used for server-side `@IsIn` validation. */
export const GM_INSTRUMENT_NAMES: string[] = GM_INSTRUMENTS.map((i) => i.name);

// =============================================================================
// Version Control Types (UC-42, UC-43, UC-44, UC-45, UC-46)
// =============================================================================

/**
 * UC-101/102/103: report reasons, exposed to users and stored verbatim in
 * `reports.reason`. Shared so the frontend report dialog and the admin
 * backend always render the same set.
 */
export const REPORT_REASONS = [
  { key: "copyright", label: "Vi phạm bản quyền" },
  { key: "inappropriate", label: "Nội dung không phù hợp" },
  { key: "spam", label: "Spam hoặc lừa đảo" },
  { key: "harassment", label: "Quấy rối" },
  { key: "other", label: "Khác" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["key"];

/** Minimal commit row returned by create/restore endpoints */
export interface CommitRow {
  id: string;
  branch_id: string;
  message: string;
  snapshot: DraftSnapshot;
  created_by: string;
  created_at: string;
}

/** Tag on a commit (UC-44) — matches the real `commit_tags` table, which has no `color` column. */
export interface TagRow {
  id: string;
  commit_id: string;
  name: string;
  created_by: string;
  created_at: string;
}

/** One conflict choice stored on a merge commit (kept outside the snapshot). */
export interface MergeResolutionRecord {
  noteId: string;
  choice: "PICK_SOURCE" | "PICK_TARGET" | "PICK_CUSTOM" | "KEEP_BOTH";
  customNote?: Record<string, unknown>;
}

/** Commit with author info and tags (UC-43, UC-45) */
export interface CommitWithAuthor {
  id: string;
  branch_id: string;
  message: string;
  snapshot: DraftSnapshot;
  created_by: string;
  created_at: string;
  author: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  tags: TagRow[];
  merge_resolutions?: MergeResolutionRecord[] | null;
}

/** Paginated commit history response (UC-43) */
export interface PaginatedCommitHistory {
  items: CommitWithAuthor[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

// ── UC-67 Jam Note Helpers & Constants (BR-71, CLAUDE.md §4.2) ─────────────
export const JAM_MAX_FLUSH_FAILURES = 3;

/** `JamNoteDto` (wire) → `DraftNote` (snapshot) để áp dụng LWW vào RAM. */
export function jamNoteToDraftNote(note: {
  id: string;
  trackId: string;
  midi: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
}): DraftNote {
  return {
    id: note.id,
    trackId: note.trackId,
    pitch: note.midi,
    start: note.startTick,
    duration: note.durationTicks,
    velocity: note.velocity,
  };
}

/** `DraftNote` (snapshot) → `JamNoteDto` (wire) để broadcast `jam:note_updated`. */
export function draftNoteToJamNote(note: DraftNote): {
  id: string;
  trackId: string;
  midi: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
} {
  return {
    id: note.id,
    trackId: note.trackId,
    midi: note.pitch,
    startTick: note.start,
    durationTicks: note.duration,
    velocity: note.velocity,
  };
}

// Collaboration (UC-60/61/62) — shapes shared with `backend/src/collaboration/`.
export type * from "./collaboration";
// Comments (UC-63 — pinned comment) — shapes shared with `backend/src/comments/`.
export type * from "./comments";
// Community Jam (UC-66/67, 93..95) — shapes shared with `backend/src/jam/`.
export type * from "./jam";
export * from "./billing";

export const ACTIVITY_TYPES = [
  "signin",
  "projects",
  "subscription",
  "community",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export interface ActivityItem {
  id: string;
  action: string;
  targetType: string | null;
  targetName: string | null;
  targetDeleted: boolean;
  occurredAt: string;
  ipMasked: string | null;
  locationApprox: null;
}
export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
}

export type SettingType = "number" | "boolean";
export type SettingUnit = "bytes" | "days" | "seconds";
export type SettingGroup = "limits" | "community" | "registration" | "retention";
export type SettingValue = number | boolean;
export interface SettingDef {
  key: string;
  group: SettingGroup;
  type: SettingType;
  min?: number;
  max?: number;
  default: SettingValue;
  unit?: SettingUnit;
}

export const BYTES_PER_MB = 1024 * 1024;
export const CUSTOM_SOUND_QUOTA_KEY = "custom_sound_quota_bytes";

export const PLATFORM_SETTING_CATALOG: SettingDef[] = [
  {
    key: CUSTOM_SOUND_QUOTA_KEY,
    group: "limits",
    type: "number",
    min: 5 * BYTES_PER_MB,
    max: 1024 * BYTES_PER_MB,
    default: 50 * BYTES_PER_MB,
    unit: "bytes",
  },
  { key: "price_change_notice_days", group: "limits", type: "number", min: 1, max: 60, default: 7, unit: "days" },
  { key: "jam_edit_cooldown_sec", group: "community", type: "number", min: 1, max: 3600, default: 5, unit: "seconds" },
  { key: "registration_enabled", group: "registration", type: "boolean", default: true },
  { key: "moderation_retention_days", group: "retention", type: "number", min: 7, max: 365, default: 30, unit: "days" },
];

export type SettingErrorCode =
  | "not_integer"
  | "not_boolean"
  | "out_of_range"
  | "unknown_key"
  | "duplicate_key"
  | "empty_changes"
  | "invalid_entry";

export interface SettingErrorParams {
  min?: number;
  max?: number;
  unit?: SettingUnit;
}

export interface SettingsValidationError {
  /** Rỗng khi lỗi thuộc cả yêu cầu (mảng rỗng, mục không hợp lệ). */
  key: string;
  code: SettingErrorCode;
  params?: SettingErrorParams;
}

export type SettingValidation =
  | { ok: true }
  | { ok: false; code: SettingErrorCode; params?: SettingErrorParams };

export interface SettingChange {
  key: string;
  value: SettingValue;
}

export type ChangesValidation =
  | { ok: true; changes: SettingChange[] }
  | { ok: false; errors: SettingsValidationError[] };

export function findSettingDef(key: string): SettingDef | undefined {
  return PLATFORM_SETTING_CATALOG.find((def) => def.key === key);
}

export function validateSettingValue(def: SettingDef, value: unknown): SettingValidation {
  if (def.type === "boolean") {
    return typeof value === "boolean" ? { ok: true } : { ok: false, code: "not_boolean" };
  }
  const params: SettingErrorParams = { min: def.min, max: def.max, unit: def.unit };
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { ok: false, code: "not_integer", params };
  }
  if ((def.min !== undefined && value < def.min) || (def.max !== undefined && value > def.max)) {
    return { ok: false, code: "out_of_range", params };
  }
  return { ok: true };
}

export function validateChanges(input: unknown): ChangesValidation {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, errors: [{ key: "", code: "empty_changes" }] };
  }
  const errors: SettingsValidationError[] = [];
  const changes: SettingChange[] = [];
  const seen = new Set<string>();
  const reportedDuplicates = new Set<string>();
  for (const entry of input as unknown[]) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { key?: unknown }).key !== "string"
    ) {
      errors.push({ key: "", code: "invalid_entry" });
      continue;
    }
    const { key, value } = entry as { key: string; value: unknown };
    const def = findSettingDef(key);
    if (!def) {
      errors.push({ key, code: "unknown_key" });
      continue;
    }
    if (seen.has(key)) {
      if (!reportedDuplicates.has(key)) {
        reportedDuplicates.add(key);
        errors.push({ key, code: "duplicate_key" });
      }
      continue;
    }
    seen.add(key);
    const result = validateSettingValue(def, value);
    if (!result.ok) {
      errors.push({ key, code: result.code, ...(result.params ? { params: result.params } : {}) });
      continue;
    }
    changes.push({ key, value: value as SettingValue });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, changes };
}

export function bytesToMb(bytes: number): number {
  return bytes / BYTES_PER_MB;
}

export function mbToBytes(mb: number): number {
  return Math.round(mb * BYTES_PER_MB);
}

export function needsReductionConfirmation(key: string, newValue: number, maxUsageBytes: number): boolean {
  return key === CUSTOM_SOUND_QUOTA_KEY && newValue < maxUsageBytes;
}

export interface PlatformSettingItem extends SettingDef {
  value: SettingValue;
}
export interface PlatformSettingsResponse {
  groups: { group: SettingGroup; items: PlatformSettingItem[] }[];
}
export interface UpdateSettingsRequest {
  changes: SettingChange[];
  confirmReduction?: boolean;
}
export interface UpdateSettingsResponse {
  updated: string[];
}
export interface ReductionConfirmationRequired {
  requiresConfirmation: true;
  maxUsageBytes: number;
}

// Moderation reports (UC-101) — shapes shared with `backend/src/reports/`.
export const REPORT_DETAILS_MAX_LENGTH = 500;

export const REPORT_STATUS_FILTERS = ["open", "upheld", "dismissed"] as const;
export type ReportStatusFilter = (typeof REPORT_STATUS_FILTERS)[number];

export type ReportResolution = "upheld" | "dismissed";

export interface ReportGroup {
  /** `null` only for reports whose project row no longer exists. */
  projectId: string | null;
  projectName: string | null;
  projectExists: boolean;
  ownerDisplayName: string | null;
  reportCount: number;
  reasons: { reason: ReportReason; count: number }[];
  latestAt: string;
  /** Present only when the project is currently hidden by moderation. */
  retainUntil?: string | null;
  retentionEnded?: boolean;
  projectHidden?: boolean;
  resolution?: ReportResolution;
  resolutionNote?: string | null;
  resolvedAt?: string | null;
}

export interface ReportDetail {
  id: string;
  reason: ReportReason;
  details: string | null;
  createdAt: string;
  /** Only ever present on the admin detail endpoint. */
  reporter: { id: string; displayName: string | null } | null;
  status: "pending" | "resolved";
  resolution: ReportResolution | null;
}

/** Metadata only: never carries note content. */
export interface ReportPreview {
  project: { id: string; name: string; description: string | null; genre: string | null };
  hasCommit: boolean;
  trackCount: number;
  noteCount: number;
  tracks: { name: string; instrument: string | null }[];
}

export interface AdminReportListResponse {
  items: ReportGroup[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateReportResponse {
  id: string;
}

export const MODERATION_POLICIES = [
  "copyright",
  "hateful_content",
  "sexual_content",
  "harassment",
  "spam",
  "other",
] as const;
export type ModerationPolicy = (typeof MODERATION_POLICIES)[number];

export const MODERATION_NOTE_MIN_LENGTH = 10;
export const MODERATION_NOTE_MAX_LENGTH = 500;
export const MODERATION_DEFAULT_RETENTION_DAYS = 30;

export interface ReportRemovalContext {
  forkCount: number;
  sounds: { id: string; name: string }[];
  truncated: boolean;
  retentionDays: number;
}

export interface RemoveReportedProjectResponse {
  closedReports: number;
  removedSounds: number;
  retainUntil: string;
}

export interface DismissReportsResponse {
  dismissed: number;
}

export interface RestoreProjectResponse {
  restored: true;
}

export const NOTIFICATION_TEMPLATE_NAME_MAX_LENGTH = 100;
export const NOTIFICATION_TEMPLATE_SUBJECT_MAX_LENGTH = 150;
export const NOTIFICATION_TEMPLATE_BODY_MAX_LENGTH = 1000;

export interface NotificationTemplateInfo {
  type: string;
  mandatory: boolean;
  placeholders: string[];
  defaultSubject: string;
  defaultBody: string;
  custom: {
    name: string;
    subject: string;
    body: string;
    updatedAt: string;
  } | null;
}

export interface NotificationTemplatePreview {
  subject: string;
  body: string;
}

export type StatsGranularity = "day" | "week" | "month";
export const STATS_MAX_RANGE_DAYS = 800;

export interface StatsPeriod {
  from: string;
  to: string;
  granularity: StatsGranularity;
}

export type StatsPart<T> = ({ available: true } & T) | { available: false };

export interface GrowthTotals {
  newUsers: number;
  activeUsers: number;
}

export interface UsageTotals {
  newProjects: number;
  commits: number;
  newBranches: number;
  merges: number;
  forks: number;
  pullRequests: number;
}

export interface StatsSeriesPoint {
  date: string;
  newUsers: number;
  activeUsers: number;
  newProjects: number;
  commits: number;
  newBranches: number;
  merges: number;
  forks: number;
  pullRequests: number;
}

export interface GrowthStats {
  period: StatsPeriod;
  noData: boolean;
  totalUsers: number;
  totals: GrowthTotals;
  previous: GrowthTotals | null;
  series: StatsSeriesPoint[];
}

export interface UsageStats {
  period: StatsPeriod;
  noData: boolean;
  totals: UsageTotals;
  previous: UsageTotals | null;
  series: StatsSeriesPoint[];
}

export interface AdminOverviewStats {
  period: StatsPeriod;
  growth: StatsPart<Omit<GrowthStats, "period">>;
  usage: StatsPart<Omit<UsageStats, "period">>;
  plans: StatsPart<{ plans: { name: string; count: number }[] }>;
  finance: StatsPart<{ revenueVnd: number; failedTransactions: number }>;
  moderation: StatsPart<{ openReports: number; openPaymentIssues: number }>;
}

// Theme từ ảnh (UC-79) — palette token, hợp đồng regex/validate dùng chung FE/BE.
export type * from "./theme";
export {
  PALETTE_KEYS,
  OKLCH_STRICT_REGEX,
  isValidOklch,
  isValidPalette,
  THEME_PRESET_KEYS,
  THEME_PRESET_PALETTES,
  getPresetPalette,
} from "./theme";

export type * from "./notifications";
