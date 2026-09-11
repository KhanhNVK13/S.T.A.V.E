import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
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

/** Raw row from commits table */
interface CommitDbRow {
  id: string;
  branch_id: string;
  message: string;
  snapshot: DraftSnapshot;
  created_by: string;
  created_at: string;
}

/** Raw row from tags table */
interface TagDbRow {
  id: string;
  commit_id: string;
  name: string;
  color: string | null;
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
   * Transaction flow:
   * 1. Validate branch exists and user has access
   * 2. UC-42 Exception 6.E1: Check expectedHeadCommitId (concurrency protection)
   * 3. BR-40: Compare snapshot with head_commit (draft diff check)
   * 4. Get snapshot from draft or use provided snapshot
   * 5. Inject UUIDs for notes if missing
   * 6. INSERT into commits table
   * 7. UPDATE branches.head_commit_id
   *
   * IMPORTANT: Only SELECT and INSERT on commits table. No UPDATE/DELETE.
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

    // Step 5: Generate commit ID
    const commitId = uuidv4();

    // Step 6: INSERT commit record (SELECT + INSERT only, no UPDATE/DELETE)
    const { data: commit, error: commitError } = await this.supabase
      .from('commits')
      .insert({
        id: commitId,
        branch_id,
        message,
        snapshot,
        created_by: userId,
      })
      .select('*')
      .single<CommitDbRow>();

    if (commitError) {
      throw new InternalServerErrorException(
        `Failed to create commit: ${commitError.message}`,
      );
    }

    if (!commit) {
      throw new InternalServerErrorException('Commit was not created');
    }

    // Step 7: UPDATE branch head pointer (this is the only UPDATE allowed)
    const { error: branchError } = await this.supabase
      .from('branches')
      .update({ head_commit_id: commitId })
      .eq('id', branch_id);

    if (branchError) {
      console.error('Failed to update branch head:', branchError);
    }

