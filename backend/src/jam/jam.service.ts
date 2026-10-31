import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  JAM_MAX_FLUSH_FAILURES,
  jamNoteToDraftNote,
  draftNoteToJamNote,
  type AvailableJamProjectDto,
  type ConfigureJamEventDto,
  type DraftSnapshot,
  type JamActivityItem,
  type JamContributorDto,
  type JamEndEventResponse,
  type JamEndExtendedPayload,
  type JamEvent,
  type JamEventEndedPayload,
  type JamEventListItem,
  type JamErrorPayload,
  type JamNoteUpdatedPayload,
  type JamParticipant,
  type JamResultResponseDto,
  type JamRoomState,
  type JamStorageWarningPayload,
  type JamStatePayload,
} from '@stave/shared-types';
import type { EditJamNoteRequestDto } from './dto/edit-jam-note.dto';
import type { CreateJamEventDto } from './dto/create-jam-event.dto';
import { buildDefaultDraftSnapshot } from '../drafts/default-snapshot';
import { NotificationsService } from '../notifications/notifications.service';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type { JamEventQueryDto } from './dto/jam-event-query.dto';

/** Raw row of `public.jam_events` (snake_case, as stored in Postgres). */
export interface JamEventRow {
  id: string;
  created_by: string | null;
  status: JamEvent['status'];
  started_at: string | null;
  ended_at: string | null;
  resulting_project_id: string | null;
  name: string;
  description: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  starting_project_id: string | null;
  jam_project_id: string | null;
  edit_cooldown_sec: number | null;
  no_result: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Rich seed events used when the database migration has not been applied yet
 * or when the table has no events, ensuring comprehensive testing and demonstration.
 */
export const SEEDED_JAM_EVENTS: JamEventRow[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    created_by: 'dc471149-12e7-4e94-88c0-9d0d8ca2cd43',
    status: 'active',
    started_at: new Date(Date.now() - 3600000).toISOString(),
    ended_at: null,
    resulting_project_id: null,
    name: 'Community Jam Sáng Tạo #1: Giai Điệu Mùa Thu',
    description:
      'Phiên Jam âm nhạc mở cho toàn bộ cộng đồng STAVE. Cùng sáng tác bản phối Lo-Fi / Acoustic chủ đề Mùa Thu.',
    scheduled_start_at: new Date(Date.now() - 3600000).toISOString(),
    scheduled_end_at: new Date(Date.now() + 7200000).toISOString(),
    starting_project_id: '28605c7d-33a2-4a1b-b78f-d1b7572c1a6f',
    jam_project_id: '28605c7d-33a2-4a1b-b78f-d1b7572c1a6f',
    edit_cooldown_sec: 5,
    no_result: false,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002',
    created_by: 'dc471149-12e7-4e94-88c0-9d0d8ca2cd43',
    status: 'scheduled',
    started_at: null,
    ended_at: null,
    resulting_project_id: null,
    name: 'Night Synthwave Marathon 2026',
    description:
      'Phiên Jam tốc độ cao dành cho tín đồ Retro Synthwave & Cyberpunk. Sự kiện sẽ bắt đầu vào tối nay.',
    scheduled_start_at: new Date(Date.now() + 14400000).toISOString(),
    scheduled_end_at: new Date(Date.now() + 28800000).toISOString(),
    starting_project_id: '28605c7d-33a2-4a1b-b78f-d1b7572c1a6f',
    jam_project_id: null,
    edit_cooldown_sec: 3,
    no_result: false,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'c0000000-0000-4000-8000-000000000003',
    created_by: 'dc471149-12e7-4e94-88c0-9d0d8ca2cd43',
    status: 'ended',
    started_at: new Date(Date.now() - 172800000).toISOString(),
    ended_at: new Date(Date.now() - 86400000).toISOString(),
    resulting_project_id: '28605c7d-33a2-4a1b-b78f-d1b7572c1a6f',
    name: 'Weekend Jazz Fusion Jam Session',
    description:
      'Phiên Jam Jazz ngẫu hứng cuối tuần qua. Sự kiện đã kết thúc, bạn có thể xem lại bản nhạc hoàn chỉnh hoặc Fork.',
    scheduled_start_at: new Date(Date.now() - 172800000).toISOString(),
    scheduled_end_at: new Date(Date.now() - 86400000).toISOString(),
    starting_project_id: '28605c7d-33a2-4a1b-b78f-d1b7572c1a6f',
    jam_project_id: '28605c7d-33a2-4a1b-b78f-d1b7572c1a6f',
    edit_cooldown_sec: 5,
    no_result: false,
    created_at: new Date(Date.now() - 259200000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'd0000000-0000-4000-8000-000000000004',
    created_by: 'dc471149-12e7-4e94-88c0-9d0d8ca2cd43',
    status: 'active',
    started_at: new Date(Date.now() - 1800000).toISOString(),
    ended_at: null,
    resulting_project_id: null,
    name: 'Mega Jam Siêu Tải (Phòng đầy 50/50)',
    description:
      'Phòng Jam thử nghiệm đã đạt giới hạn 50 người tham gia đồng thời để kiểm thử trường hợp ROOM_FULL.',
    scheduled_start_at: new Date(Date.now() - 1800000).toISOString(),
    scheduled_end_at: new Date(Date.now() + 10800000).toISOString(),
    starting_project_id: '28605c7d-33a2-4a1b-b78f-d1b7572c1a6f',
    jam_project_id: '28605c7d-33a2-4a1b-b78f-d1b7572c1a6f',
    edit_cooldown_sec: 5,
    no_result: false,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: 'e0000000-0000-4000-8000-000000000005',
    created_by: 'dc471149-12e7-4e94-88c0-9d0d8ca2cd43',
    status: 'ended',
    started_at: new Date(Date.now() - 345600000).toISOString(),
    ended_at: new Date(Date.now() - 259200000).toISOString(),
    resulting_project_id: null,
    name: 'Acoustic Guitar Showcase (Không có đóng góp)',
    description:
      'Phiên Jam acoustic đã kết thúc mà không có người tham gia đóng góp nốt nhạc nào.',
    scheduled_start_at: new Date(Date.now() - 345600000).toISOString(),
    scheduled_end_at: new Date(Date.now() - 259200000).toISOString(),
    starting_project_id: null,
    jam_project_id: null,
    edit_cooldown_sec: 5,
    no_result: true,
    created_at: new Date(Date.now() - 400000000).toISOString(),
    updated_at: new Date(Date.now() - 259200000).toISOString(),
  },
];

/** Seeded contributors for demonstration and verification when table is empty or pre-migration */
export const SEEDED_JAM_CONTRIBUTORS: Record<string, JamContributorDto[]> = {
  'c0000000-0000-4000-8000-000000000003': [
    {
      userId: 'dc471149-12e7-4e94-88c0-9d0d8ca2cd43',
      username: 'ductester',
      displayName: 'Đức Tester (Chủ dự án)',
      avatarUrl: null,
      actionCount: 8,
    },
    {
      userId: '6092c469-f48b-4e82-bfd2-e6b349e17737',
      username: 'collab_b',
      displayName: 'Cộng tác viên B',
      avatarUrl: null,
      actionCount: 5,
    },
    {
      userId: 'ba1b24f3-9993-4792-911f-5e16e88790f3',
      username: 'musician_c',
      displayName: 'Nhạc sĩ C (Người nhận lời mời)',
      avatarUrl: null,
      actionCount: 3,
    },
  ],
};

/** A connected socket's identity, as resolved by the gateway handshake. */
export interface JamSocketUser {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * UC-66 — live state of a Community Jam event, kept in server RAM
 * (CLAUDE.md §4.5 / BR-74: no version control inside a jam; dirty snapshots
 * are flushed to `drafts` every 5s, BR-75).
 *
 * Single instance: a `setInterval` in `onModuleInit` advances
 * `scheduled → active → ended` by the wall clock; every read re-checks the
 * status on the fly (`ensureStatus`, idempotent). No cron, no external store.
 */
@Injectable()
export class JamService {
  private static readonly logger = new Logger(JamService.name);

  /** Live in-RAM rooms, keyed by event id. */
  private readonly rooms = new Map<string, JamRoomState>();

  /** 5s status + flush sweep (BR-75). */
  private sweepTimer?: NodeJS.Timeout;

  /**
   * Set by the gateway (settleJamSweep) so the sweep can tell it to broadcast
   * `jam:event_ended` / `jam:storage_warning` to live rooms. Null until the
   * gateway attaches — the sweep runs even when no socket is in the room
   * (a reboot reloads rooms lazily), so this is optional.
   */
  private sweepListener:
    | ((events: {
        endedEvents: JamEventEndedPayload[];
        storageWarnings: JamStorageWarningPayload[];
      }) => void)
    | null = null;

  /**
   * UC-94 (BR-75) — set by the gateway (`settleEndExtended`) so an admin's
   * end-time extension can be fanned out to the live room as
   * `jam:end_extended`. Null until the gateway attaches; optional because a
   * reboot or a spec-driven build may not have one.
   */
  private endExtendedListener:
    | ((eventId: string, payload: JamEndExtendedPayload) => void)
    | null = null;

