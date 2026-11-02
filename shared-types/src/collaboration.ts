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

// ---------------------------------------------------------------------------
// UC-65 Contributions — per-author stats derived on-the-fly from commit
// snapshots (BR-72: read-only, no stored contribution table).
// ---------------------------------------------------------------------------

/** Share of one author's note changes that landed on a given track. */
export interface TrackChangeDistribution {
  trackId: string;
  trackName: string;
  changeCount: number;
  /** 0–100, integer percentage of the author's total note changes. */
  percentage: number;
}

/** One author's aggregate contribution to a project. */
export interface ContributorSummaryItem {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
  /** true when the author is no longer the owner or an accepted collaborator (BR-67). */
  isRemoved: boolean;
  /** true when `author_id` no longer resolves to a row in `users` (3.E2). */
  isDeletedAccount: boolean;
  totalCommits: number;
  notesAdded: number;
  notesRemoved: number;
  notesModified: number;
  trackDistribution: TrackChangeDistribution[];
  /** ISO 8601 of this author's most recent commit. */
  lastActivityAt: string;
}

/** One commit from the "recent commits" list, with its own diff summary. */
export interface ContributionCommitItem {
  id: string;
  message: string;
  authorId: string;
  createdAt: string;
  notesAdded: number;
  notesRemoved: number;
  notesModified: number;
}

/** Response of GET /projects/:projectId/contributions. */
export interface ProjectContributionsDto {
  projectId: string;
  contributors: ContributorSummaryItem[];
  recentCommits: ContributionCommitItem[];
}
