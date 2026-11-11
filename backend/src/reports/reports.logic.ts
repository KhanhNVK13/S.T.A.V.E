import { BadRequestException } from '@nestjs/common';
import {
  REPORT_REASONS,
  REPORT_STATUS_FILTERS,
  type ReportGroup,
  type ReportReason,
  type ReportResolution,
  type ReportStatusFilter,
} from '@stave/shared-types';

export const REPORT_REASON_KEYS: ReportReason[] = REPORT_REASONS.map(
  (reason) => reason.key,
);

export interface ReportStatusQuery {
  status: 'pending' | 'resolved';
  resolution?: ReportResolution;
}

/** The only place that knows how a UI tab maps to `reports.status` / `reports.resolution`. */
export function mapStatusFilter(filter: unknown): ReportStatusQuery {
  switch (filter) {
    case 'open':
      return { status: 'pending' };
    case 'upheld':
      return { status: 'resolved', resolution: 'upheld' };
    case 'dismissed':
      return { status: 'resolved', resolution: 'dismissed' };
    default:
      throw new BadRequestException(
        `Invalid report status filter. Use one of: ${REPORT_STATUS_FILTERS.join(', ')}`,
      );
  }
}

export function isReportStatusFilter(
  value: unknown,
): value is ReportStatusFilter {
  return (REPORT_STATUS_FILTERS as readonly unknown[]).includes(value);
}

function stripControlCharacters(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code === 10 || (code >= 32 && code !== 127)) out += char;
  }
  return out;
}

export function sanitizeReportDetails(
  raw: string | null | undefined,
): string | null {
  if (raw === undefined || raw === null) return null;
  const cleaned = stripControlCharacters(
    raw.replace(/\r\n?/g, '\n').replace(/\t/g, ' '),
  )
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned === '' ? null : cleaned;
}

export interface ReportRow {
  id: string;
  project_id: string | null;
  reason: string;
  created_at: string;
  resolution?: ReportResolution | null;
  resolution_note?: string | null;
  resolved_at?: string | null;
}

export type ReportGroupCore = Omit<
  ReportGroup,
  'projectName' | 'ownerDisplayName'
>;

export function toReportReason(value: string): ReportReason {
  return (REPORT_REASON_KEYS as string[]).includes(value)
    ? (value as ReportReason)
    : 'other';
}

function time(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function groupReportRows(rows: readonly ReportRow[]): ReportGroupCore[] {
  const byProject = new Map<string | null, ReportRow[]>();
  for (const row of rows) {
    const bucket = byProject.get(row.project_id);
    if (bucket) bucket.push(row);
    else byProject.set(row.project_id, [row]);
  }

  const groups: ReportGroupCore[] = [];
  for (const [projectId, members] of byProject) {
    const counts = new Map<ReportReason, number>();
    for (const member of members) {
      const reason = toReportReason(member.reason);
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    const reasons = [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          REPORT_REASON_KEYS.indexOf(a.reason) -
            REPORT_REASON_KEYS.indexOf(b.reason),
      );

    const latest = members.reduce((best, member) =>
      time(member.created_at) > time(best.created_at) ? member : best,
    );

    const group: ReportGroupCore = {
      projectId,
      projectExists: projectId !== null,
      reportCount: members.length,
      reasons,
      latestAt: latest.created_at,
    };

    const resolved = members
      .filter((member) => member.resolution && member.resolved_at)
      .sort((a, b) => time(b.resolved_at ?? '') - time(a.resolved_at ?? ''))[0];
    if (resolved?.resolution) {
      group.resolution = resolved.resolution;
      group.resolutionNote = resolved.resolution_note ?? null;
      group.resolvedAt = resolved.resolved_at ?? null;
    }

    groups.push(group);
  }

  return groups.sort(
    (a, b) =>
      time(b.latestAt) - time(a.latestAt) ||
      String(a.projectId).localeCompare(String(b.projectId)),
  );
}

const MAX_TRACK_LABEL_LENGTH = 80;
const MAX_PREVIEW_TRACKS = 32;

function cleanLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  return stripControlCharacters(value).trim().slice(0, MAX_TRACK_LABEL_LENGTH);
}

export interface SnapshotSummary {
  trackCount: number;
  noteCount: number;
  tracks: { name: string; instrument: string | null }[];
}

export function summarizeSnapshot(snapshot: unknown): SnapshotSummary {
  if (typeof snapshot !== 'object' || snapshot === null) {
    return { trackCount: 0, noteCount: 0, tracks: [] };
  }
  const { tracks, notes } = snapshot as {
    tracks?: unknown;
    notes?: unknown;
  };
  const trackList: unknown[] = Array.isArray(tracks) ? tracks : [];
  return {
    trackCount: trackList.length,
    noteCount: Array.isArray(notes) ? notes.length : 0,
    tracks: trackList.slice(0, MAX_PREVIEW_TRACKS).map((track) => {
      const row = (
        typeof track === 'object' && track !== null ? track : {}
      ) as {
        name?: unknown;
        instrument?: unknown;
      };
      return {
        name: cleanLabel(row.name),
        instrument: cleanLabel(row.instrument) || null,
      };
    }),
  };
}

export function extractSoundIds(snapshot: unknown): string[] {
  if (typeof snapshot !== 'object' || snapshot === null) return [];
  const { tracks } = snapshot as { tracks?: unknown };
  if (!Array.isArray(tracks)) return [];
  const ids = new Set<string>();
  for (const track of tracks as unknown[]) {
    const soundMap =
      typeof track === 'object' && track !== null
        ? (track as { soundMap?: unknown }).soundMap
        : undefined;
    if (typeof soundMap !== 'object' || soundMap === null) continue;
    for (const value of Object.values(soundMap as Record<string, unknown>)) {
      if (typeof value === 'string') ids.add(value);
    }
  }
  return [...ids];
}

export function resolveRetentionDays(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}

export function retainUntilFrom(hiddenAt: string, days: number): string {
  const base = Date.parse(hiddenAt);
  return new Date(
    (Number.isNaN(base) ? Date.now() : base) + days * 86_400_000,
  ).toISOString();
}
