import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type {
  JamCooldownActivePayload,
  JamEndExtendedPayload,
  JamErrorPayload,
  JamEventEndedPayload,
  JamJoinPayload,
  JamParticipant,
  JamUserJoinedPayload,
  JamUserLeftPayload,
} from '@stave/shared-types';
import type {
  SupabaseClient,
  User as SupabaseUser,
} from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { JamService, type JamSocketUser } from './jam.service';
import { EditJamNoteDto, EditJamNoteRequestDto } from './dto/edit-jam-note.dto';

/**
 * The handshake must carry the same two layers the HTTP guards check
 * (CLAUDE.md §4.6): a valid Supabase access token AND a live business
 * session. 1.E1/1.E2 — anything else is disconnected immediately, before
 * any event is accepted.
 */
export interface JamHandshakeAuth {
  accessToken?: string;
  sessionId?: string;
}

interface JamSocketData {
  user: SupabaseUser;
  participant: JamParticipant;
  /** Event id this socket joined; null until a successful `jam:join`. */
  eventId: string | null;
  sessionId: string;
}

/**
 * UC-66 — live Community Jam room over Socket.IO namespace `/jam`.
 *
 * The snapshot, participants and activity feed live in the server's RAM
 * (`JamService`); the gateway only translates sockets to that room and back.
 * No version control inside a jam (BR-74): the room's events are
 * `jam:join` / `jam:state` / `jam:user_joined` / `jam:user_left` /
 * `jam:error` — `jam:edit` lands in UC-67.
 */
@Injectable()
@WebSocketGateway({ namespace: '/jam', cors: { origin: true } })
export class JamGateway {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(JamGateway.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly jamService: JamService,
  ) {}

