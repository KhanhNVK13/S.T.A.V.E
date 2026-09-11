import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DraftSnapshot,
  CommitRow,
  CommitWithAuthor,
  TagRow,
  PaginatedCommitHistory,
} from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { ProjectsService } from '../projects/projects.service';
import { DiffService } from './diff.service';
import {
  CreateCommitDto,
  DraftNoteDto,
  DraftTrackDto,
  RestoreCommitDto,
} from './dto';
import { GetCommitHistoryDto } from './dto/get-commit-history.dto';
import { TagCommitDto } from './dto/tag-commit.dto';

/** Raw row from the real `commits` table (id, branch_id, author_id, message, snapshot, parent_commit_id, merged_from_branch_id, created_at). */
interface CommitDbRow {
  id: string;
  branch_id: string;
  author_id: string;
  message: string;
  snapshot: DraftSnapshot;
  parent_commit_id: string | null;
  merged_from_branch_id: string | null;
  created_at: string;
}

/** Raw row from the real `commit_tags` table — no `color` column exists. */
interface TagDbRow {
  id: string;
  commit_id: string;
  name: string;
  created_by: string;
  created_at: string;
}

/** Raw row from branches table */
interface BranchDbRow {
  id: string;
  project_id: string;
  name: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
  base_commit_id: string | null;
  head_commit_id: string | null;
}

