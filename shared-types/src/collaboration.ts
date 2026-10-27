/**
 * Shared shapes for the Collaboration module (UC-60/61/62) — mirrors
 * `backend/src/collaboration/collaboration.service.ts`. Backend uses the same
 * file; keep the two sides in sync, do not redefine per side.
 */

/** Permission level granted (or, for pending rows: to be granted) to a collaborator. */
export type CollaboratorPermissionLevel = "view" | "edit";

/**
 * A row of `project_collaborators` as returned by
 * `GET /projects/:id/collaborators`, with the invited user's profile embedded.
 * `status = "pending"` means the invitation has not been accepted yet — a
 * pending collaborator has no access to the project at all.
 */
export interface CollaboratorItem {
  id: string;
  userId: string;
  permissionLevel: CollaboratorPermissionLevel;
  status: "pending" | "accepted";
  respondedAt: string | null;
  invitedBy: string;
  createdAt: string;
  user: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

/** A pending invitation addressed to the current user. */
export interface CollaborationInvitation {
  id: string;
  projectId: string;
  permissionLevel: CollaboratorPermissionLevel;
  projectName: string | null;
  inviterName: string | null;
  invitedAt: string;
}

// ---------------------------------------------------------------------------
// UC-64 Presence — live "who is in this project right now" over Socket.IO.
// Pure in-RAM server state (BR-70: never persisted to the DB).
// ---------------------------------------------------------------------------

/** One person currently viewing a project. Multiple tabs = one avatar. */
export interface PresenceUser {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/** Payload of `presence:update` — the full room roster after a join/leave. */
export interface PresenceUpdatePayload {
  projectId: string;
  users: PresenceUser[];
}
