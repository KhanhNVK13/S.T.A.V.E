import type { PresenceUser } from '@stave/shared-types';

/**
 * In-memory roster of who is viewing which project right now (UC-64).
 *
 * BR-70: presence is NEVER written to the database — this map lives in the
 * server process and dies with it. Structure:
 *
 *   projectId -> userId -> Set<socketId>
 *
 * A user with N open tabs owns N socket ids but counts as exactly ONE
 * avatar in the roster; `roomsOf`/`forgetSocket` let the gateway clean up
 * on disconnect without scanning every room.
 */
export class PresenceRegistry {
  private readonly rooms = new Map<string, Map<string, Set<string>>>();
  /** Latest profile known per user (filled in when their first tab joins). */
  private readonly profiles = new Map<string, PresenceUser>();
  /** socketId -> the rooms that socket is currently in. */
  private readonly socketRooms = new Map<string, Set<string>>();

  /**
   * Add a socket to a project room. `profile` is remembered per user so
   * later roster broadcasts can show name/avatar without re-querying.
   */
  addSocket(
    projectId: string,
    userId: string,
    socketId: string,
    profile: PresenceUser,
  ): void {
    const room = this.rooms.get(projectId) ?? new Map<string, Set<string>>();
    if (!this.rooms.has(projectId)) this.rooms.set(projectId, room);

    const sockets = room.get(userId) ?? new Set<string>();
    if (!room.has(userId)) room.set(userId, sockets);
    sockets.add(socketId);

    this.profiles.set(userId, profile);

    const mine = this.socketRooms.get(socketId) ?? new Set<string>();
    if (!this.socketRooms.has(socketId)) this.socketRooms.set(socketId, mine);
    mine.add(projectId);
  }

  /**
   * Drop one socket from one room (explicit `presence:leave`).
   * Returns true when this was the user's LAST socket in the room, i.e.
   * the roster itself changed and `presence:update` must be re-broadcast.
   */
  removeSocket(projectId: string, userId: string, socketId: string): boolean {
    const sockets = this.rooms.get(projectId)?.get(userId);
    if (!sockets || !sockets.delete(socketId)) return false;

    // True only when this was the user's LAST socket in the room — that is
    // the moment the avatar (and thus the roster) actually disappears.
    const wasLast = sockets.size === 0;

    this.socketRooms.get(socketId)?.delete(projectId);

    if (wasLast) {
      this.rooms.get(projectId)?.delete(userId);
      const room = this.rooms.get(projectId);
      if (room && room.size === 0) this.rooms.delete(projectId);
      this.dropProfileIfElsewhere(userId);
    }
    return wasLast;
  }

  /** Rooms this socket is in — used by the disconnect handler. */
  roomsOf(socketId: string): string[] {
    return [...(this.socketRooms.get(socketId) ?? [])];
  }

  /** Forget every room a socket was in (disconnect cleanup). */
  forgetSocket(socketId: string): void {
    this.socketRooms.delete(socketId);
  }

  /** The one avatar per user currently in the room. Empty when nobody. */
  users(projectId: string): PresenceUser[] {
    const room = this.rooms.get(projectId);
    if (!room) return [];
    return [...room.keys()].map((userId) => {
      const p = this.profiles.get(userId);
      return (
        p ?? {
          id: userId,
          username: null,
          displayName: null,
          avatarUrl: null,
        }
      );
    });
  }

  /** All open sockets of one user in one room (used to kick them, UC-62). */
  socketIds(projectId: string, userId: string): string[] {
    return [...(this.rooms.get(projectId)?.get(userId) ?? [])];
  }

  /**
   * Remove a user entirely from a project room (access revoked). Returns
   * the socket ids so the gateway can force-disconnect every one of the
   * user's tabs at once.
   */
  removeUser(projectId: string, userId: string): string[] {
    const sockets = this.rooms.get(projectId)?.get(userId);
    if (!sockets) return [];

    this.rooms.get(projectId)?.delete(userId);
    const room = this.rooms.get(projectId);
    if (room && room.size === 0) this.rooms.delete(projectId);

    for (const socketId of sockets) {
      this.socketRooms.get(socketId)?.delete(projectId);
    }
    this.dropProfileIfElsewhere(userId);
    return [...sockets];
  }

  /**
   * A profile only matters while the user is in at least one room — drop it
   * when the last room leaves, so the RAM footprint tracks real usage.
   */
  private dropProfileIfElsewhere(userId: string): void {
    const stillInRoom = [...this.rooms.values()].some((room) =>
      room.has(userId),
    );
    if (!stillInRoom) this.profiles.delete(userId);
  }
}