  /**
   * 1.E1 (no auth) / 1.E2 (revoked session): disconnect before the socket
   * may send anything. On success the user's profile + business session are
   * stored on `socket.data` for the join handler.
   */
  async handleConnection(client: Socket): Promise<void> {
    const authPromise = (async (): Promise<JamSocketData | null> => {
      const auth = client.handshake.auth as JamHandshakeAuth | undefined;

      if (!auth?.accessToken || !auth.sessionId) {
        this.logger.warn('Rejecting /jam socket: missing handshake auth');
        client.disconnect(true);
        return null;
      }

      const { data, error: tokenError } = await this.supabase.auth.getUser(
        auth.accessToken,
      );
      if (tokenError || !data.user) {
        this.logger.warn('Rejecting /jam socket: invalid access token');
        client.disconnect(true);
        return null;
      }

      const { data: session, error: sessionError } = await this.supabase
        .from('sessions')
        .select('id, user_id, revoked_at')
        .eq('id', auth.sessionId)
        .maybeSingle<{
          id: string;
          user_id: string;
          revoked_at: string | null;
        }>();

      if (
        sessionError ||
        !session ||
        session.user_id !== data.user.id ||
        session.revoked_at !== null
      ) {
        this.logger.warn('Rejecting /jam socket: revoked or unknown session');
        client.disconnect(true);
        return null;
      }

      const user = data.user;
      const { data: profile } = await this.supabase
        .from('users')
        .select('username, display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle<{
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
        }>();

      const participant: JamParticipant = {
        userId: user.id,
        username: profile?.username ?? null,
        displayName: profile?.display_name ?? user.email ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        socketId: client.id,
        joinedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      return {
        user,
        participant,
        eventId: null,
        sessionId: session.id,
      };
    })();

    client.data.authPromise = authPromise;
    const resolved = await authPromise;
    if (resolved) {
      client.data = resolved;
    }
  }

  /**
   * Inbound `jam:join` — the gateway lets the service run every rule
   * (status window, account state, capacity); on success the socket joins
   * room `jam:<eventId>`, receives `jam:state` itself, and the others
   * receive `jam:user_joined`.
   */
  @SubscribeMessage('jam:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JamJoinPayload,
  ): Promise<void> {
    let data = client.data as JamSocketData | undefined;
    if ((!data || !data.user) && client.data?.authPromise) {
      data = (await client.data.authPromise) ?? undefined;
    }

    if (!data || !data.user) {
      client.disconnect(true);
      return;
    }

    const eventId = typeof payload?.eventId === 'string' ? payload.eventId : '';
    if (eventId.length === 0) {
      this.emitError(client, {
        code: 'JAM_CONNECTION_FAILED',
        message: 'No event id',
      });
      return;
    }

    try {
      const state = await this.jamService.handleUserJoin(
        eventId,
        {
          id: data.user.id,
          username: data.participant.username,
          displayName: data.participant.displayName,
          avatarUrl: data.participant.avatarUrl,
        },
        client.id,
      );

      data.eventId = eventId;
      void client.join(`jam:${eventId}`);
      client.emit('jam:state', state);

      const joined: JamUserJoinedPayload = {
        user: data.participant,
        totalParticipants: this.jamService.participantCount(eventId),
      };
      this.server
        ?.to(`jam:${eventId}`)
        .except(client.id)
        .emit('jam:user_joined', joined);
    } catch (err) {
      this.handleJoinError(client, err);
    }
  }

  /** The socket left the room on its own (before a hard disconnect). */
  @SubscribeMessage('jam:leave')
  handleLeave(@ConnectedSocket() client: Socket): void {
    const data = client.data as JamSocketData | undefined;
    if (!data?.eventId) return;

    const eventId = data.eventId;
    void client.leave(`jam:${eventId}`);
    data.eventId = null;

    const userFullyLeft = this.jamService.handleUserLeave(client.id, eventId);
    if (userFullyLeft) {
      this.server?.to(`jam:${eventId}`).emit('jam:user_left', {
        userId: data.participant.userId,
        totalParticipants: this.jamService.participantCount(eventId),
      } satisfies JamUserLeftPayload);
    }
  }

  /**
   * The socket is going away (tab closed, crash, network drop): clean up
   * EVERY room it was in. `socket.rooms` maps socketId → room ids on the
   * public `sockets` namespace; the service's roster is the source of truth.
   */
  handleDisconnect(client: Socket): void {
    const data = client.data as JamSocketData | undefined;
    if (!data?.eventId) return;

    const eventId = data.eventId;
    void client.leave(`jam:${eventId}`);

    const userFullyLeft = this.jamService.handleUserLeave(client.id, eventId);
    if (userFullyLeft) {
      this.server?.to(`jam:${eventId}`).emit('jam:user_left', {
        userId: data.participant.userId,
        totalParticipants: this.jamService.participantCount(eventId),
      } satisfies JamUserLeftPayload);
    }
  }

  /** A server-side Socket.IO error: log, never crash the gateway. */
  handleGatewayError(error: Error): void {
    this.logger.error('Jam gateway error', error.stack ?? error.message);
  }

  /**
   * UC-94 (BR-75) — broadcast the admin's end-time extension to the whole
   * live room so every connected client restarts its countdown toward the new
   * `newEndAt`. Called by `JamService.configureEvent` on a running event.
   */
  broadcastEndExtended(eventId: string, payload: JamEndExtendedPayload): void {
    this.server?.to(`jam:${eventId}`).emit('jam:end_extended', payload);
  }

  /**
   * Tell the sweep what to broadcast when it finds a freshly-ended event or
   * a storage flush that kept failing (12.E1). Called once from
   * `onModuleInit` so the very first sweep tick already has a listener.
   */
  onModuleInit(): void {
    this.jamService.settleJamSweep(({ endedEvents, storageWarnings }) => {
      for (const ended of endedEvents) {
        this.server?.to(`jam:${ended.jamId}`).emit('jam:event_ended', ended);
      }
      for (const warning of storageWarnings) {
        this.server
          ?.to(`jam:${warning.jamId}`)
          .emit('jam:storage_warning', warning);
      }
    });
    this.jamService.settleEndExtended((eventId, payload) => {
      this.broadcastEndExtended(eventId, payload);
    });
  }

  /**
   * Inbound `jam:edit_note` (alias `jam:edit`) — UC-67. The socket must be
   * in a room (`data.eventId`) or the op is dropped with a neutral error.
   * The service runs every rule (5.E1 window, 2.E1 cooldown, 7.E1/7.E2
   * integrity, 8.E1 LWW); on success we broadcast `jam:note_updated` to the
   * WHOLE room and ack the sender with `jam:note_updated` too (the browser
   * collapses its optimistic update against the server-stamped copy).
   */
  @SubscribeMessage('jam:edit_note')
  async handleEditNote(
    @ConnectedSocket() client: Socket,
    @MessageBody() raw: EditJamNoteRequestDto,
  ): Promise<void> {
    await this.applyEditNote(client, raw);
  }

  /** Backwards-compatible alias: the UC-66-era name of the same op. */
  @SubscribeMessage('jam:edit')
  async handleEditAlias(
    @ConnectedSocket() client: Socket,
    @MessageBody() raw: EditJamNoteRequestDto,
  ): Promise<void> {
    await this.applyEditNote(client, raw);
  }

  private async applyEditNote(
    client: Socket,
    raw: EditJamNoteRequestDto,
  ): Promise<void> {
    const data = client.data as JamSocketData | undefined;
    if (!data) {
      // 3.E1 — the handshake already failed or was revoked.
      this.emitError(client, {
        code: 'UNAUTHORIZED',
        message: 'Socket not authenticated',
      });
      client.disconnect(true);
      return;
    }

    // The socket is only in one room; the op must target that room (or it
    // is dropped — we never guess at a jamId the client is not part of).
    const eventId = data.eventId;
    if (!eventId || (raw && raw.jamId && raw.jamId !== eventId)) {
      this.emitError(client, {
        code: 'JAM_ROOM_NOT_FOUND',
        message: 'You are not in this jam room',
      });
      return;
    }

    // Manual validation: the global ValidationPipe does not run on socket
    // payloads, so class-validator enforces the same constraints the DTO
    // declares (BR-71). A malformed note never reaches the room.
    const dto = plainToInstance(EditJamNoteRequestDto, raw);
    const noteDto = plainToInstance(EditJamNoteDto, raw?.note ?? {});
    dto.note = noteDto;
    // `validate()` descends into `@ValidateNested` objects by default
    // (class-validator 0.15); `whitelist: true` mirrors the global pipe so an
    // unadorned field is dropped, not trusted.
    const issues = await validate(dto, { whitelist: true });
    if (issues.length > 0) {
      // class-validator reports nested violations with a dotted path
      // (`note.trackId`); a `trackId` shape failure is 7.E2 (the track is
      // outside the snapshot's vocabulary), any other malformed field is 7.E1.
      const details = issues.map((i) => String(i.property ?? ''));
      const isTrackIssue = details.some((d) => d.endsWith('trackId'));
      const first = details[0] ?? 'unknown';
      this.emitError(client, {
        code: isTrackIssue ? 'TRACK_NOT_FOUND' : 'INVALID_NOTE_DATA',
        message: isTrackIssue
          ? 'The selected track no longer exists'
          : `Invalid note data on '${first}'`,
        detail: first,
      });
      return;
    }

    // The note id is freshly minted for an add; the client already carries
    // a UUID (pencil tool mints it), but a `delete`/`update` for an id that
    // has since been replaced by another contributor's LWW write just lands
    // as a no-op on the server side — the broadcast tells everyone the
    // current truth.
    const user: JamSocketUser = {
      id: data.user.id,
      username: data.participant.username,
      displayName: data.participant.displayName,
      avatarUrl: data.participant.avatarUrl,
    };

    try {
      const updated = await this.jamService.handleEditNote(user, dto);
      // Ack the sender first (so its optimistic flag clears), then fan out
      // to everyone else in the room. The sender is included in `.to(room)`
      // as well — a double-delivery of the same payload is harmless on the
      // client (it's idempotent per note id + LWW timestamp).
      this.server?.to(`jam:${eventId}`).emit('jam:note_updated', updated);
    } catch (err) {
      this.handleEditNoteError(client, err);
    }
  }

  /**
   * 2.E1 (COOLDOWN_ACTIVE) → `jam:cooldown_active` (a distinct event the
   * client timer listens for). 5.E1 (JAM_EVENT_ENDED) → also broadcast
   * `jam:event_ended` to the whole room. 7.E1/7.E2/UNAUTHORIZED → `jam:error`.
   */
  private handleEditNoteError(client: Socket, err: unknown): void {
    const payload = JamService.errorPayload(err);
    const room = (client.data as JamSocketData | undefined)?.eventId;

    switch (payload.code) {
      case 'COOLDOWN_ACTIVE': {
        const cooldown: JamCooldownActivePayload = {
          jamId: room ?? payload.message,
          remainingSeconds: payload.remainingSeconds ?? 0,
        };
        client.emit('jam:cooldown_active', cooldown);
        return;
      }
      case 'JAM_EVENT_ENDED': {
        if (room) {
          const ended: JamEventEndedPayload = {
            jamId: room,
            endedAt: new Date().toISOString(),
          };
          this.server?.to(`jam:${room}`).emit('jam:event_ended', ended);
        }
        this.emitError(client, payload);
        return;
      }
      case 'UNAUTHORIZED': {
        this.emitError(client, payload);
        client.disconnect(true);
        return;
      }
      case 'JAM_ROOM_NOT_FOUND':
      case 'INVALID_NOTE_DATA':
      case 'TRACK_NOT_FOUND':
      default: {
        if (
          payload.code === 'JAM_ROOM_NOT_FOUND' ||
          payload.code === 'JAM_CONNECTION_FAILED'
        ) {
          this.logger.error(
            `jam:edit_note failed: ${payload.message}`,
            err instanceof Error ? err.stack : undefined,
          );
        }
        this.emitError(client, payload);
        return;
      }
    }
  }

  // ------------------------------------------------------------------
  // Private
  // ------------------------------------------------------------------

  /**
   * The service throws Nest exceptions whose body already carries the
   * `code` (EVENT_NOT_STARTED / EVENT_COMPLETED / ACCOUNT_NOT_ACTIVE /
   * ROOM_FULL); map any of them — or an unexpected 500 — to `jam:error`.
   */
  private handleJoinError(client: Socket, err: unknown): void {
    const payload: JamErrorPayload = JamService.errorPayload(err);
    if (payload.code === 'JAM_CONNECTION_FAILED') {
      this.logger.error(
        `jam:join failed: ${payload.message}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
    this.emitError(client, payload);
  }

  private emitError(client: Socket, payload: JamErrorPayload): void {
    client.emit('jam:error', payload);
  }
}
