/**
 * Shared shape of `drafts.snapshot` / `commits.snapshot` (jsonb) — see
 * docs/decisions/STAVE_NhomF_JSONB_RLS_DaChot.md for the finalized design.
 * Read by MIDI Editor, Version Control, and the projects/drafts API alike —
 * do not diverge per-module.
 */
export const DRAFT_SCHEMA_VERSION = 1;

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
