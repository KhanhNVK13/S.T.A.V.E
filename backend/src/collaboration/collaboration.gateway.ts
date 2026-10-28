import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { PresenceUser, PresenceUpdatePayload } from '@stave/shared-types';
import type {
  SupabaseClient,
  User as SupabaseUser,
} from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { ProjectAccessService } from '../project-access/project-access.service';
import { PresenceRegistry } from './presence-registry';

/** Auth handshake payload the client must attach to `/collab`. */
export interface CollabHandshakeAuth {
  accessToken?: string;
  sessionId?: string;
}

/** Per-socket identity, assigned in `handleConnection`. */
interface CollabSocketData {
  user: SupabaseUser;
  profile: PresenceUser;
  sessionId: string;
}

/**
 * UC-64 — real-time presence of who has a project open, over Socket.IO
 * namespace `/collab`.
 *
 * Auth mirrors the two HTTP guards, adapted to the WebSocket handshake
 * (CLAUDE.md §4.6): `accessToken` is validated against Supabase Auth and
 * `sessionId` against `public.sessions` (not revoked, owned by the token's
 * user). A missing/invalid pair is disconnected immediately (1.E1) — the
 * client then falls back to the plain editor (2.E1), no error page.
 *
 * Presence itself is pure in-RAM state (BR-70): one shared
 * `PresenceRegistry` maps projectId → userId → Set<socketId>, so a user
 * with many tabs shows up as a single avatar.
 *
 * `emitBranchMoved` (4.1 / BR-71): the team lead's commit service should
 * call this after a commit lands on a branch the room has open; clients
 * listening on `branch:moved` refresh. The frontend's 20s `/branches`
 * poll is the fallback path that still satisfies the rule.
 */
@Injectable()
@WebSocketGateway({ namespace: '/collab', cors: { origin: true } })
export class CollaborationGateway {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(CollaborationGateway.name);
  private readonly registry = new PresenceRegistry();

  // The SUPABASE_ADMIN_CLIENT provider hands out a SupabaseClient; handshake
  // auth only touches `.auth.getUser` + `.from(...)`, same surface as the
  // two HTTP guards.
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  /**
   * 1.E1: the handshake must carry a valid access token AND a live
   * business session; anything else is disconnected before any event is
   * accepted. On success the user's identity + profile are stored on
   * `socket.data`.
   */
  async handleConnection(client: Socket): Promise<void> {
    const auth = client.handshake.auth as CollabHandshakeAuth | undefined;

    if (!auth?.accessToken || !auth.sessionId) {
      this.logger.warn('Rejecting /collab socket: missing handshake auth');
      client.disconnect(true);
      return;
    }

    // Layer 1 — the same call JwtAuthGuard makes: the token is real and
    // unexpired.
    const { data, error: tokenError } = await this.supabase.auth.getUser(
      auth.accessToken,
    );
    if (tokenError || !data.user) {
      this.logger.warn('Rejecting /collab socket: invalid access token');
      client.disconnect(true);
      return;
    }

    // Layer 2 — the same check SessionAuthGuard makes: the business
    // session exists, belongs to this user, and has not been revoked.
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
      this.logger.warn('Rejecting /collab socket: revoked or unknown session');
      client.disconnect(true);
      return;
    }

    const user = data.user;
    // The display profile comes from `public.users` — Supabase Auth's user
    // object only carries email + custom fields, not display_name.
    const { data: profile } = await this.supabase
      .from('users')
      .select('username, display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle<{
        username: string | null;
        display_name: string | null;
        avatar_url: string | null;
      }>();

