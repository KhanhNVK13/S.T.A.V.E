import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type {
  JamErrorPayload,
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
import { JamService } from './jam.service';

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

    (client.data as any).authPromise = authPromise;
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
    if ((!data || !data.user) && (client.data as any)?.authPromise) {
      data = (await (client.data as any).authPromise) ?? undefined;
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
