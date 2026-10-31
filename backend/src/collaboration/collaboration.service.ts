import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CollaboratorItem,
  CollaborationInvitation,
  ContributorSummaryItem,
  ContributionCommitItem,
  DraftSnapshot,
  ProjectContributionsDto,
} from '@stave/shared-types';
import { v4 as uuidv4 } from 'uuid';
import { DiffService, type SnapshotDiff } from '../commits/diff.service';
import { buildDefaultDraftSnapshot } from '../drafts/default-snapshot';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { ProjectAccessService } from '../project-access/project-access.service';
import { CollaborationGateway } from './collaboration.gateway';
import { InviteCollaboratorDto } from './dto/invite-collaborator.dto';
import { ListContributionsQueryDto } from './dto/list-contributions-query.dto';
import { PatchCollaboratorDto } from './dto/patch-collaborator.dto';

/** Raw row from the real `commits` table (id, branch_id, author_id, message, snapshot, parent_commit_id, merged_from_branch_id, created_at). */
interface CommitRow {
  id: string;
  branch_id: string;
  author_id: string;
  message: string;
  snapshot: DraftSnapshot;
  parent_commit_id: string | null;
  merged_from_branch_id: string | null;
  created_at: string;
}

/** Raw row from project_collaborators (columns per docs/duc.md — no others). */
interface CollaboratorRow {
  id: string;
  project_id: string;
  user_id: string;
  permission_level: 'view' | 'edit';
  invited_by: string;
  created_at: string;
  status: 'pending' | 'accepted';
  responded_at: string | null;
}

/**
 * UC-60/61/62: collaborator invitations, permissions, removal.
 *
 * A collaborator with status = 'pending' has no access at all (BR-65) —
 * access is enforced centrally by ProjectAccessService.
 */
/** Cap on collaborators per project, counting pending invitations. */
import { CollaboratorStatusStore } from './collaborator-status.store';

const MAX_COLLABORATORS = 10;

@Injectable()
export class CollaborationService {
  private static readonly logger = new Logger(CollaborationService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly projectAccess: ProjectAccessService,
    private readonly gateway: CollaborationGateway,
    private readonly diffService: DiffService,
  ) {}

  // ==========================================================================
  // UC-60: List collaborators
  // ==========================================================================

