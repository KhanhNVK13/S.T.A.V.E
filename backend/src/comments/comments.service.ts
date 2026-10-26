import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommentItem, DraftSnapshot } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { ProjectAccessService } from '../project-access/project-access.service';
import type { CreateCommentDto } from './dto/create-comment.dto';

/** Raw row from comments (migration 20261025120000 added the anchor columns). */
interface CommentRow {
  id: string;
  project_id: string;
  author_id: string;
  body: string;
  track_id: string | null;
  bar: number | null;
  note_id: string | null;
  parent_id: string | null;
  created_at: string;
}

/**
 * UC-63: pinned comments.
 *
 * - Any viewer (owner, accepted collaborator `view` or `edit`, BR-69) may read
 *   and write comments. Access is enforced via `ProjectAccessService`.
 * - Deleting is restricted to the comment's author or the project owner.
 * - A comment anchored to a note that no longer exists in the current draft /
 *   latest commit is NOT deleted (BR-68): reads mark it `noteMissing: true`.
 * - Replies are single-level: a comment that already has a `parent_id` cannot
 *   be replied to again, and a reply inherits the parent's anchor position.
 */
@Injectable()
export class CommentsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  /** GET /projects/:projectId/comments — flat list, oldest first. */
  async listComments(
    projectId: string,
    userId: string,
  ): Promise<CommentItem[]> {
    // Readers: owner or any accepted collaborator (view included, BR-69).
    await this.projectAccess.assertCanView(projectId, userId);

    const { data: rows, error } = await this.supabase
      .from('comments')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch comments: ${error.message}`,
      );
    }

    const comments = (rows ?? []) as CommentRow[];
    const noteIds = await this.currentNoteIds(projectId);
    const userMap = await this.getAuthorNames(comments.map((c) => c.author_id));

    return comments.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      body: row.body,
      trackId: row.track_id,
      bar: row.bar,
      noteId: row.note_id,
      parentId: row.parent_id,
      author: userMap.get(row.author_id) ?? {
        id: row.author_id,
        username: null,
        displayName: null,
        avatarUrl: null,
      },
      createdAt: row.created_at,
      noteMissing: row.note_id !== null && !noteIds.has(row.note_id),
    }));
  }

  /**
   * POST /projects/:projectId/comments.
   *
   * No anchor fields → project-wide comment (all null). With `parentId` the
   * reply inherits the parent's bar/trackId/noteId; the parent must be a
   * top-level comment of this project (one level only).
   */
  async createComment(
    projectId: string,
    dto: CreateCommentDto,
    userId: string,
  ): Promise<CommentItem> {
    await this.projectAccess.assertCanView(projectId, userId);

    const body = dto.body.trim();
    if (body.length === 0) {
      // 4.E1: empty after trim is rejected before it reaches the DB.
      throw new BadRequestException('Comment body must not be empty');
    }

    let trackId: string | null = null;
    let bar: number | null = null;
    let noteId: string | null = null;

    if (dto.parentId) {
      const parent = await this.getCommentInProject(projectId, dto.parentId);
      if (parent.parent_id !== null) {
        throw new BadRequestException('Only one level of replies is allowed');
      }
      // 2.1: a reply inherits the anchor position of the parent comment.
      trackId = parent.track_id;
      bar = parent.bar;
      noteId = parent.note_id;
    } else {
      // 1.1: every anchor field that is absent is stored as null, so a
      // comment with no position is a project-wide comment.
      trackId =
        dto.trackId !== undefined && dto.trackId !== null ? dto.trackId : null;
      bar = dto.bar !== undefined && dto.bar !== null ? dto.bar : null;
      noteId =
        dto.noteId !== undefined && dto.noteId !== null ? dto.noteId : null;
    }

    const { data: created, error } = await this.supabase
      .from('comments')
      .insert({
        project_id: projectId,
        author_id: userId,
        body,
        track_id: trackId,
        bar,
        note_id: noteId,
        parent_id: dto.parentId ?? null,
      })
      .select('*')
      .single<CommentRow>();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to create comment: ${error.message}`,
      );
    }

    const userMap = await this.getAuthorNames([created.author_id]);
    const item: CommentItem = {
      id: created.id,
      projectId: created.project_id,
      body: created.body,
      trackId: created.track_id,
      bar: created.bar,
      noteId: created.note_id,
      parentId: created.parent_id,
      author: userMap.get(created.author_id) ?? {
        id: created.author_id,
        username: null,
        displayName: null,
        avatarUrl: null,
      },
      createdAt: created.created_at,
      noteMissing: false,
    };

    // Notify the owner + other accepted collaborators (not the author of the
    // comment).
    // TODO(Trí UC-80): replace with NotificationsService.notify — payload
    // per docs/team-workload.md notification-types table (`comment.new` for a
    // top-level comment, `comment.reply` for a reply, to the parent's author).
    const recipients = await this.notificationRecipients(projectId, userId);
    for (const recipient of recipients) {
      this.emitNotification({
        userId: recipient,
        type: item.parentId ? 'comment.reply' : 'comment.new',
        payload: { projectId, commentId: item.id },
      });
    }

    return item;
  }

  /**
   * DELETE /projects/:projectId/comments/:commentId — BR-69: the author may
   * delete their own comment; the owner may delete any of them.
   */
  async deleteComment(
    projectId: string,
    commentId: string,
    userId: string,
  ): Promise<void> {
    await this.projectAccess.assertCanView(projectId, userId);

    const comment = await this.getCommentInProject(projectId, commentId);

    const access = await this.projectAccess.getAccess(projectId, userId);
    const isOwner = access === 'owner';
    const isAuthor = comment.author_id === userId;
    if (!isOwner && !isAuthor) {
      throw new ForbiddenException(
        'You are not allowed to delete this comment',
      );
    }

    // Deleting a top-level comment cascades to its replies via the
    // parent_id FK (ON DELETE CASCADE in the migration).
    const { error } = await this.supabase
      .from('comments')
      .delete()
      .eq('id', commentId);
    if (error) {
      throw new InternalServerErrorException(
        `Failed to delete comment: ${error.message}`,
      );
    }
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * The set of note ids present in the branch currently open: the draft when
   * one exists, otherwise the latest commit's snapshot, otherwise an empty set
   * (no notes at all → every note-anchored comment is missing).
   */
  private async currentNoteIds(projectId: string): Promise<Set<string>> {
    const branch = await this.getActiveBranch(projectId);

    const { data: draft, error: draftError } = await this.supabase
      .from('drafts')
      .select('snapshot')
      .eq('branch_id', branch.id)
      .maybeSingle<{ snapshot: DraftSnapshot }>();
    if (draftError) {
      throw new InternalServerErrorException(
        `Failed to read draft for note check: ${draftError.message}`,
      );
    }

    let snapshot: DraftSnapshot | null = draft?.snapshot ?? null;
    if (!snapshot && branch.head_commit_id) {
      const { data: commit, error: commitError } = await this.supabase
        .from('commits')
        .select('snapshot')
        .eq('id', branch.head_commit_id)
        .maybeSingle<{ snapshot: DraftSnapshot }>();
      if (commitError) {
        throw new InternalServerErrorException(
          `Failed to read commit snapshot: ${commitError.message}`,
        );
      }
      snapshot = commit?.snapshot ?? null;
    }

    return new Set((snapshot?.notes ?? []).map((n) => n.id));
  }

  /**
   * The branch the editor currently has open (UC-48 semantics, same fallback
   * rules as `ProjectsService.getActiveBranchForOwner`, without the owner
   * check so collaborators can read it too): `projects.active_branch_id`
   * when set and still valid, else the project's default branch.
   */
  private async getActiveBranch(projectId: string): Promise<{
    id: string;
    head_commit_id: string | null;
  }> {
    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .select('active_branch_id')
      .eq('id', projectId)
      .maybeSingle<{ active_branch_id: string | null }>();
    if (projectError) {
      throw new InternalServerErrorException(
        `Failed to resolve active branch: ${projectError.message}`,
      );
    }

    const { data: branches, error: branchesError } = await this.supabase
      .from('branches')
      .select('id, head_commit_id, is_default')
      .eq('project_id', projectId);
    if (branchesError) {
      throw new InternalServerErrorException(
        `Failed to fetch branches: ${branchesError.message}`,
      );
    }

    const all = (branches ?? []) as Array<{
      id: string;
      head_commit_id: string | null;
      is_default: boolean;
    }>;

    // Same fallback rules as `ProjectsService.getActiveBranchForOwner`:
    // a valid `active_branch_id` wins; otherwise the project's default branch.
    const activeId =
      project?.active_branch_id &&
      all.some((b) => b.id === project.active_branch_id)
        ? project.active_branch_id
        : null;

    const active =
      activeId !== null
        ? all.find((b) => b.id === activeId)
        : all.find((b) => b.is_default);

    if (!active) {
      throw new NotFoundException('Default branch not found');
    }
    return active;
  }

  /** Fetch one comment or 404 (never leaks whether a foreign-project comment exists). */
  private async getCommentInProject(
    projectId: string,
    commentId: string,
  ): Promise<CommentRow> {
    const { data: row, error } = await this.supabase
      .from('comments')
      .select('*')
      .eq('id', commentId)
      .eq('project_id', projectId)
      .maybeSingle<CommentRow>();
    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch comment: ${error.message}`,
      );
    }
    if (!row) {
      throw new NotFoundException('Comment not found');
    }
    return row;
  }

  /** Map author_id → {id, username, displayName, avatarUrl} for display. */
  private async getAuthorNames(
    authorIds: string[],
  ): Promise<Map<string, NonNullable<CommentItem['author']>>> {
    const map = new Map<
      string,
      {
        id: string;
        username: string | null;
        displayName: string | null;
        avatarUrl: string | null;
      }
    >();
    const unique = [...new Set(authorIds.filter(Boolean))];
    if (unique.length === 0) return map;

    const { data, error } = await this.supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .in('id', unique);
    if (error) {
      throw new InternalServerErrorException(
        `Failed to look up comment authors: ${error.message}`,
      );
    }
    for (const row of (data ?? []) as Array<{
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    }>) {
      map.set(row.id, {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      });
    }
    return map;
  }

  /**
   * Comment-notification recipients: the project owner plus the project's
   * collaborators, minus the person who just wrote. Owner of a project where
   * no one else is involved still hears about it (the owner is a recipient).
   */
  private async notificationRecipients(
    projectId: string,
    authorUserId: string,
  ): Promise<string[]> {
    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .maybeSingle<{ owner_id: string }>();
    if (projectError) {
      throw new InternalServerErrorException(
        `Failed to resolve comment recipients: ${projectError.message}`,
      );
    }
    const recipients = new Set<string>([
      ...(project?.owner_id ? [project.owner_id] : []),
    ]);

    const { data: collaborators, error: collabError } = await this.supabase
      .from('project_collaborators')
      .select('user_id, status')
      .eq('project_id', projectId);
    if (collabError) {
      throw new InternalServerErrorException(
        `Failed to resolve comment recipients: ${collabError.message}`,
      );
    }
    for (const row of (collaborators ?? []) as Array<{
      user_id: string;
      status: string;
    }>) {
      // BR-65: pending invites have no access, no notifications.
      if (row.status === 'accepted') recipients.add(row.user_id);
    }
    recipients.delete(authorUserId);
    return [...recipients];
  }

  /**
   * Notification emission point (same seam as the collaboration module).
   * TODO(Trí UC-80): replace with NotificationsService.notify.
   */
  private emitNotification(args: {
    userId: string;
    type: string;
    payload: Record<string, unknown>;
  }): void {
    console.warn('[comments] notify', args.type, args.userId, args.payload);
  }
}