    return {
      id: commit.id,
      branch_id: commit.branch_id,
      message: commit.message,
      snapshot: commit.snapshot,
      created_by: commit.created_by,
      created_at: commit.created_at,
    };
  }

  // ==========================================================================
  // UC-43: Get Commit History
  // ==========================================================================

  /**
   * Get paginated commit history with author info.
   *
   * Supports filtering by branch_id and includes:
   * - Author info (username, display_name, avatar_url)
   * - Tags associated with each commit
   */
  async getCommitHistory(
    dto: GetCommitHistoryDto,
  ): Promise<PaginatedCommitHistory> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    let query = this.supabase.from('commits').select('*', { count: 'exact' });

    // Filter by branch if specified
    if (dto.branch_id) {
      query = query.eq('branch_id', dto.branch_id);
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
    const authorIds = [...new Set(commits.map((c) => c.created_by))];
    const authorsMap = await this.getAuthorsInfo(authorIds);

    // Enrich commits with author info and tags
    const items: CommitWithAuthor[] = commits.map((commit) => ({
      id: commit.id,
      branch_id: commit.branch_id,
      message: commit.message,
      snapshot: commit.snapshot,
      created_by: commit.created_by,
      created_at: commit.created_at,
      author: authorsMap.get(commit.created_by) ?? {
        id: commit.created_by,
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
  async getCommitById(commitId: string): Promise<CommitWithAuthor> {
    // Fetch commit
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data: commitData, error: commitError } = await this.supabase
      .from('commits')
      .select('*')
      .eq('id', commitId)
      .single();

    if (commitError || !commitData) {
      throw new NotFoundException('Commit not found');
    }

    const commit = commitData as unknown as CommitDbRow;
    const tags = await this.getTagsForCommits([commitId]);

    // Fetch author info

    const { data: authorData } = await this.supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .eq('id', commit.created_by)
      .single();

    const author = authorData;

    const authorInfo = {
      id: author?.id ?? commit.created_by,
      username: author?.username ?? null,
      display_name: author?.display_name ?? null,
      avatar_url: author?.avatar_url ?? null,
    };

    return {
      id: commit.id,
      branch_id: commit.branch_id,
      message: commit.message,
      snapshot: commit.snapshot,
      created_by: commit.created_by,
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
   * BR-44 Rules:
   * - Tag name must be unique within the same project
   * - If tag exists on this commit, it will be replaced
   * - If tag exists on different commit in same project, throw ConflictException
   */
  async tagCommit(
    commitId: string,
    userId: string,
    dto: TagCommitDto,
  ): Promise<TagRow> {
    // Verify commit exists and get branch info
    const { data: existingCommit, error: commitError } = await this.supabase
      .from('commits')
      .select('id, branch_id')
      .eq('id', commitId)
      .single();

    if (commitError || !existingCommit) {
      throw new NotFoundException('Commit not found');
    }

    const branchId = (existingCommit as { branch_id: string }).branch_id;

    // BR-44: Check if tag name already exists in any commit of this project
    const isTagExistsInProject = await this.isTagNameExistsInProject(
      dto.tag,
      branchId,
      commitId,
    );

    if (isTagExistsInProject) {
      throw new ConflictException('Tag name already exists in this project');
    }

    const tagId = uuidv4();
    const color = dto.color ?? '#6366f1'; // Default indigo

    // Upsert tag: update if exists on same commit, insert if not
    const { data: tag, error: tagError } = await this.supabase
      .from('tags')
      .upsert(
        {
          id: tagId,
          commit_id: commitId,
          name: dto.tag,
          color,
          created_by: userId,
        },
        {
          onConflict: 'commit_id,name',
          ignoreDuplicates: false,
        },
      )
      .select('*')
      .single<TagDbRow>();

    if (tagError) {
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
      color: tag.color,
      created_by: tag.created_by,
      created_at: tag.created_at,
    };
  }

  /**
   * Get all tags for a specific commit
   */
  async getTagsForCommit(commitId: string): Promise<TagRow[]> {
    const { data, error } = await this.supabase
      .from('tags')
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
  async deleteTag(commitId: string, tagName: string): Promise<void> {
    const { error } = await this.supabase
      .from('tags')
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

    // Verify both commits belong to the same project (BR-46)
    const baseBranchId = (baseCommit as { branch_id: string }).branch_id;
    const targetBranchId = (targetCommit as { branch_id: string }).branch_id;

    const baseProjectId = await this.getProjectIdFromBranch(baseBranchId);
    const targetProjectId = await this.getProjectIdFromBranch(targetBranchId);

    if (baseProjectId !== targetProjectId) {
      throw new BadRequestException(
        'Cannot compare commits from different projects',
      );
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
   * BR-47: Restore never deletes history - creates a NEW commit
   * BR-41: Restoration never rewrites history
   *
   * Flow:
   * 1. Verify commit to restore exists
   * 2. Verify user has edit permission on target branch
   * 3. Check if commit is NOT already the head of the branch (PRE-3)
   * 4. Create new commit with snapshot from old commit
   * 5. Update branch head pointer
   * 6. Update draft to match restored state (POST-4)
   */
  async restoreCommit(
    commitId: string,
    userId: string,
    dto: RestoreCommitDto,
  ): Promise<CommitRow> {
    const { branch_id, message: customMessage } = dto;

    // Step 1: Get the commit to restore
    const { data: commitToRestore, error: commitError } = await this.supabase
      .from('commits')
      .select('*')
      .eq('id', commitId)
      .single();

    if (commitError || !commitToRestore) {
      throw new NotFoundException('Commit to restore not found');
    }

    const commit = commitToRestore as unknown as CommitDbRow;

    // Step 2: Verify user has access to the target branch
    const branch = await this.verifyBranchAccess(branch_id, userId);

    // Step 3: PRE-3 Check - Verify this commit is not already the head
    // If the commit being restored IS the current head, no need to restore
    if (branch.head_commit_id === commitId) {
      throw new BadRequestException(
        'Selected commit is already the most recent version on this branch',
      );
    }

    // Step 4: Generate message - use custom or default
    const restoreMessage =
      customMessage ?? `Revert to commit ${commitId.substring(0, 8)}`;

    // Step 5: Create new commit with the old snapshot
    const commitIdNew = uuidv4();

    // Upsert commit record
    const { data: newCommit, error: newCommitError } = await this.supabase
      .from('commits')
      .insert({
        id: commitIdNew,
        branch_id,
        message: restoreMessage,
        snapshot: commit.snapshot,
        created_by: userId,
      })
      .select('*')
      .single<CommitDbRow>();

    if (newCommitError) {
      throw new InternalServerErrorException(
        `Failed to create restore commit: ${newCommitError.message}`,
      );
    }

    if (!newCommit) {
      throw new InternalServerErrorException('Restore commit was not created');
    }

    // Step 6: UPDATE branch head pointer
    const { error: branchError } = await this.supabase
      .from('branches')
      .update({ head_commit_id: commitIdNew })
      .eq('id', branch_id);

    if (branchError) {
      console.error(
        'Failed to update branch head during restore:',
        branchError,
      );
    }

    // Step 7: POST-4 - Update draft to match restored state
    const { error: draftError } = await this.supabase.from('drafts').upsert({
      branch_id,
      snapshot: commit.snapshot,
      updated_at: new Date().toISOString(),
    });

    if (draftError) {
      console.error('Failed to update draft during restore:', draftError);
    }

    return {
      id: newCommit.id,
      branch_id: newCommit.branch_id,
      message: newCommit.message,
      snapshot: newCommit.snapshot,
      created_by: newCommit.created_by,
      created_at: newCommit.created_at,
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
        project:projects!inner(id, owner_id)
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
   * BR-44: Check if tag name already exists in any commit of this project
   * (excluding the current commit being tagged)
   */
  private async isTagNameExistsInProject(
    tagName: string,
    branchId: string,
    excludeCommitId: string,
  ): Promise<boolean> {
    // Get project_id from branch
    const { data: branch } = await this.supabase
      .from('branches')
      .select('project_id')
      .eq('id', branchId)
      .single();

    if (!branch) return false;

    const projectId = branch.project_id;

    // Get all commits in this project
    const { data: projectCommits } = await this.supabase
      .from('commits')
      .select('id')
      .in(
        'branch_id',
        (
          await this.supabase
            .from('branches')
            .select('id')
            .eq('project_id', projectId)
        ).data?.map((b: { id: string }) => b.id) ?? [],
      );

    if (!projectCommits || projectCommits.length === 0) return false;

    const commitIds = projectCommits
      .map((c: { id: string }) => c.id)
      .filter((id: string) => id !== excludeCommitId);

    if (commitIds.length === 0) return false;

    // Check if tag name exists on any of these commits
    const { data: existingTag } = await this.supabase
      .from('tags')
      .select('id')
      .in('commit_id', commitIds)
      .eq('name', tagName)
      .maybeSingle();

    return !!existingTag;
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
  ): Promise<Map<string, string[]>> {
    if (commitIds.length === 0) {
      return new Map();
    }

    interface TagRow {
      commit_id: string;
      name: string;
    }

    const { data, error } = await this.supabase
      .from('tags')
      .select('commit_id, name')
      .in('commit_id', commitIds);

    if (error) {
      console.error('Failed to fetch tags:', error);
      return new Map();
    }

    const tagsMap = new Map<string, string[]>();
    for (const tag of (data as TagRow[]) ?? []) {
      const tid = tag.commit_id;
      const name = tag.name;
      if (!tagsMap.has(tid)) {
        tagsMap.set(tid, []);
      }
      tagsMap.get(tid)!.push(name);
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
}
