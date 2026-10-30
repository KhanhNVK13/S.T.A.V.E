import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DraftSnapshot,
  JamActivityItem,
  JamEvent,
  JamEventListItem,
  JamErrorPayload,
  JamParticipant,
  JamRoomState,
  JamStatePayload,
} from '@stave/shared-types';
import { buildDefaultDraftSnapshot } from '../drafts/default-snapshot';
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

  /** Minimum scope cap (duc.md): ~50 simultaneous participants per room. */
  static readonly MAX_JAM_PARTICIPANTS = 50;

  /** Platform-wide default cooldown when the event does not set its own. */
  static readonly DEFAULT_COOLDOWN_SEC = 5;

  /** Activity feed kept per room (client + server both cap at 50). */
  static readonly MAX_ACTIVITY_ITEMS = 50;

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
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
   */
  async sweep(): Promise<void> {
    for (const room of this.rooms.values()) {
      if (room.isDirty) await this.flushRoom(room);
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
    const { data, error } = await this.supabase
      .from('jam_events')
      .select('*')
      .order('scheduled_start_at', { ascending: false, nullsFirst: false });
    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch jam events: ${error.message}`,
      );
    }

    const items = await Promise.all(
      ((data ?? []) as unknown as JamEventRow[]).map(async (row) => {
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

  private async fetchEventRow(id: string): Promise<JamEventRow> {
    const { data, error } = await this.supabase
      .from('jam_events')
      .select('*')
      .eq('id', id)
      .maybeSingle<JamEventRow>();
    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch jam event: ${error.message}`,
      );
    }
    if (!data) throw new NotFoundException('Jam event not found');
    return data;
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
      edit_cooldown_sec: row.edit_cooldown_sec,
      no_result: row.no_result,
      max_participants: JamService.MAX_JAM_PARTICIPANTS,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
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
    const { error } = await this.supabase
      .from('jam_events')
      .update({
        status: row.status,
        started_at: row.started_at,
        ended_at: row.ended_at,
      })
      .eq('id', row.id);
    if (error) {
      throw new InternalServerErrorException(
        `Failed to update jam event status: ${error.message}`,
      );
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
    if (!profile || profile.status !== 'active') {
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

  // ------------------------------------------------------------------
  // Room internals (private)
  // ------------------------------------------------------------------

  /** Bootstrap a room in RAM: snapshot from the jam project's default branch. */
  private async getOrCreateRoom(row: JamEventRow): Promise<JamRoomState> {
    const existing = this.rooms.get(row.id);
    if (existing) return existing;

    const ownerId = await this.jamProjectOwnerId(row);
    const snapshot = await this.loadInitialSnapshot(row, ownerId);

    const room: JamRoomState = {
      jamId: row.id,
      projectId: row.jam_project_id,
      ownerId: ownerId ?? null,
      status: 'active',
      snapshot,
      participants: {},
      lastEditAtByUser: {},
      lastFlushedAt: Date.now(),
      isDirty: false,
      recentActivities: [],
    };
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

    return draft.snapshot;
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

  /** Persist the room's snapshot to `drafts` under the project owner's key. */
  private async flushRoom(room: JamRoomState): Promise<void> {
    if (!room.projectId || !room.ownerId) {
      room.isDirty = false;
      return;
    }

    const { data: branch, error: branchError } = await this.supabase
      .from('branches')
      .select('id')
      .eq('project_id', room.projectId)
      .eq('is_default', true)
      .maybeSingle<{ id: string }>();
    if (branchError || !branch) return; // retry on the next sweep

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
      return; // stay dirty, retry next sweep — contributions must not be lost
    }

    room.lastFlushedAt = Date.now();
    room.isDirty = false;
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
        return { code, message };
      }
      if (err instanceof NotFoundException) {
        return { code: 'EVENT_NOT_FOUND', message: err.message };
      }
      if (err instanceof ForbiddenException) {
        return { code: 'ACCOUNT_NOT_ACTIVE', message: err.message };
      }
      if (err instanceof ConflictException) {
        // A `ConflictException` without a body carries the default code.
        return { code: 'EVENT_COMPLETED', message: err.message };
      }
      return { code: 'JAM_CONNECTION_FAILED', message: err.message };
    }
    return {
      code: 'JAM_CONNECTION_FAILED',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