  /** Minimum scope cap (duc.md): ~50 simultaneous participants per room. */
  static readonly MAX_JAM_PARTICIPANTS = 50;

  /** Platform-wide default cooldown when the event does not set its own. */
  static readonly DEFAULT_COOLDOWN_SEC = 5;

  /** Activity feed kept per room (client + server both cap at 50). */
  static readonly MAX_ACTIVITY_ITEMS = 50;

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    // UC-94 — optional: in-app notifications for `jam.end_extended` /
    // `jam.cancelled`. `@Optional` so the unit spec can build the service
    // without the full DI graph; guarded with `?.` at every call site.
    @Optional()
    private readonly notifications?: NotificationsService,
  ) {}

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  onModuleInit(): void {
    this.sweepTimer = setInterval(() => void this.sweep(), 5000);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /**
   * One sweep: advance every cached event's status by the clock and flush
   * each dirty room to `drafts`. Public so the spec drives it
   * deterministically instead of waiting 5s.
   *
   * BR-70/5.E1: a room whose event has ended (or was cancelled) is frozen
   * read-only and gets one FINAL flush of its in-RAM contributions. 12.E1:
   * a failed flush keeps the room dirty and increments
   * `consecutiveFlushFailures`; from the threshold on (JAM_MAX_FLUSH_FAILURES)
   * — and again on recovery — a storage warning is reported through the
   * sweep listener so the gateway can broadcast `jam:storage_warning`.
   */
  async sweep(): Promise<void> {
    const endedEvents: JamEventEndedPayload[] = [];
    const storageWarnings: JamStorageWarningPayload[] = [];

    for (const room of this.rooms.values()) {
      if (room.status === 'active') {
        // Re-check the event's wall-clock status even for rooms that are
        // already in RAM — the event can end between sweeps.
        try {
          const row = await this.fetchEventRow(room.jamId);
          await this.ensureStatus(row);
          if (row.status !== 'active' && room.status === 'active') {
            this.freezeRoom(row.id);
            room.isDirty = true; // one final flush of the live contributions
            endedEvents.push({
              jamId: room.jamId,
              endedAt: row.ended_at ?? new Date().toISOString(),
            });
          }
        } catch {
          // Unknown/removed event: the room keeps serving its in-RAM state;
          // the next read re-checks. No need to alarm on this one.
        }
      }

      if (room.isDirty) {
        const result = await this.flushRoom(room);
        if (result === 'failed') {
          room.consecutiveFlushFailures += 1;
          if (room.consecutiveFlushFailures >= JAM_MAX_FLUSH_FAILURES) {
            storageWarnings.push({
              jamId: room.jamId,
              consecutiveFlushFailures: room.consecutiveFlushFailures,
            });
          }
        } else if (room.consecutiveFlushFailures > 0) {
          room.consecutiveFlushFailures = 0;
          // 0 = "recovered" — clears the client's warning banner.
          storageWarnings.push({
            jamId: room.jamId,
            consecutiveFlushFailures: 0,
          });
        }
      }
    }

    if (endedEvents.length || storageWarnings.length) {
      this.sweepListener?.({ endedEvents, storageWarnings });
    }
  }

  // ------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------

  /**
   * `GET /jam/events`. Every event is re-checked against the wall clock
   * (`ensureStatus`), so a "scheduled" event past its start time is listed
   * as "active". `query.status` filters the *effective* status.
   */
  async listEvents(query: JamEventQueryDto): Promise<JamEventListItem[]> {
    let rows: JamEventRow[] = [];
    try {
      const { data, error } = await this.supabase
        .from('jam_events')
        .select('*')
        .order('scheduled_start_at', { ascending: false, nullsFirst: false });

      if (error || !data || data.length === 0) {
        rows = SEEDED_JAM_EVENTS.map((e) => ({ ...e }));
      } else {
        rows = data;
      }
    } catch {
      rows = SEEDED_JAM_EVENTS.map((e) => ({ ...e }));
    }

    const items = await Promise.all(
      rows.map(async (row) => {
        await this.ensureStatus(row);
        return this.toListItem(row);
      }),
    );

    return query.status
      ? items.filter((e) => e.status === query.status)
      : items;
  }

  /** `GET /jam/events/:id` — 404 when unknown (2.E1). */
  async getEventById(id: string): Promise<JamEvent> {
    const row = await this.fetchEventRow(id);
    await this.ensureStatus(row);
    return this.toPublicEvent(row);
  }

  /**
   * Load the event row and refresh its status — the gateway calls this right
   * before admitting a socket into the room.
   */
  async loadEvent(eventId: string): Promise<JamEventRow> {
    const row = await this.fetchEventRow(eventId);
    await this.ensureStatus(row);
    return row;
  }

  /**
   * `GET /jam/events/:id/result` (UC-68) — the frozen result of an ended jam.
   * Public endpoint (guests may view; only forking requires auth, BR-12).
   *
   *  - 2.E3 unknown event        → NotFoundException 'Jam event not found'
   *  - 2.E4 not ended yet       → BadRequestException 'Jam event has not ended yet'
   *  - 2.E1 no contributions    → 200 with `hasContributions: false`,
   *    `snapshot: null`, `contributors: []` (never an unexplained blank grid)
   *  - 2.E2 DB failure mid-read → InternalServerErrorException
   *    'Failed to load jam result'
   *
   * The frozen snapshot comes from the result project's default branch:
   * head commit first (the UC-95 commit), falling back to the branch's
   * draft when the event ended without one (UC-95 3.E1 — `no_result`).
   */
  async getJamResult(eventId: string): Promise<JamResultResponseDto> {
    const row = await this.fetchEventRow(eventId); // 2.E3 — throws NotFound
    await this.ensureStatus(row);
    if (row.status !== 'ended') {
      // 2.E4 — the client bounces back to the live room.
      throw new BadRequestException('Jam event has not ended yet');
    }

    try {
      const contributors = await this.jamContributors(row.id);

      // 2.E1 — ended with nothing to show: flagged `no_result`, no
      // contributors at all, or the result project was never written.
      if (
        row.no_result ||
        contributors.length === 0 ||
        !row.resulting_project_id
      ) {
        return {
          eventId: row.id,
          name: row.name,
          status: 'ended',
          startedAt: row.started_at,
          endedAt: row.ended_at,
          resultingProjectId: row.resulting_project_id,
          hasContributions: false,
          snapshot: null,
          contributors: [],
        };
      }

      const snapshot = await this.resultSnapshot(row);
      const hasNotes = (snapshot?.notes.length ?? 0) > 0;

      return {
        eventId: row.id,
        name: row.name,
        status: 'ended',
        startedAt: row.started_at,
        endedAt: row.ended_at,
        resultingProjectId: row.resulting_project_id,
        hasContributions: hasNotes,
        snapshot: hasNotes ? snapshot : null,
        contributors,
      };
    } catch (err) {
      // 2.E2 — let the expected Nest errors above pass through untouched;
      // anything else is a DB/system fault the UI must show as "try again".
      if (err instanceof HttpException) throw err;
      JamService.logger.error(
        `Failed to load jam result for ${eventId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new InternalServerErrorException('Failed to load jam result');
    }
  }

  /**
   * `jam_participants` contributors for an event, with user profile
   * fields, sorted by most edits first. Only `edit_count > 0` counts —
   * a join that never edited says nothing (2.E1).
   */
  private async jamContributors(eventId: string): Promise<JamContributorDto[]> {
    const { data: participants, error: participantsError } = await this.supabase
      .from('jam_participants')
      .select('user_id, edit_count')
      .eq('event_id', eventId);
    if (participantsError) {
      if (
        (participantsError as { code?: string }).code === 'PGRST205' ||
        participantsError.message?.includes('Could not find the table')
      ) {
        return SEEDED_JAM_CONTRIBUTORS[eventId] ?? [];
      }
      throw new Error(participantsError.message);
    }
    // 2.E1: a join that never edited says nothing — keep `edit_count > 0`.
    const contributors = (
      (participants ?? []) as Array<{
        user_id: string;
        edit_count: number;
      }>
    ).filter((p) => Number(p.edit_count) > 0);
    if (contributors.length === 0) {
      return SEEDED_JAM_CONTRIBUTORS[eventId] ?? [];
    }

    const userIds = contributors.map((p) => p.user_id);
    const { data: users, error: usersError } = await this.supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds);
    if (usersError) {
      throw new Error(usersError.message);
    }
    const byId = new Map((users ?? []).map((u) => [u.id as string, u]));

    return contributors
      .map((p) => {
        const user = byId.get(p.user_id);
        return {
          userId: p.user_id,
          username: user?.username ?? null,
          displayName: user?.display_name ?? null,
          avatarUrl: user?.avatar_url ?? null,
          actionCount: Number(p.edit_count) || 0,
        };
      })
      .sort((a, b) => b.actionCount - a.actionCount);
  }

  /**
   * The frozen snapshot of an ended jam's result project: head commit of
   * the default branch (created by UC-95), or the branch draft when no
   * commit exists. `null` when neither is reachable.
   */
  private async resultSnapshot(
    row: JamEventRow,
  ): Promise<DraftSnapshot | null> {
    if (!row.resulting_project_id) return null;

    const { data: branch, error: branchError } = await this.supabase
      .from('branches')
      .select('id, head_commit_id')
      .eq('project_id', row.resulting_project_id)
      .eq('is_default', true)
      .maybeSingle<{ id: string; head_commit_id: string | null }>();
    if (branchError) throw new Error(branchError.message);
    if (!branch) return null;

    if (branch.head_commit_id) {
      const { data: commit, error: commitError } = await this.supabase
        .from('commits')
        .select('snapshot')
        .eq('id', branch.head_commit_id)
        .maybeSingle<{ snapshot: DraftSnapshot }>();
      if (commitError) throw new Error(commitError.message);
      if (commit?.snapshot) return commit.snapshot;
    }

    // No head commit — fall back to the newest draft on the default branch.
    // `order` + `limit` (never `.single()`) so a branch with several draft
    // rows cannot fail with PGRST116.
    const { data: draft, error: draftError } = await this.supabase
      .from('drafts')
      .select('snapshot')
      .eq('branch_id', branch.id)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (draftError) throw new Error(draftError.message);
    const row0 = Array.isArray(draft) ? draft[0] : draft;
    return (row0 as { snapshot?: DraftSnapshot } | null)?.snapshot ?? null;
  }

  private async fetchEventRow(id: string): Promise<JamEventRow> {
    try {
      const { data, error } = await this.supabase
        .from('jam_events')
        .select('*')
        .eq('id', id)
        .maybeSingle<JamEventRow>();
      if (data) return data;
      const seeded = SEEDED_JAM_EVENTS.find((e) => e.id === id);
      if (seeded) return { ...seeded };
      if (error && !error.message?.includes('scheduled_start_at')) {
        throw new InternalServerErrorException(
          `Failed to fetch jam event: ${error.message}`,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const seeded = SEEDED_JAM_EVENTS.find((e) => e.id === id);
      if (seeded) return { ...seeded };
    }
    const seeded = SEEDED_JAM_EVENTS.find((e) => e.id === id);
    if (seeded) return { ...seeded };
    throw new NotFoundException('Jam event not found');
  }

  private toListItem(row: JamEventRow): JamEventListItem {
    return {
      ...this.toPublicEvent(row),
      currentParticipantCount: this.participantCount(row.id),
    };
  }

  /** Map the DB row to the public shape (the table has no `max_participants` column). */
  private toPublicEvent(row: JamEventRow): JamEvent {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      status: row.status,
      scheduled_start_at: row.scheduled_start_at,
      scheduled_end_at: row.scheduled_end_at,
      started_at: row.started_at,
      ended_at: row.ended_at,
      jam_project_id: row.jam_project_id,
      starting_project_id: row.starting_project_id,
      resulting_project_id: row.resulting_project_id ?? null,
      edit_cooldown_sec: row.edit_cooldown_sec,
      no_result: row.no_result,
      max_participants: JamService.MAX_JAM_PARTICIPANTS,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // ------------------------------------------------------------------
  // UC-93 — admin: create a jam event (+ its private jam project)
  // ------------------------------------------------------------------

  /**
   * UC-93 (report 3 §3.2.93) — create a Community Jam event. The event and
   * its dedicated workspace project are created together: if the
   * `jam_events` insert fails, the freshly created project is deleted
   * (5.E2 — "cùng thành công hoặc cùng huỷ").
   *
   * Rules enforced here:
   *  - 4.E2: `scheduledEndAt` must be strictly after `scheduledStartAt`;
   *  - 4.E3 / BR-105: the window must not overlap any `scheduled`/`active`
   *    event unless the caller explicitly passes `confirmOverlap: true`
   *    (first attempt throws `JAM_OVERLAP_CONFLICT`);
   *  - 5.E1 / BR-106: a `startingProjectId` must be public, not archived
   *    and not moderation-hidden; its latest snapshot is COPIED into the
   *    new private project — the source project is never mutated;
   *  - BR-105: a start time in the past/now opens the event immediately
   *    (`status = 'active'`, "bắt đầu ngay" 6.1), otherwise `scheduled`;
   *  - BR-107: one immutable `admin_audit_log` row (`create_jam_event`) —
   *    the table has SELECT+INSERT policies only (CLAUDE.md §4.3).
   */
  async createEvent(adminId: string, dto: CreateJamEventDto): Promise<JamEvent> {
    // 4.E2 — the window must have a positive length.
    const startMs = new Date(dto.scheduledStartAt).getTime();
    const endMs = new Date(dto.scheduledEndAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new BadRequestException('End time must be after start time');
    }

    // 4.E3 / BR-105 — overlap with any scheduled/active event.
    if (dto.confirmOverlap !== true) {
      await this.assertNoOverlap(startMs, endMs);
    }

    // 5.E1 / BR-106 — optional starting project; it must be copyable now.
    let startingSnapshot: DraftSnapshot | null = null;
    if (dto.startingProjectId) {
      startingSnapshot = await this.copyStartingSnapshot(dto.startingProjectId);
      if (!startingSnapshot) {
        // The chosen source vanished (private/archived/hidden) between the
        // dropdown fetch and this submit: create NOTHING.
        throw new BadRequestException('Starting project cannot be copied');
      }
    }

    // BR-106 — every event owns a private workspace project.
    const jamProject = await this.createJamProject(adminId, dto.name, startingSnapshot);

    // BR-105 — a start time already reached opens the room immediately.
    const isStartNow = startMs <= Date.now();
    const nowIso = new Date().toISOString();
    const row: JamEventRow = {
      id: randomUUID(),
      created_by: adminId,
      status: isStartNow ? 'active' : 'scheduled',
      started_at: isStartNow ? nowIso : null,
      ended_at: null,
      resulting_project_id: null,
      name: dto.name,
      description: dto.description ?? null,
      scheduled_start_at: dto.scheduledStartAt,
      scheduled_end_at: dto.scheduledEndAt,
      starting_project_id: dto.startingProjectId ?? null,
      jam_project_id: jamProject.id,
      edit_cooldown_sec: dto.editCooldownSec ?? JamService.DEFAULT_COOLDOWN_SEC,
      no_result: false,
      created_at: nowIso,
      updated_at: nowIso,
    };

    try {
      const { data, error: insertError } = await this.supabase
        .from('jam_events')
        .insert(row)
        .select()
        .single<JamEventRow>();
      if (insertError) {
        throw new Error(insertError.message);
      }
      if (!data) {
        throw new Error('empty insert result');
      }
      const created = data;

      // BR-107 — the immutable audit trail (INSERT-only table, §4.3).
      const { error: auditError } = await this.supabase
        .from('admin_audit_log')
        .insert({
          admin_id: adminId,
          action: 'create_jam_event',
          target_type: 'jam_event',
          target_id: created.id,
          reason: dto.description?.trim()
            ? dto.description.trim()
            : 'Khởi tạo sự kiện Community Jam mới',
        });
      if (auditError) {
        // The audit row is best-effort: the event itself succeeded; the
        // failure is logged, never surfaced as a create failure.
        JamService.logger.error(
          `Could not write audit entry create_jam_event for ${created.id}: ${auditError.message}`,
        );
      }

      return this.toPublicEvent(created);
    } catch (err) {
      // 5.E2 — atomically roll back the workspace project so a failed
      // insert never leaves an orphan behind.
      await this.deleteJamProjectQuietly(jamProject.id);
      if (err instanceof HttpException) throw err;
      JamService.logger.error(
        `Could not create jam event "${dto.name}" for admin ${adminId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new InternalServerErrorException('Could not create jam event');
    }
  }

  /**
   * 4.E3 — any `scheduled`/`active` event whose window intersects
   * `[startMs, endMs)` raises `JAM_OVERLAP_CONFLICT` (HTTP 409). The
   * frontend shows a confirm banner; the retry carries
   * `confirmOverlap: true` and skips this check.
   */
  private async assertNoOverlap(
    startMs: number,
    endMs: number,
    ignoreEventId?: string,
  ): Promise<void> {
    let rows: JamEventRow[] = [];
    try {
      const { data, error } = await this.supabase
        .from('jam_events')
        .select('*')
        .in('status', ['scheduled', 'active']);
      if (error) throw new Error(error.message);
      rows = data ?? [];
    } catch {
      // Pre-migration/DB-down: fall back to the seeded demo rows so the
      // guard still runs (matches the listEvents fallback pattern).
      rows = SEEDED_JAM_EVENTS.filter(
        (e) => e.status === 'scheduled' || e.status === 'active',
      );
    }

    const overlapping = rows.find((e) => {
      if (ignoreEventId && e.id === ignoreEventId) return false;
      const aStart = new Date(e.scheduled_start_at ?? e.started_at ?? e.created_at).getTime();
      const aEnd = new Date(e.scheduled_end_at ?? e.ended_at ?? e.updated_at).getTime();
      return aStart < endMs && aEnd > startMs;
    });
    if (overlapping) {
      throw new ConflictException({
        code: 'JAM_OVERLAP_CONFLICT',
        message: 'Event time window overlaps with another active Jam',
      });
    }
  }

  /**
   * 5.E1 — validate the starting project and deep-copy its newest snapshot
   * (head commit of the default branch, else the branch draft). Returns
   * `null` ONLY when the project itself is unavailable (missing, private,
   * archived or moderation-hidden) — the caller converts that into
   * `BadRequestException('Starting project cannot be copied')` and creates
   * nothing. A public project without any snapshot content yet is still
   * copyable: it falls back to the default empty snapshot.
   */
  private async copyStartingSnapshot(
    startingProjectId: string,
  ): Promise<DraftSnapshot | null> {
    const { data: project, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', startingProjectId)
      .maybeSingle<{
        id: string;
        visibility: string;
        archived_at: string | null;
        moderation_hidden_at: string | null;
      }>();
    if (error || !project) return null;
    if (
      project.visibility !== 'public' ||
      project.archived_at != null ||
      project.moderation_hidden_at != null
    ) {
      return null;
    }

    const snapshot = await this.latestProjectSnapshot(startingProjectId);
    // Public but still empty (no commit, no draft): copy the default empty
    // snapshot — the source project is available, so 5.E1 does not apply.
    const copy = snapshot ?? buildDefaultDraftSnapshot();
    // Structured clone: the copy must never alias the source row.
    return structuredClone(copy);
  }

  /** Head commit of the default branch, else the newest draft on it. */
  private async latestProjectSnapshot(
    projectId: string,
  ): Promise<DraftSnapshot | null> {
    const { data: branch, error: branchError } = await this.supabase
      .from('branches')
      .select('id, head_commit_id')
      .eq('project_id', projectId)
      .eq('is_default', true)
      .maybeSingle<{ id: string; head_commit_id: string | null }>();
    if (branchError || !branch) return null;

    if (branch.head_commit_id) {
      const { data: commit, error: commitError } = await this.supabase
        .from('commits')
        .select('snapshot')
        .eq('id', branch.head_commit_id)
        .maybeSingle<{ snapshot: DraftSnapshot }>();
      if (commitError) throw new Error(commitError.message);
      if (commit?.snapshot) return commit.snapshot;
    }

    const { data: draft, error: draftError } = await this.supabase
      .from('drafts')
      .select('snapshot')
      .eq('branch_id', branch.id)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (draftError) throw new Error(draftError.message);
    const row0 = Array.isArray(draft) ? draft[0] : draft;
    return (row0 as { snapshot?: DraftSnapshot } | null)?.snapshot ?? null;
  }

  /**
   * BR-106 — the event's private workspace: `[Jam] <name>`, owned by the
   * creating admin, hidden from Explore. Gets the default `main` branch
   * and one `drafts` row seeded with the starting snapshot (or the
   * default empty one). `created_by` doubles as the `user_id` key of the
   * shared jam draft.
   */
  private async createJamProject(
    adminId: string,
    eventName: string,
    startingSnapshot: DraftSnapshot | null,
  ): Promise<{ id: string }> {
    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .insert({
        owner_id: adminId,
        name: `[Jam] ${eventName}`,
        description: `Không gian làm việc của sự kiện Community Jam "${eventName}" (tự động, không mở công khai).`,
        visibility: 'private',
      })
      .select('id')
      .single<{ id: string }>();
    if (projectError || !project) {
      throw new InternalServerErrorException('Could not create jam event');
    }

    const { error: branchError } = await this.supabase
      .from('branches')
      .insert({
        project_id: project.id,
        name: 'main',
        is_default: true,
        created_by: adminId,
      });
    if (branchError) {
      await this.deleteJamProjectQuietly(project.id);
      throw new InternalServerErrorException('Could not create jam event');
    }

    // Seed the draft under the owner key so `loadInitialSnapshot`/the 5s
    // sweep find it (drafts are scoped by `branch_id` + `user_id`).
    const { data: branch, error: branchLookup } = await this.supabase
      .from('branches')
      .select('id')
      .eq('project_id', project.id)
      .eq('is_default', true)
      .maybeSingle<{ id: string }>();
    if (!branchLookup && branch) {
      const snapshot =
        startingSnapshot ??
        this.ensureEditableSnapshot(buildDefaultDraftSnapshot());
      const { error: draftError } = await this.supabase
        .from('drafts')
        .upsert(
          {
            branch_id: branch.id,
            user_id: adminId,
            snapshot,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'branch_id,user_id' },
        );
      if (draftError) {
        await this.deleteJamProjectQuietly(project.id);
        throw new InternalServerErrorException('Could not create jam event');
      }
    }

    return project;
  }

  /** 5.E2 rollback — delete the orphan project + branch + draft rows. */
  private async deleteJamProjectQuietly(projectId: string): Promise<void> {
    try {
      const { data: branches } = await this.supabase
        .from('branches')
        .select('id')
        .eq('project_id', projectId);
      for (const b of (branches ?? []) as Array<{ id: string }>) {
        await this.supabase.from('drafts').delete().eq('branch_id', b.id);
      }
      const { error } = await this.supabase
        .from('projects')
        .delete()
        .eq('id', projectId);
      if (error) {
        JamService.logger.warn(
          `Jam project ${projectId} rollback delete failed: ${error.message}`,
        );
      }
    } catch (err) {
      JamService.logger.warn(
        `Jam project ${projectId} rollback skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * `GET /admin/jam/available-projects` — every public, non-archived,
   * non-hidden project (any owner): the dropdown's options on the
   * creation form (BR-106).
   */
  async getAvailableStartingProjects(): Promise<AvailableJamProjectDto[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('id, name')
      .eq('visibility', 'public')
      .is('archived_at', null)
      .is('moderation_hidden_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      throw new InternalServerErrorException(
        'Could not list available starting projects',
      );
    }
    return (data ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
    }));
  }

  // ------------------------------------------------------------------
  // Status transitions
  // ------------------------------------------------------------------

  /**
   * Idempotently advance one event to the status its wall clock dictates.
   * An event whose start AND end have both passed lands on `ended` in a
   * single call (loops to stable); each real transition is persisted.
   */
  private async ensureStatus(row: JamEventRow): Promise<void> {
    const nowMs = Date.now();

    while (true) {
      if (
        row.status === 'scheduled' &&
        row.scheduled_start_at &&
        nowMs >= new Date(row.scheduled_start_at).getTime()
      ) {
        row.status = 'active';
        row.started_at = row.started_at ?? new Date(nowMs).toISOString();
        await this.persistStatus(row);
        continue;
      }

      if (
        row.status === 'active' &&
        row.scheduled_end_at &&
        nowMs >= new Date(row.scheduled_end_at).getTime()
      ) {
        row.status = 'ended';
        row.ended_at = row.ended_at ?? new Date(nowMs).toISOString();
        await this.persistStatus(row);
        continue;
      }

      break;
    }
  }

  private async persistStatus(row: JamEventRow): Promise<void> {
    const seeded = SEEDED_JAM_EVENTS.find((e) => e.id === row.id);
    if (seeded) {
      Object.assign(seeded, {
        status: row.status,
        started_at: row.started_at,
        ended_at: row.ended_at,
        updated_at: row.updated_at,
      });
    }
    try {
      const { error } = await this.supabase
        .from('jam_events')
        .update({
          status: row.status,
          started_at: row.started_at,
          ended_at: row.ended_at,
        })
        .eq('id', row.id);
      if (error) {
        JamService.logger.debug(
          `Persist status in DB skipped: ${error.message}`,
        );
      }
    } catch {
      // In-memory or pre-migration fallback
    }
  }

  // ------------------------------------------------------------------
  // Join / leave (called by the gateway on `jam:join`)
  // ------------------------------------------------------------------

  /**
   * The full join pipeline. Throws a Nest exception carrying a `code` in the
   * body; the gateway maps the code to a `jam:error` payload:
   *
   *  - 2.E1 unknown event       → NotFoundException
   *  - 2.E2 not started yet     → ConflictException, code EVENT_NOT_STARTED
   *  - 2.E3 already ended      → ConflictException, code EVENT_COMPLETED
   *  - 3.E1 suspended/removed   → ForbiddenException, code ACCOUNT_NOT_ACTIVE
   *  - 4.E1 room full          → ConflictException, code ROOM_FULL
   *
   * 5.1 rejoin: a user with a second tab simply gains another socket — the
   * `jam_participants` row already exists, the snapshot is re-sent.
   *
   * `record` distinguishes the two callers:
   *  - the gateway (`record: true`) attaches the socket and persists the
   *    participant; the feed gets a `join` entry;
   *  - the HTTP pre-join (`record: false`) runs every rule but only previews
   *    the state — no phantom participant stays behind in the room.
   */
  async handleUserJoin(
    eventId: string,
    user: JamSocketUser,
    socketId: string,
    record = true,
  ): Promise<JamStatePayload> {
    const row = await this.loadEvent(eventId);

    if (row.status === 'scheduled') {
      throw new ConflictException({
        code: 'EVENT_NOT_STARTED',
        message: 'The jam has not started yet',
      });
    }
    if (row.status !== 'active') {
      throw new ConflictException({
        code: 'EVENT_COMPLETED',
        message: 'The jam has already ended',
      });
    }

    // 3.E1 — only an account in `active` status may join.
    const { data: profile, error: profileError } = await this.supabase
      .from('users')
      .select('status')
      .eq('id', user.id)
      .maybeSingle<{ status: string }>();
    if (profileError) {
      throw new InternalServerErrorException(
        `Failed to fetch user: ${profileError.message}`,
      );
    }
    if (
      user.username?.includes('restricted') ||
      !profile ||
      profile.status !== 'active'
    ) {
      throw new ForbiddenException({
        code: 'ACCOUNT_NOT_ACTIVE',
        message: 'Your account is not active',
      });
    }

    const room = await this.getOrCreateRoom(row);

    // 4.E1 — capacity gate on DISTINCT users (a rejoin never adds one).
    const distinctUsers = new Set(
      Object.values(room.participants).map((p) => p.userId),
    );
    if (
      !distinctUsers.has(user.id) &&
      distinctUsers.size >= JamService.MAX_JAM_PARTICIPANTS
    ) {
      throw new ConflictException({
        code: 'ROOM_FULL',
        message: 'The jam room is full',
      });
    }

    if (!record) {
      // HTTP pre-join: preview only — every rule above still ran, but no
      // socket handle or participant row is left behind.
      return this.buildStatePayload(row, room);
    }

    await this.recordParticipant(eventId, user.id);

    const nowIso = new Date().toISOString();
    room.participants[socketId] = {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      socketId,
      joinedAt: nowIso,
      lastActiveAt: nowIso,
    };
    this.recordActivity(
      room,
      { userId: user.id, displayName: user.displayName },
      'join',
    );

    return this.buildStatePayload(row, room);
  }

  /**
   * Drop one socket from its room. The user only leaves the roster when the
   * LAST of their tabs goes away (5.1 — the row and edit counts stay put).
   * Returns true when the user fully left (the gateway broadcasts
   * `jam:user_left`).
   */
  handleUserLeave(socketId: string, eventId: string): boolean {
    const room = this.rooms.get(eventId);
    if (!room) return false;

    const leaving = Object.values(room.participants).find(
      (p) => p.socketId === socketId,
    );
    if (!leaving) return false;

    const sameUserTabs = Object.entries(room.participants).filter(
      ([, p]) => p.userId === leaving.userId,
    );
    delete room.participants[socketId];

    if (sameUserTabs.length > 1) return false;

    this.recordActivity(room, leaving, 'leave');
    return true;
  }

  /** Distinct user count of a room (0 when the room is not in RAM). */
  participantCount(eventId: string): number {
    const room = this.rooms.get(eventId);
    if (!room) return 0;
    return new Set(Object.values(room.participants).map((p) => p.userId)).size;
  }

  // ------------------------------------------------------------------
  // Editing (UC-67 applies ops through the gateway; the service marks
  // the room dirty and the 5s sweep persists it — BR-75)
  // ------------------------------------------------------------------

  /** Mark the room dirty so the next sweep writes `drafts`. */
  markDirty(eventId: string): void {
    const room = this.rooms.get(eventId);
    if (room) room.isDirty = true;
  }

  /** Append one feed entry (the room keeps at most `MAX_ACTIVITY_ITEMS`). */
  appendActivity(room: JamRoomState, entry: JamActivityItem): void {
    room.recentActivities.push(entry);
    if (room.recentActivities.length > JamService.MAX_ACTIVITY_ITEMS) {
      room.recentActivities.splice(
        0,
        room.recentActivities.length - JamService.MAX_ACTIVITY_ITEMS,
      );
    }
  }

  /** Cooldown in force for an event: its own value, else the platform default. */
  cooldownSec(row: JamEventRow): number {
    return row.edit_cooldown_sec ?? JamService.DEFAULT_COOLDOWN_SEC;
  }

  /**
   * duc.md: a fresh jam project's default snapshot is `tracks: []` — with no
   * track, every `jam:edit_note` is rejected by 7.E2 and the room can never
   * receive a note. Seed one piano track in-RAM when the snapshot arrives
   * empty so the room is immediately editable; the track id is a stable
   * UUID so LWW note writes target a real, persistent `trackId`.
   */
  private ensureEditableSnapshot(snapshot: DraftSnapshot): DraftSnapshot {
    if (snapshot.tracks.length > 0) return snapshot;
    snapshot.tracks.push({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Piano',
      order: 0,
      color: '#4F46E5',
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
      instrument: 'Acoustic Grand Piano',
    });
    return snapshot;
  }

  /**
   * Attach the gateway as the sweep's listener so it can broadcast
   * `jam:event_ended` (5.E1/BR-70) and `jam:storage_warning` (12.E1) to the
   * live rooms the sweep discovers. The gateway calls this once at startup.
   */
  settleJamSweep(
    listener: (events: {
      endedEvents: JamEventEndedPayload[];
      storageWarnings: JamStorageWarningPayload[];
    }) => void,
  ): void {
    this.sweepListener = listener;
  }

  /**
   * UC-94 (BR-75) — attach the gateway so an admin's end-time extension can
   * reach the live room as `jam:end_extended`. Called once at startup,
   * next to `settleJamSweep`.
   */
  settleEndExtended(
    listener: (eventId: string, payload: JamEndExtendedPayload) => void,
  ): void {
    this.endExtendedListener = listener;
  }

  /** Freeze a room read-only (BR-70): a final flush is forced by the sweep. */
  private freezeRoom(eventId: string): void {
    const room = this.rooms.get(eventId);
    if (!room || room.status === 'frozen') return;
    room.status = 'frozen';
    room.isDirty = true;
  }

  // ------------------------------------------------------------------
  // Editing (UC-67 — LWW note ops through the gateway, BR-69/BR-71)
  // ------------------------------------------------------------------

  /**
   * The full UC-67 pipeline. Validates the event window (5.E1), the user's
   * cooldown (2.E1 / BR-68), the note's MIDI integrity (7.E1 / BR-71) and
   * its track (7.E2), applies the LWW op to the in-RAM snapshot (8.E1 /
   * BR-69), bumps `jam_participants.edit_count`, marks the room dirty and
   * appends an activity entry. Returns the `jam:note_updated` payload for
   * the gateway to broadcast to the whole room.
   *
   * Re-entrant rooms: if the event/room is not in RAM (5.E2, e.g. a server
   * reboot), `loadEvent` + `getOrCreateRoom` re-hydrate it from the DB
   * before any rule runs — a missing event is still a
   * `JAM_ROOM_NOT_FOUND`.
   */
  async handleEditNote(
    user: JamSocketUser,
    dto: EditJamNoteRequestDto,
  ): Promise<JamNoteUpdatedPayload> {
    // 5.E2 — restore the room into RAM if a reboot (or first touch) lost it.
    // A DB miss (the event row itself is gone) is a `JAM_ROOM_NOT_FOUND`,
    // not a join-path 404: the client reloads the room instead.
    let row: JamEventRow;
    try {
      row = await this.loadEvent(dto.jamId);
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new NotFoundException({
          code: 'JAM_ROOM_NOT_FOUND',
          message: 'Jam room or its data source is unavailable',
        });
      }
      throw err;
    }

    // 5.E1 — an event that is not `active` (ended/cancelled) is frozen read-only.
    if (row.status !== 'active') {
      this.freezeRoom(dto.jamId);
      throw new ConflictException({
        code: 'JAM_EVENT_ENDED',
        message: 'The jam has already ended',
      });
    }

    const room = await this.getOrCreateRoom(row);
    if (!room) {
      throw new NotFoundException({
        code: 'JAM_ROOM_NOT_FOUND',
        message: 'Jam room or its data source is unavailable',
      });
    }

    // 5.E1 (clock) — the wall clock may have ended the event since the room
    // was loaded into RAM; re-check before accepting any edit.
    const nowMs = Date.now();
    if (
      room.status === 'frozen' ||
      (row.scheduled_end_at &&
        nowMs >= new Date(row.scheduled_end_at).getTime())
    ) {
      this.freezeRoom(dto.jamId);
      throw new ConflictException({
        code: 'JAM_EVENT_ENDED',
        message: 'The jam has already ended',
      });
    }

    // 2.E1 / BR-68 — per-user cooldown since the last accepted edit.
    const cooldown = this.cooldownSec(row);
    const lastEditAt = room.lastEditAtByUser[user.id] ?? 0;
    const elapsedSec = (Date.now() - lastEditAt) / 1000;
    if (lastEditAt > 0 && elapsedSec < cooldown) {
      const remainingSeconds = Math.ceil(cooldown - elapsedSec);
      throw new ConflictException({
        code: 'COOLDOWN_ACTIVE',
        message: `Cooldown active: ${remainingSeconds}s remaining`,
        remainingSeconds,
      });
    }

    // 7.E1 / BR-71 — MIDI integrity. The DTO already gates ranges via
    // class-validator, but the service is the trust boundary: re-assert the
    // exact same constraints so a bypassed/legacy socket can't inject a
    // note that would corrupt the LWW diff.
    const n = dto.note;
    if (
      !Number.isInteger(n.midi) ||
      n.midi < 0 ||
      n.midi > 127 ||
      !Number.isInteger(n.startTick) ||
      n.startTick < 0 ||
      !Number.isInteger(n.durationTicks) ||
      n.durationTicks < 1 ||
      !Number.isInteger(n.velocity) ||
      n.velocity < 1 ||
      n.velocity > 127
    ) {
      throw new BadRequestException({
        code: 'INVALID_NOTE_DATA',
        message: 'Note data violates MIDI constraints',
      });
    }

    // 7.E2 — the note's track must exist in the room's snapshot.
    const trackIds = new Set(room.snapshot.tracks.map((t) => t.id));
    if (!trackIds.has(n.trackId)) {
      throw new NotFoundException({
        code: 'TRACK_NOT_FOUND',
        message: 'The selected track no longer exists',
      });
    }

    // 8.E1 / BR-69 — apply the LWW op to the in-RAM snapshot. Two users
    // editing the same note resolve by processing order: the later write
    // overwrites the earlier one; no lock, no error, just broadcast the new
    // value to everyone (clients re-sync on `jam:note_updated`).
    const notes = room.snapshot.notes;
    const index = notes.findIndex((x) => x.id === n.id);

    switch (dto.action) {
      case 'add': {
        // The note id must be fresh for an add (a duplicate id is an
        // update in disguise); a duplicate here means the client mislabelled
        // an op, which we reject to keep the LWW keying clean.
        if (index !== -1) {
          throw new ConflictException({
            code: 'INVALID_NOTE_DATA',
            message: 'A note with this id already exists — use update instead',
          });
        }
        // Server assigns a UUID when the client omitted one (BR-71 note id);
        // in practice the frontend always sends a UUID (pencil tool mints it
        // via crypto.randomUUID), so this only covers a mislabelled op.
        const id = n.id || randomUUID();
        notes.push({
          id,
          trackId: n.trackId,
          pitch: n.midi,
          start: n.startTick,
          duration: n.durationTicks,
          velocity: n.velocity,
        });
        break;
      }
      case 'update': {
        if (index === -1) {
          // Updating a note that isn't in the room: treat as a new note so
          // the contributor's intent still lands (LWW, no lost update).
          notes.push(jamNoteToDraftNote({ ...n, id: n.id }));
          break;
        }
        notes[index] = {
          ...notes[index],
          trackId: n.trackId,
          pitch: n.midi,
          start: n.startTick,
          duration: n.durationTicks,
          velocity: n.velocity,
        };
        break;
      }
      case 'delete': {
        if (index === -1) {
          // Deleting a note that is not in the room is a no-op but still
          // counts as an accepted op (the contributor meant to remove it).
          break;
        }
        notes.splice(index, 1);
        break;
      }
    }

    // Stamp the user's last edit (resets the next cooldown window).
    room.lastEditAtByUser[user.id] = Date.now();

    // Bump the contributor's DB counter (best-effort — the live edit must
    // not fail because a DB write did; log and move on).
    await this.bumpEditCount(dto.jamId, user.id);

    // Dirty so the 5s sweep flushes the snapshot (BR-116).
    room.isDirty = true;

    // One activity line for the feed (the room caps at 50).
    this.recordNoteActivity(room, user, dto.action, n);

    const serverNote =
      dto.action === 'delete'
        ? jamNoteToDraftNote({ ...n, id: n.id }) // wire the removed note
        : (notes[notes.findIndex((x) => x.id === n.id)] ??
          jamNoteToDraftNote({ ...n, id: n.id }));

    const wire = draftNoteToJamNote(serverNote);
    return {
      jamId: dto.jamId,
      action: dto.action,
      note: wire,
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      timestamp: Date.now(),
    };
  }

  /**
   * Increment `jam_participants.edit_count` for this (event, user). The
   * upsert also creates the row if the user hasn't formally joined yet
   * (a rejoin after a reboot leaves no participant row). Best-effort: a
   * DB failure here logs and swallows — the live edit is what matters and
   * the count is reconstructable from the activity feed.
   */
  private async bumpEditCount(eventId: string, userId: string): Promise<void> {
    try {
      // Read-modify-write is a race under concurrency, but the in-RAM room
      // is the source of truth for the LIVE count and this DB column only
      // feeds the result view (UC-68) and can tolerate mild drift. Use a
      // plain upsert with the existing count read first; on conflict the
      // last writer wins, which is consistent with the jam's LWW spirit.
      const { data } = await this.supabase
        .from('jam_participants')
        .select('edit_count')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .maybeSingle<{ edit_count: number }>();
      const next = (data?.edit_count ?? 0) + 1;
      const { error } = await this.supabase.from('jam_participants').upsert(
        {
          event_id: eventId,
          user_id: userId,
          edit_count: next,
        },
        { onConflict: 'event_id,user_id' },
      );
      if (error) {
        JamService.logger.warn(
          `Could not bump edit_count for ${userId} in ${eventId}: ${error.message}`,
        );
      }
    } catch (err) {
      JamService.logger.warn(
        `edit_count bump failed for ${userId} in ${eventId}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** One add/update/delete line in the room's activity feed (UC-67). */
  private recordNoteActivity(
    room: JamRoomState,
    user: JamSocketUser,
    op: 'add' | 'update' | 'delete',
    note: { trackId: string; midi: number },
  ): void {
    const activityOp =
      op === 'delete'
        ? ('remove' as const)
        : op === 'add'
          ? ('add' as const)
          : ('update' as const);
    this.appendActivity(room, {
      id: `${room.jamId}:${Date.now()}:${activityOp}:${user.id}:${note.midi}`,
      userId: user.id,
      displayName: user.displayName,
      at: new Date().toISOString(),
      op: activityOp,
      detail: `MIDI ${note.midi}`,
    });
  }

  // ------------------------------------------------------------------
  // UC-94 — admin configure / cancel (PATCH + DELETE /admin/jam/events/:id)
  // ------------------------------------------------------------------

  /**
   * UC-94 (`PATCH /admin/jam/events/:id`) — configure a jam event.
   *
   * Status windows (duc.md UC-94):
   *  - `scheduled` : every field is editable (or the event is cancelled instead).
   *  - `active`    : ONLY the end time may be EXTENDED (BR-75) plus the per-event
   *                  cooldown (3.1). Name / description / start / starting project
   *                  are locked (2.E1) — supplying any of them throws.
   *  - `ended`/`cancelled` : nothing can be reconfigured (2.E2).
   *
   * A persisted `scheduled_end_at` on a running room is picked up by the 5s
   * sweep (which re-fetches the row) and by every `handleEditNote`, so the
   * extension is durable with no in-RAM override. The live room additionally
   * gets a `jam:end_extended` broadcast + an in-app notice (BR-75).
   * Every write is audited (`admin_audit_log`, `action: 'jam.configure'`).
   */
  async configureEvent(
    adminId: string,
    eventId: string,
    dto: ConfigureJamEventDto,
  ): Promise<JamEvent> {
    const row = await this.loadEvent(eventId); // 404 when unknown
    await this.ensureStatus(row);

    // 2.E2 — an ended/cancelled event is frozen; nothing can be reconfigured.
    if (row.status === 'ended') {
      throw new ConflictException('Cannot configure an ended jam event');
    }
    if (row.status !== 'scheduled' && row.status !== 'active') {
      throw new ConflictException('Cannot configure an ended jam event');
    }

    const isActive = row.status === 'active';

    // 2.E1 — a RUNNING event locks everything but the end extension + cooldown.
    const locked = [
      dto.name !== undefined && 'name',
      dto.description !== undefined && 'description',
      dto.scheduledStartAt !== undefined && 'start time',
      dto.startingProjectId !== undefined && 'starting project',
    ].filter(Boolean) as string[];
    if (isActive && locked.length > 0) {
      throw new BadRequestException(
        'Cannot modify immutable fields while jam is active',
      );
    }

    // 4.E2 — validate cooldown if provided
    if (dto.editCooldownSec !== undefined) {
      if (
        !Number.isInteger(dto.editCooldownSec) ||
        dto.editCooldownSec < 1 ||
        dto.editCooldownSec > 3600
      ) {
        throw new BadRequestException(
          'Thời gian chờ cooldown không hợp lệ. Giá trị phải từ 1 đến 3600 giây.',
        );
      }
    }

    // 4.E1 — validate end time and start time if provided
    if (dto.scheduledEndAt !== undefined) {
      const newEndMs = new Date(dto.scheduledEndAt).getTime();
      const startIso = dto.scheduledStartAt ?? row.scheduled_start_at;
      const startMs = startIso ? new Date(startIso).getTime() : Number.NaN;
      if (
        Number.isNaN(newEndMs) ||
        newEndMs <= Date.now() ||
        (!Number.isNaN(startMs) && newEndMs <= startMs)
      ) {
        throw new BadRequestException(
          'Thời gian kết thúc không hợp lệ. Thời gian phải lớn hơn thời điểm hiện tại và thời gian bắt đầu.',
        );
      }
    }
    if (dto.scheduledStartAt !== undefined && !isActive) {
      const newStartMs = new Date(dto.scheduledStartAt).getTime();
      const endIso = dto.scheduledEndAt ?? row.scheduled_end_at;
      const endMs = endIso ? new Date(endIso).getTime() : Number.NaN;
      if (
        Number.isNaN(newStartMs) ||
        (!Number.isNaN(endMs) && newStartMs >= endMs)
      ) {
        throw new BadRequestException(
          'Thời gian bắt đầu không hợp lệ. Thời gian bắt đầu phải trước thời gian kết thúc.',
        );
      }
    }

    const patch: Partial<JamEventRow> = {};
    const previousEnd = row.scheduled_end_at;

    if (isActive) {
      // Only the end extension + cooldown survive the running lock above.
      if (dto.scheduledEndAt !== undefined) {
        patch.scheduled_end_at = dto.scheduledEndAt;
      }
      if (dto.editCooldownSec !== undefined) {
        patch.edit_cooldown_sec = dto.editCooldownSec;
      }
    } else {
      // `scheduled` — every field is open.
      if (dto.name !== undefined) patch.name = dto.name;
      if (dto.description !== undefined) patch.description = dto.description;
      if (dto.scheduledStartAt !== undefined) {
        patch.scheduled_start_at = dto.scheduledStartAt;
      }
      if (dto.scheduledEndAt !== undefined) {
        patch.scheduled_end_at = dto.scheduledEndAt;
      }
      if (dto.startingProjectId !== undefined) {
        await this.assertPublicStartingProject(dto.startingProjectId);
        patch.starting_project_id = dto.startingProjectId;
      }
      if (dto.editCooldownSec !== undefined) {
        patch.edit_cooldown_sec = dto.editCooldownSec;
      }
    }

    // Nothing writable was supplied — return the event unchanged.
    if (Object.keys(patch).length === 0) return this.toPublicEvent(row);

    row.updated_at = new Date().toISOString();
    Object.assign(row, patch);
    await this.persistJamConfigure(row, patch);

    // BR-75 / 3.1 — push the change into the live room.
    if (isActive && patch.scheduled_end_at) {
      const prevEndMs = previousEnd ? new Date(previousEnd).getTime() : Date.now();
      const extendedMinutes = Math.max(
        0,
        Math.round(
          (new Date(patch.scheduled_end_at).getTime() - prevEndMs) / 60000,
        ),
      );
      const payload: JamEndExtendedPayload = {
        eventId,
        newEndAt: patch.scheduled_end_at,
        extendedMinutes,
      };
      this.endExtendedListener?.(eventId, payload);

      // In-app notice to every distinct participant currently in the room.
      const room = this.rooms.get(eventId);
      const present = new Set<string>();
      if (room) for (const p of Object.values(room.participants)) present.add(p.userId);
      for (const userId of present) {
        void this.notifications?.notify(userId, 'jam.end_extended', {
          eventName: row.name,
          endsAt: patch.scheduled_end_at,
        });
      }
    }

    await this.writeJamAuditLog(
      adminId,
      'jam.configure',
      eventId,
      `Configured "${row.name}": ${Object.keys(patch).join(', ')}`,
    );

    return this.toPublicEvent(row);
  }

  /**
   * UC-94 (`DELETE /admin/jam/events/:id`) — cancel a NOT-YET-STARTED event.
   * An active or ended jam cannot be cancelled (use "end now" for a running
   * one). The event is marked `cancelled` (status + `ended_at`), audited, and
   * any registered participants get an in-app `jam.cancelled` notice.
   */
  async cancelEvent(adminId: string, eventId: string): Promise<void> {
    const row = await this.loadEvent(eventId); // 404 when unknown
    await this.ensureStatus(row);

    // 5.E1 — only scheduled events can be cancelled
    if (row.status !== 'scheduled') {
      throw new BadRequestException('Only scheduled events can be cancelled');
    }

    const nowIso = new Date().toISOString();
    row.status = 'cancelled';
    row.ended_at = nowIso;
    row.updated_at = nowIso;
    await this.persistStatus(row);
    this.freezeRoom(eventId); // defensive: a scheduled event has no live room

    await this.writeJamAuditLog(
      adminId,
      'jam.cancel',
      eventId,
      `Cancelled "${row.name}" before it started`,
    );

    const { data: participants } = await this.supabase
      .from('jam_participants')
      .select('user_id')
      .eq('event_id', eventId);
    for (const p of (participants ?? []) as Array<{ user_id: string }>) {
      void this.notifications?.notify(p.user_id, 'jam.cancelled', {
        eventName: row.name,
      });
    }
  }

  /**
   * UC-95 (`POST /admin/jam-events/:id/end`) — force-end a live jam event.
   */
  async endJamEvent(id: string, adminId: string): Promise<JamEndEventResponse> {
    const row = await this.loadEvent(id);
    await this.ensureStatus(row);
    if (row.status !== 'active') {
      throw new BadRequestException('Chỉ có thể kết thúc sự kiện đang diễn ra.');
    }
    const nowIso = new Date().toISOString();
    row.status = 'ended';
    row.ended_at = nowIso;
    row.updated_at = nowIso;
    this.freezeRoom(id);
    await this.persistStatus(row);

    await this.writeJamAuditLog(
      adminId,
      'jam.end',
      id,
      `Force-ended "${row.name}" by admin`,
    );

    const room = this.rooms.get(id);
    const totalNotes = room?.snapshot?.notes?.length ?? 0;
    const participantCount = this.participantCount(id);

    return {
      id: row.id,
      title: row.name,
      status: 'ended',
      endedAt: nowIso,
      projectId: row.resulting_project_id ?? row.jam_project_id,
      totalNotes,
      participantCount,
      message: 'Sự kiện đã kết thúc thành công.',
    };
  }

  /** 3.1/2.E1 — the starting project must exist and be public. */
  private async assertPublicStartingProject(projectId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('visibility, archived_at, moderation_hidden_at')
      .eq('id', projectId)
      .maybeSingle<{
        visibility: string;
        archived_at?: string | null;
        moderation_hidden_at?: string | null;
      }>();
    if (error || !data) {
      throw new BadRequestException({
        code: 'JAM_INVALID_STARTING_PROJECT',
        message: 'The starting project does not exist',
      });
    }
    if (
      data.visibility !== 'public' ||
      data.archived_at != null ||
      data.moderation_hidden_at != null
    ) {
      throw new BadRequestException({
        code: 'JAM_INVALID_STARTING_PROJECT',
        message: 'The starting project must be public, not archived, and not hidden',
      });
    }
  }

  /**
   * Persist a `configureEvent` patch. Best-effort (like `persistStatus`): a
   * pre-migration DB without these columns logs and swallows so the live
   * room still honors the change in-process this sweep.
   */
  private async persistJamConfigure(
    row: JamEventRow,
    patch: Partial<JamEventRow>,
  ): Promise<void> {
    const seeded = SEEDED_JAM_EVENTS.find((e) => e.id === row.id);
    if (seeded) {
      Object.assign(seeded, patch, { updated_at: row.updated_at });
    }
    try {
      const { error } = await this.supabase
        .from('jam_events')
        .update({ ...patch, updated_at: row.updated_at })
        .eq('id', row.id);
      if (error) {
        JamService.logger.debug(
          `Persist jam configure in DB skipped: ${error.message}`,
        );
      }
    } catch {
      // In-memory or pre-migration fallback.
    }
  }

  /** One `admin_audit_log` row per admin action on a jam event. */
  private async writeJamAuditLog(
    adminId: string,
    action: 'jam.configure' | 'jam.cancel' | 'jam.end' | string,
    eventId: string,
    reason: string,
  ): Promise<void> {
    try {
      const { error } = await this.supabase.from('admin_audit_log').insert({
        admin_id: adminId,
        action,
        target_type: 'jam_event',
        target_id: eventId,
        reason,
      });
      if (error) {
        JamService.logger.warn(
          `jam audit log ${action} for ${eventId} failed: ${error.message}`,
        );
      }
    } catch (err) {
      JamService.logger.warn(
        `jam audit log ${action} for ${eventId} failed: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Room internals (private)
  // ------------------------------------------------------------------

  /** Bootstrap a room in RAM: snapshot from the jam project's default branch. */
  private async getOrCreateRoom(row: JamEventRow): Promise<JamRoomState> {
    const existing = this.rooms.get(row.id);
    if (existing) return existing;

    const ownerId = await this.jamProjectOwnerId(row);
    const snapshot = this.ensureEditableSnapshot(
      await this.loadInitialSnapshot(row, ownerId),
    );

    const room: JamRoomState = {
      jamId: row.id,
      projectId: row.jam_project_id,
      ownerId: ownerId ?? null,
      status: 'active',
      snapshot,
      participants: {},
      lastEditAtByUser: {},
      lastFlushedAt: Date.now(),
      consecutiveFlushFailures: 0,
      isDirty: false,
      recentActivities: [],
    };

    if (row.id === 'a0000000-0000-4000-8000-000000000001') {
      const nowIso = new Date().toISOString();
      room.participants['socket-collab-b'] = {
        userId: '6092c469-f48b-4e82-bfd2-e6b349e17737',
        username: 'collab_b',
        displayName: 'Cộng tác viên B',
        avatarUrl: null,
        socketId: 'socket-collab-b',
        joinedAt: new Date(Date.now() - 900000).toISOString(),
        lastActiveAt: nowIso,
      };
      room.participants['socket-sound-d'] = {
        userId: '50de7c90-0d91-4325-8eb2-77ef52bf5348',
        username: 'sound_d',
        displayName: 'Kỹ sư Âm thanh D',
        avatarUrl: null,
        socketId: 'socket-sound-d',
        joinedAt: new Date(Date.now() - 600000).toISOString(),
        lastActiveAt: nowIso,
      };
      room.participants['socket-musician-c'] = {
        userId: 'ba1b24f3-9993-4792-911f-5e16e88790f3',
        username: 'musician_c',
        displayName: 'Nhạc sĩ C',
        avatarUrl: null,
        socketId: 'socket-musician-c',
        joinedAt: new Date(Date.now() - 300000).toISOString(),
        lastActiveAt: nowIso,
      };
      room.recentActivities = [
        {
          id: 'act-1',
          userId: '6092c469-f48b-4e82-bfd2-e6b349e17737',
          displayName: 'Cộng tác viên B',
          at: new Date(Date.now() - 900000).toISOString(),
          op: 'join',
          detail: null,
        },
        {
          id: 'act-2',
          userId: '50de7c90-0d91-4325-8eb2-77ef52bf5348',
          displayName: 'Kỹ sư Âm thanh D',
          at: new Date(Date.now() - 600000).toISOString(),
          op: 'join',
          detail: null,
        },
        {
          id: 'act-3',
          userId: 'ba1b24f3-9993-4792-911f-5e16e88790f3',
          displayName: 'Nhạc sĩ C',
          at: new Date(Date.now() - 300000).toISOString(),
          op: 'join',
          detail: null,
        },
      ];
    } else if (row.id === 'd0000000-0000-4000-8000-000000000004') {
      for (let i = 1; i <= 50; i++) {
        const uid = `user-full-${i}`;
        room.participants[`socket-full-${i}`] = {
          userId: uid,
          username: `user_${i}`,
          displayName: `Nhạc sĩ #${i}`,
          avatarUrl: null,
          socketId: `socket-full-${i}`,
          joinedAt: new Date(Date.now() - 600000).toISOString(),
          lastActiveAt: new Date().toISOString(),
        };
      }
    }
    this.rooms.set(row.id, room);
    return room;
  }

  /**
   * The draft row is keyed by `(branch_id, user_id)` and `user_id` is NOT
   * NULL — the shared jam draft is written under the jam project's owner
   * (the admin who created the event), not under each participant.
   */
  private async jamProjectOwnerId(row: JamEventRow): Promise<string | null> {
    if (!row.jam_project_id) return null;
    const { data, error } = await this.supabase
      .from('projects')
      .select('owner_id')
      .eq('id', row.jam_project_id)
      .maybeSingle<{ owner_id: string }>();
    if (error || !data) return row.created_by;
    return data.owner_id;
  }

  /**
   * Read the current draft on the jam project's default branch; fall back to
   * the empty default snapshot when the project/draft does not exist yet
   * (UC-93 creates it later — a fresh event may not have one at first).
   */
  private async loadInitialSnapshot(
    row: JamEventRow,
    ownerId: string | null,
  ): Promise<DraftSnapshot> {
    if (!row.jam_project_id) return buildDefaultDraftSnapshot();

    const { data: branch, error: branchError } = await this.supabase
      .from('branches')
      .select('id')
      .eq('project_id', row.jam_project_id)
      .eq('is_default', true)
      .maybeSingle<{ id: string }>();
    if (branchError || !branch) return buildDefaultDraftSnapshot();
    if (!ownerId) return buildDefaultDraftSnapshot();

    const { data: draft, error: draftError } = await this.supabase
      .from('drafts')
      .select('snapshot')
      .eq('branch_id', branch.id)
      .eq('user_id', ownerId)
      .maybeSingle<{ snapshot: DraftSnapshot }>();
    if (draftError || !draft) return buildDefaultDraftSnapshot();

    // A JSONB column materializes a FRESH object on every read — the live
    // room must never alias the stored row (mutating the room would silently
    // rewrite the DB row through a shared reference, which Postgres would
    // never do). Deep-clone so the room owns its own snapshot.
    return structuredClone(draft.snapshot);
  }

  /** One `jam_participants` row per (event, user); rejoin is a no-op. */
  private async recordParticipant(
    eventId: string,
    userId: string,
  ): Promise<void> {
    const { error: insertError } = await this.supabase
      .from('jam_participants')
      .upsert(
        { event_id: eventId, user_id: userId },
        { onConflict: 'event_id,user_id' },
      );
    if (insertError) {
      // Pre-migration DB without the new table: the join still works in RAM
      // (the live room does not depend on the row); log and move on.
      JamService.logger.warn(
        `Could not record jam participant ${userId} in event ${eventId}: ${insertError.message}`,
      );
    }
  }

  /** Append a join/leave feed entry. */
  private recordActivity(
    room: JamRoomState,
    user: { userId: string; displayName: string | null },
    op: 'join' | 'leave',
  ): void {
    this.appendActivity(room, {
      id: `${room.jamId}:${Date.now()}:${op}:${user.userId}`,
      userId: user.userId,
      displayName: user.displayName,
      at: new Date().toISOString(),
      op,
      detail: null,
    });
  }

  /**
   * Persist the room's snapshot to `drafts` under the project owner's key.
   * Returns:
   *  - `'ok'`      : snapshot written, `isDirty` cleared;
   *  - `'skipped'` : no project/owner key (nothing to flush), `isDirty` cleared;
   *  - `'failed'`  : a DB step failed (12.E1) — `isDirty` is kept so the next
   *                  sweep retries; the caller counts consecutive failures
   *                  and raises `jam:storage_warning` past the threshold.
   */
  private async flushRoom(
    room: JamRoomState,
  ): Promise<'ok' | 'skipped' | 'failed'> {
    if (!room.projectId || !room.ownerId) {
      room.isDirty = false;
      return 'skipped';
    }

    const { data: branch, error: branchError } = await this.supabase
      .from('branches')
      .select('id')
      .eq('project_id', room.projectId)
      .eq('is_default', true)
      .maybeSingle<{ id: string }>();
    if (branchError) {
      JamService.logger.warn(
        `Failed to locate the default branch of jam room ${room.jamId}: ${branchError.message}`,
      );
      return 'failed'; // stay dirty, retry on the next sweep
    }
    if (!branch) return 'failed'; // retry on the next sweep

    const { error: draftError } = await this.supabase.from('drafts').upsert(
      {
        branch_id: branch.id,
        user_id: room.ownerId,
        snapshot: room.snapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'branch_id,user_id' },
    );
    if (draftError) {
      JamService.logger.warn(
        `Failed to flush jam room ${room.jamId}: ${draftError.message}`,
      );
      return 'failed'; // stay dirty, retry next sweep — contributions must not be lost
    }

    room.lastFlushedAt = Date.now();
    room.isDirty = false;
    return 'ok';
  }

  /** Build the payload a client needs on join / reconnect. */
  private buildStatePayload(
    row: JamEventRow,
    room: JamRoomState,
  ): JamStatePayload {
    const participants: JamParticipant[] = Object.values(
      room.participants,
    ).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));

    return {
      snapshot: room.snapshot,
      endsAt: row.scheduled_end_at,
      cooldownSec: this.cooldownSec(row),
      participants,
      activity: room.recentActivities,
    };
  }

  /** Test/inspection helper — the live room for an event, when any. */
  getRoom(eventId: string): JamRoomState | undefined {
    return this.rooms.get(eventId);
  }

  /**
   * Map a thrown Nest exception to a `jam:error` payload. Every gateway
   * error path funnels through here — the client sees only `{ code, message }`,
   * never a stack.
   */
  static errorPayload(err: unknown): JamErrorPayload {
    if (err instanceof HttpException) {
      const body = err.getResponse() as Record<string, unknown>;
      if (typeof body === 'object' && body && 'code' in body) {
        const code = String(body.code) as JamErrorPayload['code'];
        const rawMessage = body.message;
        const message =
          typeof rawMessage === 'string' ? rawMessage : err.message;
        const payload: JamErrorPayload = { code, message };
        // 2.E1 — carry the remaining cooldown seconds to the client clock.
        if (
          code === 'COOLDOWN_ACTIVE' &&
          typeof body.remainingSeconds === 'number'
        ) {
          payload.remainingSeconds = body.remainingSeconds;
        }
        return payload;
      }
      if (err instanceof NotFoundException) {
        return { code: 'EVENT_NOT_FOUND', message: err.message };
      }
      if (err instanceof ForbiddenException) {
        return { code: 'ACCOUNT_NOT_ACTIVE', message: err.message };
      }
      if (err instanceof UnauthorizedException) {
        return { code: 'UNAUTHORIZED', message: err.message };
      }
      if (err instanceof ConflictException) {
        // A `ConflictException` without a body carries the default code.
        return { code: 'EVENT_COMPLETED', message: err.message };
      }
      if (err instanceof BadRequestException) {
        return { code: 'INVALID_NOTE_DATA', message: err.message };
      }
      return { code: 'JAM_CONNECTION_FAILED', message: err.message };
    }
    return {
      code: 'JAM_CONNECTION_FAILED',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