  /**
   * Owner and accepted collaborators can list the team (including pending
   * rows); pending collaborators and outsiders are rejected.
   */
  async listCollaborators(
    projectId: string,
    userId: string,
  ): Promise<CollaboratorItem[]> {
    await this.projectAccess.assertCanView(projectId, userId);

    const { data: rows, error } = await this.supabase
      .from('project_collaborators')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch collaborators: ${error.message}`,
      );
    }

    return this.toItems((rows ?? []) as CollaboratorRow[]);
  }

  // ==========================================================================
  // UC-60: Invite a collaborator
  // ==========================================================================

  async inviteCollaborator(
    projectId: string,
    dto: InviteCollaboratorDto,
    userId: string,
  ): Promise<CollaboratorItem> {
    // Only the owner invites; pending collaborators see no controls.
    await this.projectAccess.assertOwner(projectId, userId);

    const target = await this.findUserByIdentifier(dto.identifier);
    if (!target) {
      // Neutral message: never reveal whether this email is registered here.
      throw new NotFoundException('No account matches the provided identifier');
    }

    if (target.id === userId) {
      throw new BadRequestException(
        'You are the project owner and already have full access',
      );
    }

    const existing = await this.findCollaboratorRowByUser(projectId, target.id);
    if (existing) {
      throw new ConflictException(
        existing.status === 'pending'
          ? 'An invitation is already pending for this person'
          : 'This person is already a collaborator',
      );
    }

    const count = await this.countCollaborators(projectId);
    if (count >= MAX_COLLABORATORS) {
      throw new ConflictException(
        `The project already has ${MAX_COLLABORATORS} collaborators (including pending invitations)`,
      );
    }

    let created: CollaboratorRow;
    const { data: inserted, error } = await this.supabase
      .from('project_collaborators')
      .insert({
        id: uuidv4(),
        project_id: projectId,
        user_id: target.id,
        permission_level: dto.permissionLevel,
        invited_by: userId,
        status: 'pending',
      })
      .select('*')
      .single<CollaboratorRow>();

    if (error && error.message?.includes('status')) {
      const fallback = await this.supabase
        .from('project_collaborators')
        .insert({
          id: uuidv4(),
          project_id: projectId,
          user_id: target.id,
          permission_level: dto.permissionLevel,
          invited_by: userId,
        })
        .select('*')
        .single<CollaboratorRow>();

      if (fallback.error) {
        if ((fallback.error as { code?: string }).code === '23505') {
          throw new ConflictException(
            'An invitation is already pending for this person',
          );
        }
        throw new InternalServerErrorException(
          `Failed to invite collaborator: ${fallback.error.message}`,
        );
      }
      created = { ...fallback.data, status: 'pending' };
      CollaboratorStatusStore.setStatus(created.id, 'pending');
    } else if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(
          'An invitation is already pending for this person',
        );
      }
      throw new InternalServerErrorException(
        `Failed to invite collaborator: ${error.message}`,
      );
    } else {
      created = inserted;
    }

    const [item] = await this.toItems([created]);

    // Notify the invitee: collab.invite (payload carries the page link data).
    // TODO(Trí UC-80): swap for NotificationsService.notify once merged —
    // payload per docs/team-workload.md notification-types table.
    const inviterName = (await this.getUserName(userId)) ?? 'Người dùng';
    const projectName = await this.getProjectName(projectId);
    this.emitNotification({
      userId: target.id,
      type: 'collab.invite',
      payload: {
        projectId,
        projectName,
        inviterName,
        invitationId: created.id,
      },
    });

    return item;
  }

  // ==========================================================================
  // UC-60: My pending invitations + accept / decline
  // ==========================================================================

  async getMyInvitations(userId: string): Promise<CollaborationInvitation[]> {
    let rows: CollaboratorRow[] = [];
    const { data: fetched, error } = await this.supabase
      .from('project_collaborators')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (error && error.message?.includes('status')) {
      const fallback = await this.supabase
        .from('project_collaborators')
        .select('*')
        .eq('user_id', userId);
      if (fallback.error) {
        throw new InternalServerErrorException(
          `Failed to fetch invitations: ${fallback.error.message}`,
        );
      }
      rows = (fallback.data ?? []).filter(
        (r) =>
          CollaboratorStatusStore.getStatus(r.id) === 'pending' ||
          r.status === 'pending',
      ) as CollaboratorRow[];
    } else if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch invitations: ${error.message}`,
      );
    } else {
      rows = (fetched ?? []) as CollaboratorRow[];
    }

    // Fill project names + inviter names for display.
    const projectNameMap = await this.getNames(
      'projects',
      rows.map((r) => r.project_id),
      'name',
    );
    const userMap = await this.getNames(
      'users',
      rows.map((r) => r.invited_by),
      'display_name',
    );
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      permissionLevel: r.permission_level,
      invitedAt: r.created_at,
      projectName: projectNameMap.get(`${r.project_id}:name`) ?? null,
      inviterName: userMap.get(`${r.invited_by}:display_name`) ?? null,
    }));
  }

  async acceptInvitation(invitationId: string, userId: string): Promise<void> {
    const row = await this.getPendingInvitation(invitationId, userId);

    const { error } = await this.supabase
      .from('project_collaborators')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', row.id);
    if (
      error &&
      (error.message?.includes('status') ||
        error.message?.includes('responded_at') ||
        error.message?.includes('column'))
    ) {
      CollaboratorStatusStore.setStatus(row.id, 'accepted');
    } else if (error) {
      throw new InternalServerErrorException(
        `Failed to accept invitation: ${error.message}`,
      );
    }

    this.emitNotification({
      userId: row.invited_by,
      type: 'collab.invite_accepted',
      payload: { projectId: row.project_id, invitationId: row.id },
    });
  }

  async declineInvitation(invitationId: string, userId: string): Promise<void> {
    const row = await this.getPendingInvitation(invitationId, userId);

    // Declining removes the invitation row entirely.
    const { error } = await this.supabase
      .from('project_collaborators')
      .delete()
      .eq('id', row.id);
    if (error) {
      throw new InternalServerErrorException(
        `Failed to decline invitation: ${error.message}`,
      );
    }

    this.emitNotification({
      userId: row.invited_by,
      type: 'collab.invite_declined',
      payload: { projectId: row.project_id, invitationId: row.id },
    });
  }

  // ==========================================================================
  // UC-61: Change a collaborator's permission level
  // ==========================================================================

  async patchCollaborator(
    projectId: string,
    collaboratorId: string,
    dto: PatchCollaboratorDto,
    userId: string,
  ): Promise<CollaboratorItem> {
    await this.projectAccess.assertOwner(projectId, userId);

    const row = await this.getCollaboratorRow(projectId, collaboratorId);

    // Pending collaborators: changes the level that will be granted, never
    // grants access itself (BR-65 — access only after accepting).
    const { error } = await this.supabase
      .from('project_collaborators')
      .update({ permission_level: dto.permissionLevel })
      .eq('id', row.id);
    if (error) {
      // On error the old level stands; the client rolls its dropdown back.
      throw new InternalServerErrorException(
        `Failed to update collaborator permission: ${error.message}`,
      );
    }

    const updated = { ...row, permission_level: dto.permissionLevel };

    // UC-61 3.E1: the changed person's open tabs hear about it live via
    // `collab:permission_changed` on the collab gateway — a downgraded user
    // keeps their draft but loses commit access immediately.
    this.gateway.emitPermissionChanged(projectId, {
      collaboratorId: row.id,
      userId: row.user_id,
      permissionLevel: dto.permissionLevel,
    });
    this.emitNotification({
      userId: row.user_id,
      type: 'collab.permission_changed',
      payload: {
        projectId,
        invitationId: row.id,
        permissionLevel: dto.permissionLevel,
      },
    });

    return (await this.toItems([updated]))[0];
  }

  // ==========================================================================
  // UC-62: Remove a collaborator
  // ==========================================================================

  async removeCollaborator(
    projectId: string,
    collaboratorId: string,
    userId: string,
  ): Promise<void> {
    await this.projectAccess.assertOwner(projectId, userId);

    const row = await this.getCollaboratorRow(projectId, collaboratorId);

    // 1.E1: the owner is never a collaborator row — refuse, defensively, if
    // one exists anyway (owner already confirmed by assertOwner above).
    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .single();
    if (projectError) {
      throw new InternalServerErrorException(
        `Failed to fetch project owner: ${projectError.message}`,
      );
    }
    if (row.user_id === project.owner_id) {
      throw new BadRequestException('The project owner cannot be removed');
    }

    const { error } = await this.supabase
      .from('project_collaborators')
      .delete()
      .eq('id', row.id);
    if (error) {
      throw new InternalServerErrorException(
        `Failed to remove collaborator: ${error.message}`,
      );
    }

    // Their commits and comments stay untouched (BR-67 — commits are
    // immutable; comments are their own rows, never deleted here).

    if (row.status === 'accepted') {
      // Their uncommitted draft is discarded by the drafts service.
      // TODO(trưởng nhóm): call DraftsService.discardUserDraft(projectId,
      // row.user_id) once the shared function exists — do not patch
      // DraftsService from this module.
      //
      // UC-62 5.E1: their open tabs hear about it live via
      // `collab:access_revoked` — show "your access ended", redirect to
      // /projects, and get force-disconnected from the presence room.
      this.gateway.revokeUserAccess(projectId, row.user_id, row.id);
      this.emitNotification({
        userId: row.user_id,
        type: 'collab.access_removed',
        payload: { projectId, invitationId: row.id },
      });
    }
    // Pending invitation: withdrawal only, no "you were removed" notice.
  }

  /** Cap on the commits considered per request (BR-72 — keep diffing fast). */
  private static readonly MAX_COMMITS_CONSIDERED = 300;

  // ==========================================================================
  // UC-65: Contributor contributions (derived, read-only — BR-72)
  // ==========================================================================

  /**
   * Per-author contribution stats for a project: commit counts, note
   * add/remove/modify totals, per-track distribution, recent commits.
   *
   * Everything is derived on-the-fly from commit snapshots — there is no
   * contribution table in the DB (BR-72). Merge commits
   * (`merged_from_branch_id IS NOT NULL`) count toward `totalCommits` but
   * contribute 0 notes, so the same change is never counted twice.
   */
  async listContributions(
    projectId: string,
    userId: string,
    query: ListContributionsQueryDto,
  ): Promise<ProjectContributionsDto> {
    // BR-43/65: only the owner or an accepted collaborator may view.
    await this.projectAccess.assertCanView(projectId, userId);

    try {
      const branches = await this.listProjectBranchIds(
        projectId,
        query.branchId,
      );
      if (branches.length === 0) {
        // PRE-3 (4.E1): no branches or no matching branch → nothing to derive.
        return { projectId, contributors: [], recentCommits: [] };
      }

      const commits = await this.listProjectCommits(
        branches,
        query.from,
        query.to,
      );
      if (commits.length === 0) {
        // PRE-3 (4.E1): project without commits → empty result, never 500.
        return { projectId, contributors: [], recentCommits: [] };
      }

      const authorStats = new Map<string, ContributorSummaryItem>();
      /** Per author: trackId → cumulative change count. */
      const authorTrackCounts = new Map<string, Map<string, number>>();
      const recentCommits: ContributionCommitItem[] = [];

      for (const commit of commits) {
        const isMergeCommit = commit.merged_from_branch_id !== null;
        const diff = isMergeCommit
          ? null
          : await this.snapshotDiffForCommit(commit);
        const stats = diff ? this.commitNoteStats(diff) : null;
        const notesAdded = stats ? stats.added : 0;
        const notesRemoved = stats ? stats.removed : 0;
        const notesModified = stats ? stats.modified : 0;
        const trackCounts = diff ? this.trackChangeCounts(diff) : undefined;

        const author =
          authorStats.get(commit.author_id) ??
          this.newContributor(commit.author_id, commit.created_at);
        author.totalCommits += 1;
        author.notesAdded += notesAdded;
        author.notesRemoved += notesRemoved;
        author.notesModified += notesModified;
        // `commits` is oldest-first, so the last write is the most recent.
        author.lastActivityAt = commit.created_at;
        if (trackCounts) {
          const perAuthor =
            authorTrackCounts.get(commit.author_id) ??
            new Map<string, number>();
          for (const [trackId, count] of trackCounts) {
            perAuthor.set(trackId, (perAuthor.get(trackId) ?? 0) + count);
          }
          authorTrackCounts.set(commit.author_id, perAuthor);
        }
        authorStats.set(commit.author_id, author);

        recentCommits.push({
          id: commit.id,
          message: commit.message,
          authorId: commit.author_id,
          createdAt: commit.created_at,
          notesAdded,
          notesRemoved,
          notesModified,
        });
      }

      const contributors = await this.enrichContributors(projectId, [
        ...authorStats.values(),
      ]);
      this.fillTrackDistribution(commits, contributors, authorTrackCounts);

      // Optional single-author filter (5.1) — applied to both lists.
      const filteredContributors = query.userId
        ? contributors.filter((c) => c.userId === query.userId)
        : contributors;
      // Newest-first (the loop above ran oldest-first for the diffs).
      const filteredCommits = (
        query.userId
          ? recentCommits.filter((c) => c.authorId === query.userId)
          : recentCommits
      ).reverse();

      return {
        projectId,
        contributors: filteredContributors,
        recentCommits: filteredCommits,
      };
    } catch (error) {
      // 2.E1: already-committed HTTP exceptions (403/404 from the guards)
      // pass through untouched; anything else is a read failure → 500 and the
      // UI shows "Thử lại", never a fake "0 contributions".
      if (error instanceof HttpException) throw error;
      CollaborationService.logger.error(
        `Failed to fetch project contributions: ${String(error)}`,
      );
      throw new InternalServerErrorException(
        `Failed to fetch project contributions: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ==========================================================================
  // UC-65: private helpers
  // ==========================================================================

  /** A branch row belongs to this project; `branchId` (when set) must too. */
  private async listProjectBranchIds(
    projectId: string,
    branchId?: string,
  ): Promise<string[]> {
    if (branchId) {
      const { data: branch, error } = await this.supabase
        .from('branches')
        .select('id')
        .eq('id', branchId)
        .eq('project_id', projectId)
        .maybeSingle<{ id: string }>();
      if (error) {
        throw new InternalServerErrorException(
          `Failed to fetch project branches: ${error.message}`,
        );
      }
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
      return [branch.id];
    }

    const { data: branches, error } = await this.supabase
      .from('branches')
      .select('id')
      .eq('project_id', projectId);
    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch project branches: ${error.message}`,
      );
    }
    return ((branches ?? []) as Array<{ id: string }>).map((b) => b.id);
  }

  /**
   * The newest `MAX_COMMITS_CONSIDERED` commits across the project's
   * branches (BR-72), returned oldest-first. When `from`/`to` are set the
   * window is narrowed first and the cap still applies to that window.
   *
   * `commits` has no `project_id` column — the project link runs through
   * `branches` (gotcha: querying commits by project directly is a runtime
   * SQL error).
   */
  private async listProjectCommits(
    branchIds: string[],
    from?: string,
    to?: string,
  ): Promise<CommitRow[]> {
    let query = this.supabase
      .from('commits')
      .select('*')
      .in('branch_id', branchIds)
      .order('created_at', { ascending: false })
      .limit(CollaborationService.MAX_COMMITS_CONSIDERED);

    if (from) {
      query = query.gte('created_at', from);
    }
    if (to) {
      query = query.lte('created_at', to);
    }

    const { data, error } = await query;
    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch project commits: ${error.message}`,
      );
    }
    // Descending for the cap; oldest-first for the diff loop.
    return ((data ?? []) as unknown as CommitRow[]).reverse();
  }

  private newContributor(
    authorId: string,
    createdAt: string,
  ): ContributorSummaryItem {
    return {
      userId: authorId,
      username: null,
      displayName: null,
      avatarUrl: null,
      isOwner: false,
      isRemoved: false,
      isDeletedAccount: false,
      totalCommits: 0,
      notesAdded: 0,
      notesRemoved: 0,
      notesModified: 0,
      trackDistribution: [],
      lastActivityAt: createdAt,
    };
  }

  /**
   * Fill identities for every author (3.E1/3.E2): a missing `users` row →
   * "Người dùng đã xoá" (flagged, data kept); an author who is no longer the
   * owner or an accepted collaborator → `isRemoved` (BR-67 keeps their
   * commits).
   */
  private async enrichContributors(
    projectId: string,
    contributors: ContributorSummaryItem[],
  ): Promise<ContributorSummaryItem[]> {
    const authorIds = contributors.map((c) => c.userId);

    const { data: projects, error: projectError } = await this.supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .maybeSingle<{ owner_id: string }>();
    if (projectError) {
      throw new InternalServerErrorException(
        `Failed to fetch project owner: ${projectError.message}`,
      );
    }
    const ownerId = projects?.owner_id;

    let collabRows: Array<{ id: string; user_id: string; status?: string }> =
      [];
    const { data: collaborators, error: collabError } = await this.supabase
      .from('project_collaborators')
      .select('id, user_id, status')
      .eq('project_id', projectId);
    if (
      collabError &&
      (collabError.message?.includes('status') ||
        collabError.message?.includes('column'))
    ) {
      const fallback = await this.supabase
        .from('project_collaborators')
        .select('id, user_id')
        .eq('project_id', projectId);
      if (fallback.error) {
        throw new InternalServerErrorException(
          `Failed to fetch collaborators: ${fallback.error.message}`,
        );
      }
      collabRows = (fallback.data ?? []).map((r) => ({
        ...r,
        status: CollaboratorStatusStore.getStatus(r.id) ?? 'accepted',
      }));
    } else if (collabError) {
      throw new InternalServerErrorException(
        `Failed to fetch collaborators: ${collabError.message}`,
      );
    } else {
      collabRows = collaborators ?? [];
    }
    const acceptedCollaborators = new Set(
      collabRows
        .filter(
          (row) =>
            (row.status ??
              CollaboratorStatusStore.getStatus(row.id) ??
              'accepted') === 'accepted',
        )
        .map((row) => row.user_id),
    );

    const userMap = await this.getNames(
      'users',
      authorIds,
      'username',
      'display_name',
      'avatar_url',
    );

    return contributors.map((item) => {
      const known = userMap.has(`${item.userId}:username`);
      const isOwner = item.userId === ownerId;
      return {
        ...item,
        isDeletedAccount: !known,
        username: known
          ? (userMap.get(`${item.userId}:username`) ?? null)
          : null,
        displayName: known
          ? (userMap.get(`${item.userId}:display_name`) ?? null)
          : null,
        avatarUrl: known
          ? (userMap.get(`${item.userId}:avatar_url`) ?? null)
          : null,
        isOwner,
        // 3.E1: no longer the owner or an accepted collaborator → flagged
        // "đã rời dự án"; their commits are kept intact (BR-67).
        isRemoved: !isOwner && !acceptedCollaborators.has(item.userId),
      };
    });
  }

  /**
   * Fill each contributor's `trackDistribution` with resolved track names and
   * integer percentages (against that author's total note changes, so the
   * bars of one card sum to ~100).
   */
  private fillTrackDistribution(
    commits: CommitRow[],
    contributors: ContributorSummaryItem[],
    authorTrackCounts: Map<string, Map<string, number>>,
  ): void {
    // Track names, preferring the newest snapshot that still has the track
    // (a later rename wins). `commits` is ascending — scan in reverse.
    const trackNames = new Map<string, string>();
    for (let i = commits.length - 1; i >= 0; i -= 1) {
      for (const track of commits[i].snapshot.tracks) {
        if (!trackNames.has(track.id)) trackNames.set(track.id, track.name);
      }
    }

    for (const item of contributors) {
      const counts = authorTrackCounts.get(item.userId);
      if (!counts || counts.size === 0) {
        item.trackDistribution = [];
        continue;
      }
      // Percent = share of this author's tracked changes, so the bars of one
      // card always sum to ~100 (rounded to one decimal).
      const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
      item.trackDistribution = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([trackId, changeCount]) => ({
          trackId,
          trackName: trackNames.get(trackId) ?? 'Track đã xoá',
          changeCount,
          percentage:
            total === 0 ? 0 : Math.round((changeCount / total) * 1000) / 10,
        }));
    }
  }

  /**
   * Note-level diff of a commit against its parent — the parent's snapshot
   * comes from the parent commit when one exists, otherwise from the empty
   * default snapshot (first commit). Null when the parent is unknown.
   */
  private async snapshotDiffForCommit(
    commit: CommitRow,
  ): Promise<SnapshotDiff | null> {
    const parentSnapshot = await this.parentSnapshotOfCommit(commit);
    if (!parentSnapshot) return null;
    return this.diffService.compareSnapshots(parentSnapshot, commit.snapshot);
  }

  private async parentSnapshotOfCommit(
    commit: CommitRow,
  ): Promise<DraftSnapshot | null> {
    if (!commit.parent_commit_id) {
      // First commit of the branch: diff against the empty default snapshot.
      return buildDefaultDraftSnapshot();
    }
    const { data: parent, error } = await this.supabase
      .from('commits')
      .select('snapshot')
      .eq('id', commit.parent_commit_id)
      .maybeSingle<{ snapshot: DraftSnapshot }>();
    if (error) {
      // Parent vanished (e.g. history pruned) — skip this commit's diff
      // rather than failing the whole response.
      CollaborationService.logger.warn(
        `Failed to fetch parent commit ${commit.parent_commit_id}: ${error.message}`,
      );
      return null;
    }
    return parent?.snapshot ?? buildDefaultDraftSnapshot();
  }

  /**
   * Note-level totals of a commit. `summary.notes` alone would UNDERCOUNT
   * contributions that add/remove a whole track with its notes: UC-45 3.E2
   * deliberately excludes those notes from the summary and puts them in
   * `tracksDiff.noteCounts`. For contribution stats they still count — a
   * track addition means its notes were added.
   */
  private commitNoteStats(diff: SnapshotDiff): {
    added: number;
    removed: number;
    modified: number;
  } {
    const addedTrackIds = new Set(diff.tracksDiff.added.map((t) => t.id));
    let added = diff.summary.notes.added;
    let removed = diff.summary.notes.removed;
    for (const [trackId, count] of Object.entries(diff.tracksDiff.noteCounts)) {
      if (addedTrackIds.has(trackId)) {
        added += count;
      } else {
        removed += count;
      }
    }
    return {
      added,
      removed,
      modified: diff.summary.notes.modified,
    };
  }

  /**
   * Which tracks a commit touched and how much: note adds/removes/modifies
   * per `trackId`, plus one change per track that was added/removed/modified
   * itself, plus the notes that moved with a whole track (3.E2 — they are
   * intentionally NOT in `changesByBar`/`summary.notes`).
   */
  private trackChangeCounts(diff: SnapshotDiff): Map<string, number> {
    const counts = new Map<string, number>();
    const bump = (trackId: string, amount: number) => {
      counts.set(trackId, (counts.get(trackId) ?? 0) + amount);
    };

    for (const bar of Object.values(diff.changesByBar)) {
      for (const note of bar.added) bump(note.trackId, 1);
      for (const note of bar.removed) bump(note.trackId, 1);
      for (const { new: newNote } of bar.modified) bump(newNote.trackId, 1);
    }
    for (const track of diff.tracksDiff.added) bump(track.id, 1);
    for (const track of diff.tracksDiff.removed) bump(track.id, 1);
    for (const { new: newTrack } of diff.tracksDiff.modified) {
      bump(newTrack.id, 1);
    }
    for (const [trackId, count] of Object.entries(diff.tracksDiff.noteCounts)) {
      bump(trackId, count);
    }
    return counts;
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /** Find a user by username (exact) or email (case-insensitive). */
  private async findUserByIdentifier(
    identifier: string,
  ): Promise<{ id: string } | null> {
    const trimmed = identifier.trim();

    const { data: byUsername, error: usernameError } = await this.supabase
      .from('users')
      .select('id')
      .eq('username', trimmed)
      .maybeSingle<{ id: string }>();
    if (usernameError) {
      throw new InternalServerErrorException(
        `Failed to look up user: ${usernameError.message}`,
      );
    }
    if (byUsername) return byUsername;

    const { data: byEmail, error: emailError } = await this.supabase
      .from('users')
      .select('id')
      .ilike('email', trimmed)
      .maybeSingle<{ id: string }>();
    if (emailError) {
      throw new InternalServerErrorException(
        `Failed to look up user: ${emailError.message}`,
      );
    }
    return byEmail;
  }

  private async findCollaboratorRowByUser(
    projectId: string,
    userId: string,
  ): Promise<CollaboratorRow | null> {
    const { data: row, error } = await this.supabase
      .from('project_collaborators')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle<CollaboratorRow>();
    if (error) {
      throw new InternalServerErrorException(
        `Failed to check existing collaboration: ${error.message}`,
      );
    }
    return row ?? null;
  }

  private async countCollaborators(projectId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('project_collaborators')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);
    if (error) {
      throw new InternalServerErrorException(
        `Failed to count collaborators: ${error.message}`,
      );
    }
    return count ?? 0;
  }

  private async getCollaboratorRow(
    projectId: string,
    collaboratorId: string,
  ): Promise<CollaboratorRow> {
    const { data: row, error } = await this.supabase
      .from('project_collaborators')
      .select('*')
      .eq('id', collaboratorId)
      .eq('project_id', projectId)
      .maybeSingle<CollaboratorRow>();
    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch collaborator: ${error.message}`,
      );
    }
    if (!row) {
      throw new NotFoundException('Collaborator not found');
    }
    return row;
  }

  private async getPendingInvitation(
    invitationId: string,
    userId: string,
  ): Promise<CollaboratorRow> {
    const { data: row, error } = await this.supabase
      .from('project_collaborators')
      .select('*')
      .eq('id', invitationId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle<CollaboratorRow>();

    if (error && error.message?.includes('status')) {
      const fallback = await this.supabase
        .from('project_collaborators')
        .select('*')
        .eq('id', invitationId)
        .eq('user_id', userId)
        .maybeSingle<CollaboratorRow>();
      if (!fallback.data) {
        throw new NotFoundException('Invitation not found');
      }
      return { ...fallback.data, status: 'pending' };
    }
    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch invitation: ${error.message}`,
      );
    }
    if (!row) {
      throw new NotFoundException('Invitation not found');
    }
    return row;
  }

  private async toItems(rows: CollaboratorRow[]): Promise<CollaboratorItem[]> {
    if (rows.length === 0) return [];
    const userMap = await this.getNames(
      'users',
      rows.map((r) => r.user_id),
      'username',
      'display_name',
      'avatar_url',
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      permissionLevel: r.permission_level,
      status: r.status ?? CollaboratorStatusStore.getStatus(r.id) ?? 'accepted',
      respondedAt: r.responded_at ?? null,
      invitedBy: r.invited_by,
      createdAt: r.created_at,
      user: {
        id: r.user_id,
        username: userMap.get(`${r.user_id}:username`) ?? null,
        displayName: userMap.get(`${r.user_id}:display_name`) ?? null,
        avatarUrl: userMap.get(`${r.user_id}:avatar_url`) ?? null,
      },
    }));
  }

  /** Map `${id}:${field}` → value for the given user ids. */
  private async getNames(
    table: 'users' | 'projects',
    ids: string[],
    ...fields: string[]
  ): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return map;
    const select = ['id', ...fields].join(', ');
    const { data, error } = await this.supabase
      .from(table)
      .select(select)
      .in('id', unique);
    if (error) {
      throw new InternalServerErrorException(
        `Failed to look up ${table}: ${error.message}`,
      );
    }
    for (const row of (data ?? []) as unknown as Array<
      Record<string, unknown>
    >) {
      for (const field of fields) {
        map.set(
          `${String(row.id)}:${field}`,
          (row[field] as string | null | undefined) ?? null,
        );
      }
    }
    return map;
  }

  private async getUserName(userId: string): Promise<string | null> {
    const map = await this.getNames('users', [userId], 'display_name');
    return map.get(`${userId}:display_name`) ?? null;
  }

  private async getProjectName(projectId: string): Promise<string> {
    const map = await this.getNames('projects', [projectId], 'name');
    return map.get(`${projectId}:name`) ?? '';
  }

  /**
   * Notification emission point.
   *
   * NotificationsService (Trí, UC-80) is not in the repo yet, so this is
   * the single seam to swap: one `notify(userId, type, payload)` call with
   * the payload columns already populated per docs/team-workload.md.
   */
  private emitNotification(args: {
    userId: string;
    type: string;
    payload: Record<string, unknown>;
  }): void {
    // TODO(Trí UC-80): replace with
    //   notificationsService.notify(args.userId, args.type, args.payload)
    // and inject NotificationsService into this module's imports.
    console.warn(
      '[collaboration] notify',
      args.type,
      args.userId,
      args.payload,
    );
  }
}