@Injectable()
export class CommitsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient<any, 'public', any>,
    private readonly projectsService: ProjectsService,
    private readonly diffService: DiffService,
  ) {}

  // ==========================================================================
  // UC-42: Create Commit
  // ==========================================================================

  /**
   * Create a new commit with full snapshot.
   *
   * Writes the commit + moves the branch head + resets the branch's draft in
   * one DB transaction via `create_commit_atomic` (RPC) — a failure partway
   * through rolls back everything instead of leaving head_commit_id/drafts
   * pointing at a stale/inconsistent state.
   *
   * IMPORTANT: `commits` only ever gets INSERTed into, never UPDATE/DELETE
   * (matches the table's real SELECT+INSERT-only RLS policies).
   */
  async createCommit(userId: string, dto: CreateCommitDto): Promise<CommitRow> {
    const {
      branch_id,
      message,
      snapshot: providedSnapshot,
      expectedHeadCommitId,
    } = dto;

    // Step 1: Verify branch exists and user owns the project
    const branch = await this.verifyBranchAccess(branch_id, userId);

    // Step 2: UC-42 Exception 6.E1 - Concurrency Protection
    if (
      expectedHeadCommitId !== undefined &&
      branch.head_commit_id !== expectedHeadCommitId
    ) {
      throw new ConflictException(
        'Branch has moved on with new commits. Please review changes.',
      );
    }

    // Step 3: BR-40 - Draft Diff Check
    let snapshot: DraftSnapshot;
    if (providedSnapshot) {
      snapshot = this.normalizeSnapshot(providedSnapshot);
    } else {
      snapshot = await this.getSnapshotFromDraft(branch.id);
    }

    // Compare with head commit if exists
    if (branch.head_commit_id) {
      const isIdentical = await this.isSnapshotIdenticalToHead(
        branch.head_commit_id,
        snapshot,
      );
      if (isIdentical) {
        throw new BadRequestException(
          'Working draft is identical to the most recent commit',
        );
      }
    }

    // Step 4: Inject UUIDs for notes (ensure persistent identity)
    snapshot = this.injectNoteUuids(snapshot);

    // Step 5+6+7 atomically: insert commit, move branch head, reset draft.
    // parent_commit_id = the branch's current head — this is what lets the
    // rest of the module (divergence, merge-base) walk a real commit graph
    // instead of relying on a static base_commit_id/wall-clock heuristic.
    const { data: commit, error } = await this.supabase.rpc(
      'create_commit_atomic',
      {
        p_branch_id: branch_id,
        p_author_id: userId,
        p_message: message,
        p_snapshot: snapshot,
        p_parent_commit_id: branch.head_commit_id,
        p_merged_from_branch_id: null,
      },
    );

    if (error) {
      throw new InternalServerErrorException(
        `Failed to create commit: ${error.message}`,
      );
    }

    const row = commit as CommitDbRow;

    return {
      id: row.id,
      branch_id: row.branch_id,
      message: row.message,
      snapshot: row.snapshot,
      created_by: row.author_id,
      created_at: row.created_at,
    };
  }

  // ==========================================================================
  // UC-43: Get Commit History
  // ==========================================================================

  /**
   * Get paginated commit history with author info.
   *
   * With `branch_id`: scoped to that branch (ownership verified).
   * Without it: scoped to every branch across projects the caller owns —
   * never returns commits from projects the caller doesn't own.
   */
  async getCommitHistory(
    dto: GetCommitHistoryDto,
    userId: string,
  ): Promise<PaginatedCommitHistory> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    let query = this.supabase.from('commits').select('*', { count: 'exact' });

    if (dto.branch_id) {
      // If filtering by branch, verify user has access
      await this.verifyBranchAccess(dto.branch_id, userId);
      query = query.eq('branch_id', dto.branch_id);
    } else {
      // No branch filter — restrict to branches on projects the caller owns,
      // never the whole platform's commits.
      const ownedBranchIds = await this.getOwnedBranchIds(userId);
      if (ownedBranchIds.length === 0) {
        return { items: [], total: 0, page, totalPages: 0, limit };
      }
      query = query.in('branch_id', ownedBranchIds);
    }

    // Order by created_at descending (newest first)
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch commit history: ${error.message}`,
      );
    }

    const commits = (data ?? []) as unknown as CommitDbRow[];
    const total = count ?? 0;

    // Fetch tags for all commits
    const commitIds = commits.map((c) => c.id);
    const tagsMap = await this.getTagsForCommits(commitIds);

    // Fetch author info for all commits
    const authorIds = [...new Set(commits.map((c) => c.author_id))];
    const authorsMap = await this.getAuthorsInfo(authorIds);

    // Enrich commits with author info and tags
    const items: CommitWithAuthor[] = commits.map((commit) => ({
      id: commit.id,
      branch_id: commit.branch_id,
      message: commit.message,
      snapshot: commit.snapshot,
      created_by: commit.author_id,
      created_at: commit.created_at,
      author: authorsMap.get(commit.author_id) ?? {
        id: commit.author_id,
        username: null,
        display_name: null,
        avatar_url: null,
      },
      tags: tagsMap.get(commit.id) ?? [],
    }));

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    };
  }

  /**
   * Get single commit by ID
   */
  async getCommitById(
    commitId: string,
    userId: string,
  ): Promise<CommitWithAuthor> {
    // Fetch commit with branch info for ownership check
    const { data: commitData, error: commitError } = await this.supabase
      .from('commits')
      .select('*, branch:branches!commits_branch_id_fkey(project_id)')
      .eq('id', commitId)
      .single();

    if (commitError || !commitData) {
      throw new NotFoundException('Commit not found');
    }

    // Verify user has access to the project
    const projectId = (commitData as { branch?: { project_id: string } }).branch
      ?.project_id;
    if (projectId) {
      await this.verifyProjectOwnership(projectId, userId);
    }

    const commit = commitData as unknown as CommitDbRow;
    const tags = await this.getTagsForCommits([commitId]);

    // Fetch author info
    const { data: authorData } = await this.supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .eq('id', commit.author_id)
      .single();

    const author = authorData;

    const authorInfo = {
      id: author?.id ?? commit.author_id,
      username: author?.username ?? null,
      display_name: author?.display_name ?? null,
      avatar_url: author?.avatar_url ?? null,
    };

    return {
      id: commit.id,
      branch_id: commit.branch_id,
      message: commit.message,
      snapshot: commit.snapshot,
      created_by: commit.author_id,
      created_at: commit.created_at,
      author: authorInfo,
      tags: tags.get(commit.id) ?? [],
    };
  }

  // ==========================================================================
  // UC-44: Tag Commit
  // ==========================================================================

  /**
   * Create a tag for a commit.
   *
   * BR-44: tag name unique within the project, and a commit carries at most
   * one tag — both enforced by real DB unique constraints now
   * (`commit_tags_project_id_name_key`, `commit_tags_commit_id_key`), so the
   * upsert below is the single source of truth (no separate check-then-insert
   * race). BR-45: tags are metadata alongside the commit, not part of it.
   */
  async tagCommit(
    commitId: string,
    userId: string,
    dto: TagCommitDto,
  ): Promise<TagRow> {
    // Verify commit exists and caller owns the project (also 404s on bad id)
    await this.verifyCommitOwnership(commitId, userId);

    const tagId = uuidv4();

    // Upsert on commit_id: BR-44 says a commit carries at most one tag, so
    // re-tagging a commit replaces its tag rather than adding a second one.
    const { data: tag, error: tagError } = await this.supabase
      .from('commit_tags')
      .upsert(
        {
          id: tagId,
          commit_id: commitId,
          name: dto.tag,
          created_by: userId,
        },
        {
          onConflict: 'commit_id',
          ignoreDuplicates: false,
        },
      )
      .select('*')
      .single<TagDbRow>();

    if (tagError) {
      // 23505 on (project_id, name) = another commit in this project already
      // has this tag name.
      if ((tagError as { code?: string }).code === '23505') {
        throw new ConflictException('Tag name already exists in this project');
      }
      throw new InternalServerErrorException(
        `Failed to create tag: ${tagError.message}`,
      );
    }

    if (!tag) {
      throw new InternalServerErrorException('Tag was not created');
    }

    return {
      id: tag.id,
      commit_id: tag.commit_id,
      name: tag.name,
      created_by: tag.created_by,
      created_at: tag.created_at,
    };
  }

  /**
   * Get all tags for a specific commit
   */
  async getTagsForCommit(commitId: string, userId: string): Promise<TagRow[]> {
    await this.verifyCommitOwnership(commitId, userId);

    const { data, error } = await this.supabase
      .from('commit_tags')
      .select('*')
      .eq('commit_id', commitId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch tags: ${error.message}`,
      );
    }

    return (data ?? []) as TagRow[];
  }

  /**
   * Delete a tag by name and commit_id
   */
  async deleteTag(
    commitId: string,
    tagName: string,
    userId: string,
  ): Promise<void> {
    await this.verifyCommitOwnership(commitId, userId);

    const { error } = await this.supabase
      .from('commit_tags')
      .delete()
      .eq('commit_id', commitId)
      .eq('name', tagName);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to delete tag: ${error.message}`,
      );
    }
  }

  // ==========================================================================
  // UC-45: Compare Versions (Delegated to DiffService)
  // ==========================================================================

  /**
   * Compare two commits and return diff result.
   * Delegated to DiffService for the actual comparison logic.
   */
  async compareCommits(
    baseCommitId: string,
    targetCommitId: string,
    userId: string,
  ): Promise<ReturnType<DiffService['compareSnapshots']>> {
    // Fetch base commit
    const { data: baseCommit, error: baseError } = await this.supabase
      .from('commits')
      .select('id, snapshot, branch_id')
      .eq('id', baseCommitId)
      .single();

    if (baseError || !baseCommit) {
      throw new NotFoundException('Base commit not found');
    }

    // Fetch target commit
    const { data: targetCommit, error: targetError } = await this.supabase
      .from('commits')
      .select('id, snapshot, branch_id')
      .eq('id', targetCommitId)
      .single();

    if (targetError || !targetCommit) {
      throw new NotFoundException('Target commit not found');
    }

    // Get branch and project IDs
    const baseBranchId = (baseCommit as { branch_id: string }).branch_id;
    const targetBranchId = (targetCommit as { branch_id: string }).branch_id;
    const baseProjectId = await this.getProjectIdFromBranch(baseBranchId);
    const targetProjectId = await this.getProjectIdFromBranch(targetBranchId);

    // Verify both commits belong to the same project (BR-46)
    if (baseProjectId !== targetProjectId) {
      throw new BadRequestException(
        'Cannot compare commits from different projects',
      );
    }

    // Verify caller owns the project both commits belong to
    if (baseProjectId) {
      await this.verifyProjectOwnership(baseProjectId, userId);
    }

    // Use DiffService to compare snapshots
    const baseSnapshot = (baseCommit as { snapshot: DraftSnapshot }).snapshot;
    const targetSnapshot = (targetCommit as { snapshot: DraftSnapshot })
      .snapshot;

    return this.diffService.compareSnapshots(baseSnapshot, targetSnapshot);
  }

  // ==========================================================================
  // UC-46: Restore Previous Version
  // ==========================================================================

  /**
   * Restore a previous commit by creating a new commit with that snapshot.
   *
   * BR-47/BR-41: Restore never deletes/rewrites history - creates a NEW commit.
   *
   * Flow:
   * 1. Verify user has edit permission on target branch
   * 2. Verify commit to restore exists AND belongs to the same project
   * 3. Check if commit is NOT already the head of the branch (PRE-3)
   * 4. Atomically: create new commit with snapshot from old commit, move
   *    branch head, reset draft to match (POST-4)
   */
  async restoreCommit(
    commitId: string,
    userId: string,
    dto: RestoreCommitDto,
  ): Promise<CommitRow> {
    const { branch_id, message: customMessage } = dto;

    // Step 1: Verify user has access to the target branch (also verifies ownership)
    const branch = await this.verifyBranchAccess(branch_id, userId);

    // Step 2: Get the commit to restore and verify it belongs to the same project
    const { data: commitToRestore, error: commitError } = await this.supabase
      .from('commits')
      .select('*, branch:branches!commits_branch_id_fkey(project_id)')
      .eq('id', commitId)
      .single();

    if (commitError || !commitToRestore) {
      throw new NotFoundException('Commit to restore not found');
    }

    const commitProjectId = (
      commitToRestore as { branch?: { project_id: string } }
    ).branch?.project_id;
    if (commitProjectId !== branch.project_id) {
      throw new ForbiddenException(
        'Cannot restore a commit from a different project',
      );
    }

    const commit = commitToRestore as unknown as CommitDbRow;

    // Step 3: PRE-3 Check - Verify this commit is not already the head
    if (branch.head_commit_id === commitId) {
      throw new BadRequestException(
        'Selected commit is already the most recent version on this branch',
      );
    }

    // Step 4: Generate message - use custom or default
    const restoreMessage =
      customMessage ?? `Revert to commit ${commitId.substring(0, 8)}`;

    // Step 5: atomically create the restore commit, move head, reset draft
    const { data: newCommit, error } = await this.supabase.rpc(
      'create_commit_atomic',
      {
        p_branch_id: branch_id,
        p_author_id: userId,
        p_message: restoreMessage,
        p_snapshot: commit.snapshot,
        p_parent_commit_id: branch.head_commit_id,
        p_merged_from_branch_id: null,
      },
    );

    if (error) {
      throw new InternalServerErrorException(
        `Failed to create restore commit: ${error.message}`,
      );
    }

    const row = newCommit as CommitDbRow;

    return {
      id: row.id,
      branch_id: row.branch_id,
      message: row.message,
      snapshot: row.snapshot,
      created_by: row.author_id,
      created_at: row.created_at,
    };
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Get project ID from branch ID
   */
  private async getProjectIdFromBranch(
    branchId: string,
  ): Promise<string | null> {
    const { data: branch } = await this.supabase
      .from('branches')
      .select('project_id')
      .eq('id', branchId)
      .single();

    return branch?.project_id ?? null;
  }

  /** All branch ids belonging to projects the given user owns. */
  private async getOwnedBranchIds(userId: string): Promise<string[]> {
    const { data: ownedProjects } = await this.supabase
      .from('projects')
      .select('id')
      .eq('owner_id', userId);

    const projectIds = (ownedProjects ?? []).map((p: { id: string }) => p.id);
    if (projectIds.length === 0) return [];

    const { data: branches } = await this.supabase
      .from('branches')
      .select('id')
      .in('project_id', projectIds);

    return (branches ?? []).map((b: { id: string }) => b.id);
  }

  /**
   * Verify a commit exists and the caller owns the project it belongs to.
   * Returns the commit's project id.
   */
  private async verifyCommitOwnership(
    commitId: string,
    userId: string,
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from('commits')
      .select('branch:branches!commits_branch_id_fkey(project_id)')
      .eq('id', commitId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Commit not found');
    }

    const projectId = (data as unknown as { branch?: { project_id: string } })
      .branch?.project_id;
    if (!projectId) {
      throw new NotFoundException('Commit not found');
    }

    await this.verifyProjectOwnership(projectId, userId);
    return projectId;
  }

  /**
   * Verify user has access to branch and return branch info
   */
  private async verifyBranchAccess(
    branchId: string,
    userId: string,
  ): Promise<BranchDbRow> {
    // Get branch with project info
    const result = await this.supabase
      .from('branches')
      .select(
        `
        *,
        project:projects!branches_project_id_fkey(id, owner_id)
      `,
      )
      .eq('id', branchId)
      .single();

    const branch = result.data as {
      id: string;
      project_id: string;
      name: string;
      is_default: boolean;
      created_by: string;
      created_at: string;
      base_commit_id: string | null;
      head_commit_id: string | null;
      project: {
        id: string;
        owner_id: string;
      } | null;
    } | null;
    const error = result.error;

    if (error || !branch) {
      throw new NotFoundException('Branch not found');
    }

    // Verify user owns the project
    if (branch.project?.owner_id !== userId) {
      throw new BadRequestException('You do not have access to this branch');
    }

    return branch;
  }

  /**
   * BR-40: Compare snapshot with head commit to detect if there are any changes
   *
   * Returns true if snapshots are identical, false if there are differences.
   */
  private async isSnapshotIdenticalToHead(
    headCommitId: string,
    newSnapshot: DraftSnapshot,
  ): Promise<boolean> {
    // Get head commit's snapshot
    const { data: headCommit, error } = await this.supabase
      .from('commits')
      .select('snapshot')
      .eq('id', headCommitId)
      .single();

    if (error || !headCommit) {
      // If can't find head commit, assume not identical (allow commit)
      return false;
    }

    const headSnapshot = headCommit.snapshot;

    // Use DiffService for comparison
    const diff = this.diffService.compareSnapshots(headSnapshot, newSnapshot);
    return diff.areIdentical;
  }

  /**
   * Get snapshot from current draft of branch
   */
  private async getSnapshotFromDraft(branchId: string): Promise<DraftSnapshot> {
    interface DraftRow {
      id: string;
      branch_id: string;
      snapshot: DraftSnapshot;
      updated_at: string;
    }

    const { data: draft, error } = await this.supabase
      .from('drafts')
      .select('snapshot')
      .eq('branch_id', branchId)
      .single();

    if (error || !draft) {
      // Return empty snapshot if no draft exists
      return {
        schemaVersion: 1,
        meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
        tracks: [],
        notes: [],
      };
    }

    return (draft as DraftRow).snapshot;
  }

  /**
   * Normalize snapshot DTO to proper DraftSnapshot format
   */
  private normalizeSnapshot(dto: unknown): DraftSnapshot {
    const snapshot = dto as {
      schemaVersion?: number;
      meta?: { tempo: number; timeSignature: [number, number]; ppq: number };
      tracks?: DraftTrackDto[];
      notes?: DraftNoteDto[];
    };

    return {
      schemaVersion: snapshot.schemaVersion ?? 1,
      meta: snapshot.meta ?? { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: (snapshot.tracks ?? []).map((t) => ({
        id: t.id ?? uuidv4(),
        name: t.name,
        order: t.order ?? 0,
        color: t.color ?? '#6366f1',
        muted: t.isMuted ?? false,
        solo: t.isSolo ?? false,
        volume: t.volume ?? 1,
        pan: t.pan ?? 0,
        instrument: t.instrument ?? null,
      })),
      notes: (snapshot.notes ?? []).map((n) => ({
        id: n.id ?? uuidv4(),
        trackId: n.trackId,
        pitch: n.pitch,
        start: n.startTime ?? n.start ?? 0, // Support both field names
        duration: n.duration ?? 0,
        velocity: n.velocity ?? 80,
      })),
    };
  }

  /**
   * Inject UUID v4 for notes without id - ensures persistent note identity
   *
   * This is CRITICAL for version control: each note must have a stable UUID
   * that persists across edits for diff/merge to work correctly.
   */
  private injectNoteUuids(snapshot: DraftSnapshot): DraftSnapshot {
    return {
      ...snapshot,
      notes: snapshot.notes.map((note) => ({
        ...note,
        id: note.id || uuidv4(),
      })),
    };
  }

  /**
   * Get tags for multiple commits at once
   */
  private async getTagsForCommits(
    commitIds: string[],
  ): Promise<Map<string, TagRow[]>> {
    if (commitIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from('commit_tags')
      .select('id, commit_id, name, created_by, created_at')
      .in('commit_id', commitIds);

    if (error) {
      console.error('Failed to fetch tags:', error);
      return new Map();
    }

    const tagsMap = new Map<string, TagRow[]>();
    for (const tag of (data as TagRow[]) ?? []) {
      const tid = tag.commit_id;
      if (!tagsMap.has(tid)) {
        tagsMap.set(tid, []);
      }
      tagsMap.get(tid)!.push(tag);
    }

    return tagsMap;
  }

  /**
   * Get author info for multiple users at once
   */
  private async getAuthorsInfo(userIds: string[]): Promise<
    Map<
      string,
      {
        id: string;
        username: string | null;
        display_name: string | null;
        avatar_url: string | null;
      }
    >
  > {
    if (userIds.length === 0) {
      return new Map();
    }

    interface AuthorRow {
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    }

    const { data, error } = await this.supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds);

    if (error) {
      console.error('Failed to fetch authors:', error);
      return new Map();
    }

    const authorsMap = new Map<
      string,
      {
        id: string;
        username: string | null;
        display_name: string | null;
        avatar_url: string | null;
      }
    >();
    for (const user of (data as AuthorRow[]) ?? []) {
      authorsMap.set(user.id, {
        id: user.id,
        username: user.username ?? null,
        display_name: user.display_name ?? null,
        avatar_url: user.avatar_url ?? null,
      });
    }

    return authorsMap;
  }

  /**
   * Verify user owns the project (ownership check for security)
   */
  private async verifyProjectOwnership(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const { data: project } = await this.supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.owner_id !== userId) {
      throw new ForbiddenException('You do not have access to this project');
    }
  }
}