    client.data = {
      user,
      sessionId: session.id,
      profile: {
        id: user.id,
        username: profile?.username ?? null,
        displayName: profile?.display_name ?? user.email ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      },
    } satisfies CollabSocketData;
  }

  /**
   * Inbound `presence:join` { projectId } (1.E2/1.E3/1.E4):
   * the project must exist / not be hidden (NotFoundException), and the
   * user must pass `assertCanView` — outsiders and pending collaborators
   * are both rejected with ForbiddenException (BR-65). On success the
   * socket joins room `project:<id>` and the room gets a fresh roster.
   */
  @SubscribeMessage('presence:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    payload: { projectId?: unknown },
  ): Promise<void> {
    const data = client.data as CollabSocketData | undefined;
    if (!data) {
      // Connection was not authorized — drop it instead of joining a room.
      client.disconnect(true);
      return;
    }

    const projectId =
      typeof payload?.projectId === 'string' ? payload.projectId : '';
    if (projectId.length === 0) {
      // No project id: not an access violation, just ignore the message.
      return;
    }

    // 1.E2: unknown or moderation-hidden project → not found.
    // 1.E3/1.E4: outsider / pending collaborator → no access (BR-65).
    try {
      await this.projectAccess.assertCanView(projectId, data.user.id);
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ForbiddenException
      ) {
        client.emit('presence:denied', {
          projectId,
          reason: (err as Error).message,
        });
        return;
      }
      this.logger.error(
        `presence:join failed for user ${data.user.id}`,
        err instanceof Error ? err.stack : String(err),
      );
      client.emit('presence:denied', {
        projectId,
        reason: 'Internal server error',
      });
      return;
    }

    this.registry.addSocket(projectId, data.user.id, client.id, data.profile);
    void client.join(`project:${projectId}`);
    this.broadcastRoster(projectId);
  }

  /**
   * Inbound `presence:leave` — drop this socket from one room; the roster
   * is only re-broadcast when it was the user's LAST tab in the room.
   */
  @SubscribeMessage('presence:leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    payload: { projectId?: unknown },
  ): void {
    const data = client.data as CollabSocketData | undefined;
    if (!data) return;

    const projectId =
      typeof payload?.projectId === 'string' ? payload.projectId : '';
    if (projectId.length === 0) return;

    void client.leave(`project:${projectId}`);

    const rosterChanged = this.registry.removeSocket(
      projectId,
      data.user.id,
      client.id,
    );
    if (rosterChanged) this.broadcastRoster(projectId);
  }

  /**
   * Every room this socket was in is cleaned up at once; each affected
   * room re-broadcasts so the others see the change within seconds
   * (4.E1 — clients auto-reconnect on their side).
   */
  handleDisconnect(client: Socket): void {
    const data = client.data as CollabSocketData | undefined;

    if (data) {
      for (const projectId of this.registry.roomsOf(client.id)) {
        const rosterChanged = this.registry.removeSocket(
          projectId,
          data.user.id,
          client.id,
        );
        if (rosterChanged) this.broadcastRoster(projectId);
      }
    }
    this.registry.forgetSocket(client.id);
  }

  /** A server-side Socket.IO error: log, do not crash the gateway. */
  handleGatewayError(error: Error): void {
    this.logger.error(
      'Collaboration gateway error',
      error.stack ?? error.message,
    );
  }

  /**
   * 4.1 / BR-71 — let the commit service (team lead's wiring) announce that
   * a branch head moved; every socket in the room re-checks on its side.
   */
  emitBranchMoved(
    projectId: string,
    branchId: string,
    commitId: string,
    byUserId: string,
  ): void {
    this.server
      ?.to(`project:${projectId}`)
      .emit('branch:moved', { projectId, branchId, commitId, byUserId });
  }

  /**
   * UC-61 hook (replaces the `TODO(UC-64)` in `patchCollaborator`): push
   * a permission-level change to the room's sockets — especially the
   * affected user's own tabs, which must drop commit access live.
   */
  emitPermissionChanged(
    projectId: string,
    payload: {
      collaboratorId: string;
      userId: string;
      permissionLevel: 'view' | 'edit';
    },
  ): void {
    this.server
      ?.to(`project:${projectId}`)
      .emit('collab:permission_changed', { ...payload, projectId });
  }

  /**
   * UC-62 hook (replaces the `TODO(UC-64)` in `removeCollaborator`): tell
   * the removed user's tabs their access is gone (5.E1 — they show a
   * notice and redirect to /projects), then force-disconnect every socket
   * so their presence also disappears from the room.
   */
  revokeUserAccess(projectId: string, userId: string, invitationId = ''): void {
    const room = `project:${projectId}`;

    // Their tabs hear about it BEFORE the disconnect lands, so each one
    // can show "your access ended" on the way out.
    this.server?.to(room).emit('collab:access_revoked', {
      projectId,
      userId,
      invitationId,
    });

    const socketIds = this.registry.removeUser(projectId, userId);
    // `sockets` (the public Nsp) exposes the live socket map by id.
    // `server` is undefined in the bare unit-test instances — safe-access.
    for (const socketId of socketIds) {
      this.server?.sockets.sockets.get(socketId)?.disconnect(true);
    }

    if (socketIds.length > 0) this.broadcastRoster(projectId);
  }

  /** Rebuild the room roster and send it to everyone still in it. */
  private broadcastRoster(projectId: string): void {
    const payload: PresenceUpdatePayload = {
      projectId,
      users: this.registry.users(projectId),
    };
    this.server?.to(`project:${projectId}`).emit('presence:update', payload);
  }

  /** Exported for the gateway spec: registry without booting Nest. */
  getRegistry(): PresenceRegistry {
    return this.registry;
  }
}
