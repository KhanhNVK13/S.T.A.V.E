/**
 * Shared shape of `drafts.snapshot` / `commits.snapshot` (jsonb) — see
 * docs/decisions/STAVE_NhomF_JSONB_RLS_DaChot.md for the finalized design.
 * Read by MIDI Editor, Version Control, and the projects/drafts API alike —
 * do not diverge per-module.
 */
export const DRAFT_SCHEMA_VERSION = 2;

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
  visibility: 'public';
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  play_count: number;
  fork_count: number;
  owner: PublicProjectOwner;
  tags: string[];
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
