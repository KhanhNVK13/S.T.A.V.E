/**
 * Shared shapes for the Comments module (UC-63 — Pinned comment) — mirrors
 * `backend/src/comments/comments.service.ts`. Backend uses the same file;
 * keep the two sides in sync, do not redefine per side.
 *
 * A comment is anchored to one bar of one track, optionally to a single note.
 * If no position is chosen it anchors to the whole project (all fields null).
 * Comments support exactly one reply level.
 */

/** Embedded author profile for a comment (mirrors the users table). */
export interface CommentAuthor {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/** A flat comment row as returned by `GET /projects/:id/comments`. */
export interface CommentItem {
  id: string;
  projectId: string;
  /** 1–1000 chars after trim. */
  body: string;
  /** null = the comment anchors to the whole project, not a specific bar. */
  trackId: string | null;
  /** 1-based bar number; null when the comment is project-wide. */
  bar: number | null;
  /** The specific note the comment is pinned to; null if not note-anchored. */
  noteId: string | null;
  /** Parent comment id (a single reply level). null for a top-level comment. */
  parentId: string | null;
  author: CommentAuthor;
  createdAt: string;
  /**
   * BR-68: true when this comment is pinned to a note that no longer exists in
   * the current draft (or latest commit) of the branch being opened. The
   * comment itself is never deleted — the UI shows "Nốt này không còn tồn tại".
   */
  noteMissing: boolean;
}

/**
 * Payload for `POST /projects/:id/comments`.
 *
 * - `body` is required (1–1000 chars after trim).
 * - `trackId`/`bar`/`noteId` are optional; when omitted the comment anchors
 *   to the whole project (stored as null).
 * - `parentId` marks a reply. A reply inherits the anchor position (bar,
 *   trackId, noteId) of the parent comment — the client need not (and should
 *   not) send its own position.
 */
export interface CreateCommentDto {
  body: string;
  trackId?: string;
  bar?: number;
  noteId?: string;
  /** A top-level comment's id — only one reply level is allowed. */
  parentId?: string;
}
