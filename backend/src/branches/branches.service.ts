import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftSnapshot } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { CreateBranchDto } from './dto/create-branch.dto';
import { SwitchBranchDto, DraftSnapshotDto } from './dto/switch-branch.dto';

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

/** Raw row from drafts table */
interface DraftDbRow {
  id: string;
  branch_id: string;
  snapshot: DraftSnapshot;
  updated_at: string;
}

/** Branch info with author */
export interface BranchWithAuthor {
  id: string;
  project_id: string;
  name: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
  base_commit_id: string | null;
  head_commit_id: string | null;
  author: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

/** Divergence info between branches */
export interface BranchDivergence {
  ahead: number;
  behind: number;
}

/** Full branch response with divergence */
export interface BranchDetails {
  branchInfo: BranchWithAuthor;
  divergence: BranchDivergence;
  isMerged: boolean;
}

/** Commit in branch history */
export interface CommitInHistory {
  id: string;
  branch_id: string;
  message: string;
  created_at: string;
  isUniqueToBranch: boolean;
  isInherited: boolean;
}

/** Branch history response */
export interface BranchHistory {
  branchId: string;
  branchName: string;
  commits: CommitInHistory[];
}

/** Switch branch response */
export interface SwitchBranchResponse {
  branch: BranchWithAuthor;
  activeSnapshot: DraftSnapshot;
}

/** Safety cap on parent_commit_id chain walks — see getAncestorIds/findMergeBase. */
const MAX_CHAIN_HOPS = 2000;

@Injectable()
export class BranchesService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient<any, 'public', any>,
  ) {}

  // ==========================================================================
  // UC-47: Create Branch
  // ==========================================================================

  async createBranch(
    projectId: string,
    dto: CreateBranchDto,
    userId: string,
  ): Promise<BranchWithAuthor> {
    await this.verifyUserEditPermission(projectId, userId);

    const hasCommits = await this.projectHasCommits(projectId);
    if (!hasCommits) {
      throw new BadRequestException(
        'Project has no commits yet. Branching is unavailable.',
      );
    }

    const isNameTaken = await this.isBranchNameTaken(projectId, dto.name);
    if (isNameTaken) {
      throw new BadRequestException(
        'A branch with this name already exists in the project',
      );
    }

    if (dto.name.toLowerCase() === 'main') {
      throw new BadRequestException('Cannot create a branch named "main"');
    }

    const startCommitId = await this.determineStartCommit(
      projectId,
      dto.sourceBranchId,
      dto.startCommitId,
    );

    const branchId = uuidv4();

    const { data: branch, error } = await this.supabase
      .from('branches')
      .insert({
        id: branchId,
        project_id: projectId,
        name: dto.name,
        head_commit_id: startCommitId,
        base_commit_id: startCommitId,
        is_default: false,
        created_by: userId,
      })
      .select('*')
      .single<BranchDbRow>();

    if (error) {
      // Race with another concurrent create using the same name — the real
      // DB has UNIQUE(project_id, name), so this is a genuine second line of
      // defense on top of the isBranchNameTaken check above (TOCTOU-safe).
      if ((error as { code?: string }).code === '23505') {
        throw new BadRequestException(
          'A branch with this name already exists in the project',
        );
      }
      throw new InternalServerErrorException(
        `Failed to create branch: ${error.message}`,
      );
    }

    if (!branch) {
      throw new InternalServerErrorException('Branch was not created');
    }

    await this.initializeDraftForBranch(branchId, startCommitId);
    const author = await this.getAuthorInfo(userId);

    return {
      id: branch.id,
      project_id: branch.project_id,
      name: branch.name,
      is_default: branch.is_default,
      created_by: branch.created_by,
      created_at: branch.created_at,
      base_commit_id: branch.base_commit_id,
      head_commit_id: branch.head_commit_id,
      author,
    };
  }

  // ==========================================================================
  // UC-48: Switch Active Branch
  // ==========================================================================

  async switchBranch(
    projectId: string,
    dto: SwitchBranchDto,
    userId: string,
  ): Promise<SwitchBranchResponse> {
    await this.verifyUserEditPermission(projectId, userId);

    const branchCount = await this.getProjectBranchCount(projectId);
    if (branchCount <= 1) {
      throw new BadRequestException('Project has only one branch');
    }

    const targetBranch = await this.getBranchById(dto.targetBranchId);
    if (!targetBranch) {
      throw new NotFoundException('Target branch does not exist');
    }

    if (targetBranch.project_id !== projectId) {
      throw new NotFoundException('Target branch does not exist');
    }

    // BR-50 / CLAUDE.md §4.2: save the outgoing branch's draft before
    // switching — currentDraft is now required in the DTO, and saveDraft
    // throws on failure instead of silently swallowing the error.
    await this.saveDraft(dto.currentBranchId, dto.currentDraft);

    const activeSnapshot = await this.getActiveSnapshot(dto.targetBranchId);
    const author = await this.getAuthorInfo(targetBranch.created_by);

    // Track which branch is "active" for this project — needed by UC-52
    // (cannot delete the currently active branch). Every branch has a draft
    // row, so "has a draft" can't be used as a proxy for "is active".
    const { error: activeError } = await this.supabase
      .from('projects')
      .update({ active_branch_id: dto.targetBranchId })
      .eq('id', projectId);
    if (activeError) {
      throw new InternalServerErrorException(
        `Failed to record active branch: ${activeError.message}`,
      );
    }

    return {
      branch: {
        id: targetBranch.id,
        project_id: targetBranch.project_id,
        name: targetBranch.name,
        is_default: targetBranch.is_default,
        created_by: targetBranch.created_by,
        created_at: targetBranch.created_at,
        base_commit_id: targetBranch.base_commit_id,
        head_commit_id: targetBranch.head_commit_id,
        author,
      },
      activeSnapshot,
    };
  }

  // ==========================================================================
  // UC-49: View Branch Details & Divergence
  // ==========================================================================

  async getBranchDetails(
    branchId: string,
    userId: string,
  ): Promise<BranchDetails> {
    const branch = await this.getBranchById(branchId);
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    await this.verifyUserEditPermission(branch.project_id, userId);

    const defaultBranch = await this.getDefaultBranch(branch.project_id);
    if (!defaultBranch) {
      throw new NotFoundException('Default branch not found');
    }

    const divergence = await this.calculateDivergence(branch, defaultBranch);
    const isMerged = divergence.ahead === 0 && divergence.behind === 0;
    const author = await this.getAuthorInfo(branch.created_by);

    return {
      branchInfo: {
        id: branch.id,
        project_id: branch.project_id,
        name: branch.name,
        is_default: branch.is_default,
        created_by: branch.created_by,
        created_at: branch.created_at,
        base_commit_id: branch.base_commit_id,
        head_commit_id: branch.head_commit_id,
        author,
      },
      divergence,
      isMerged,
    };
  }

  // ==========================================================================
  // UC-50: View Branch History
  // ==========================================================================

  /**
   * Commit history for a branch, with each commit marked unique-to-this-branch
   * vs inherited-from-default. Walks the real `parent_commit_id` chain to find
   * the merge-base against the project's default branch, instead of comparing
   * `created_at` timestamps (fragile under clock skew/concurrent commits).
   */
  async getBranchHistory(
    branchId: string,
    userId: string,
  ): Promise<BranchHistory> {
    const branch = await this.getBranchById(branchId);
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    await this.verifyUserEditPermission(branch.project_id, userId);

    const chainIds = await this.getAncestorIds(branch.head_commit_id); // head -> root
    if (chainIds.length === 0) {
      return { branchId: branch.id, branchName: branch.name, commits: [] };
    }

    const { data: commits, error } = await this.supabase
      .from('commits')
      .select('id, branch_id, message, created_at')
      .in('id', chainIds);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch branch history: ${error.message}`,
      );
    }

    const defaultBranch = await this.getDefaultBranch(branch.project_id);
    const mergeBase =
      defaultBranch && defaultBranch.id !== branch.id
        ? await this.findMergeBase(
            branch.head_commit_id,
            defaultBranch.head_commit_id,
          )
        : null;
    const isDefaultBranch = defaultBranch?.id === branch.id;

    const byId = new Map((commits ?? []).map((c) => [c.id as string, c]));

    // chainIds is head-first; walk it to know, for each commit, whether we've
    // passed the merge-base yet (everything before it is unique to this
    // branch, everything from it onward is shared/inherited history).
    let pastMergeBase = isDefaultBranch; // mainline has no "unique vs shared" split
    const commitHistory: CommitInHistory[] = [];
    for (const id of chainIds) {
      const c = byId.get(id);
      if (!c) continue;
      if (mergeBase && id === mergeBase) pastMergeBase = true;
      commitHistory.push({
        id: c.id,
        branch_id: c.branch_id,
        message: c.message,
        created_at: c.created_at,
        isUniqueToBranch: !pastMergeBase,
        isInherited: pastMergeBase,
      });
    }
    commitHistory.reverse(); // oldest first, matching the original API shape

    return {
      branchId: branch.id,
      branchName: branch.name,
      commits: commitHistory,
    };
  }

  // ==========================================================================
  // UC-52: Delete Branch
  // ==========================================================================

  /** BR-55: preview of what deleting a branch would orphan. */
  async getDeletePreview(
    branchId: string,
    userId: string,
  ): Promise<{
    branchId: string;
    branchName: string;
    isDefault: boolean;
    unmergedCommitsCount: number;
    unmergedCommitIds: string[];
  }> {
    const branch = await this.getBranchById(branchId);
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    await this.verifyUserEditPermission(branch.project_id, userId);

    const { data: commits, error } = await this.supabase
      .from('commits')
      .select('id')
      .eq('branch_id', branchId);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to compute delete preview: ${error.message}`,
      );
    }

    const unmergedCommitIds = (commits ?? []).map((c) => c.id);

    return {
      branchId: branch.id,
      branchName: branch.name,
      isDefault: branch.is_default,
      unmergedCommitsCount: unmergedCommitIds.length,
      unmergedCommitIds,
    };
  }

  /**
   * Delete a non-default, non-active branch. Per SRS: commits already merged
   * into another branch remain reachable there (POST-2); commits that only
   * ever existed on this branch are permanently lost (POST-3) — `commits.branch_id`
   * has `ON DELETE CASCADE` from `branches`, so deleting the branch row deletes
   * those commits too.
   */
  async deleteBranch(branchId: string, userId: string): Promise<void> {
    const branch = await this.getBranchById(branchId);
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    await this.verifyUserEditPermission(branch.project_id, userId);

    if (branch.is_default) {
      throw new BadRequestException('Cannot delete the default branch');
    }

    const { data: project } = await this.supabase
      .from('projects')
      .select('active_branch_id')
      .eq('id', branch.project_id)
      .single();

    if (project?.active_branch_id === branchId) {
      throw new BadRequestException(
        'Cannot delete the currently active branch',
      );
    }

    // A fast-forward merge moves another branch's head_commit_id to point at
    // a commit whose `branch_id` is still THIS branch (a commit's branch_id
    // never changes once created). The cascade-delete below would then try
    // to delete that still-referenced commit and hit `branches_head_commit_id_fkey`
    // (no ON DELETE action — by design, a branch's head must never silently
    // go null). Re-home any such commit onto the branch that actually needs
    // it before deleting — this is exactly what POST-2 ("commits already
    // merged into another branch remain reachable") requires; branch_id is
    // bookkeeping, not "musical content or message" (BR-41), so this doesn't
    // touch commit immutability.
    const { data: otherBranches } = await this.supabase
      .from('branches')
      .select('id, head_commit_id')
      .eq('project_id', branch.project_id)
      .neq('id', branchId);

    for (const other of otherBranches ?? []) {
      if (!other.head_commit_id) continue;
      const { data: headCommit } = await this.supabase
        .from('commits')
        .select('id, branch_id')
        .eq('id', other.head_commit_id)
        .single();
      if (headCommit?.branch_id === branchId) {
        const { error: reassignError } = await this.supabase
          .from('commits')
          .update({ branch_id: other.id })
          .eq('id', headCommit.id);
        if (reassignError) {
          throw new InternalServerErrorException(
            `Failed to re-home shared commit before deleting branch: ${reassignError.message}`,
          );
        }
      }
    }

    const { error } = await this.supabase
      .from('branches')
      .delete()
      .eq('id', branchId);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to delete branch: ${error.message}`,
      );
    }
  }

  // ==========================================================================
  // Additional Methods
  // ==========================================================================

  async getProjectBranches(
    projectId: string,
    userId: string,
  ): Promise<BranchWithAuthor[]> {
    await this.verifyUserEditPermission(projectId, userId);

    const { data: branches, error } = await this.supabase
      .from('branches')
      .select('*')
      .eq('project_id', projectId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch branches: ${error.message}`,
      );
    }

    const authorIds = [...new Set((branches ?? []).map((b) => b.created_by))];
    const authorsMap = await this.getAuthorsInfo(authorIds);

    return (branches ?? []).map((branch) => ({
      id: branch.id,
      project_id: branch.project_id,
      name: branch.name,
      is_default: branch.is_default,
      created_by: branch.created_by,
      created_at: branch.created_at,
      base_commit_id: branch.base_commit_id,
      head_commit_id: branch.head_commit_id,
      author: authorsMap.get(branch.created_by) ?? {
        id: branch.created_by,
        username: null,
        display_name: null,
        avatar_url: null,
      },
    }));
  }

  // ==========================================================================
  // Public Helper Methods
  // ==========================================================================

  async getBranchById(branchId: string): Promise<BranchDbRow | null> {
    const { data } = await this.supabase
      .from('branches')
      .select('*')
      .eq('id', branchId)
      .single();

    return data as BranchDbRow | null;
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private async verifyUserEditPermission(
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
      throw new ForbiddenException(
        'You do not have edit permission on this project',
      );
    }
  }

  private async projectHasCommits(projectId: string): Promise<boolean> {
    const { data: branches } = await this.supabase
      .from('branches')
      .select('id')
      .eq('project_id', projectId);

    if (!branches || branches.length === 0) {
      return false;
    }

    const branchIds = branches.map((b) => b.id);
    const { data: commits } = await this.supabase
      .from('commits')
      .select('id')
      .in('branch_id', branchIds)
      .limit(1);

    return (commits ?? []).length > 0;
  }

  private async isBranchNameTaken(
    projectId: string,
    name: string,
  ): Promise<boolean> {
    const { data: existing } = await this.supabase
      .from('branches')
      .select('id')
      .eq('project_id', projectId)
      .eq('name', name)
      .maybeSingle();

    return !!existing;
  }

  private async determineStartCommit(
    projectId: string,
    sourceBranchId?: string,
    startCommitId?: string,
  ): Promise<string | null> {
    if (startCommitId) {
      const { data: commit } = await this.supabase
        .from('commits')
        .select('id, branch_id')
        .eq('id', startCommitId)
        .single();

      if (!commit) {
        throw new NotFoundException('Starting commit not found');
      }

      const { data: commitBranch } = await this.supabase
        .from('branches')
        .select('project_id')
        .eq('id', (commit as { branch_id: string }).branch_id)
        .single();

      if (!commitBranch || commitBranch.project_id !== projectId) {
        throw new NotFoundException('Starting commit not found');
      }

      return startCommitId;
    }

    if (sourceBranchId) {
      const { data: branch } = await this.supabase
        .from('branches')
        .select('head_commit_id')
        .eq('id', sourceBranchId)
        .eq('project_id', projectId)
        .single();

      return branch?.head_commit_id ?? null;
    }

    const defaultBranch = await this.getDefaultBranch(projectId);
    return defaultBranch?.head_commit_id ?? null;
  }

  private async initializeDraftForBranch(
    branchId: string,
    startCommitId: string | null,
  ): Promise<void> {
    let snapshot: DraftSnapshot;

    if (startCommitId) {
      const { data: commit } = await this.supabase
        .from('commits')
        .select('snapshot')
        .eq('id', startCommitId)
        .single();

      snapshot = commit?.snapshot ?? this.getEmptySnapshot();
    } else {
      snapshot = this.getEmptySnapshot();
    }

    const { error } = await this.supabase.from('drafts').insert({
      id: uuidv4(),
      branch_id: branchId,
      snapshot,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to initialize draft for new branch: ${error.message}`,
      );
    }
  }

  /**
   * Save (or create) the draft for a branch. Throws on failure instead of
   * swallowing the error — a silent failure here means "switch branch"
   * silently drops the user's unsaved edits, violating CLAUDE.md §4.2.
   */
  private async saveDraft(
    branchId: string,
    draftDto: DraftSnapshotDto,
  ): Promise<void> {
    const snapshot = this.normalizeSnapshot(draftDto);

    const { error } = await this.supabase.from('drafts').upsert(
      {
        branch_id: branchId,
        snapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'branch_id' },
    );

    if (error) {
      throw new InternalServerErrorException(
        `Failed to save draft before switching branch: ${error.message}`,
      );
    }
  }

  private async getActiveSnapshot(branchId: string): Promise<DraftSnapshot> {
    const { data: draft } = await this.supabase
      .from('drafts')
      .select('snapshot')
      .eq('branch_id', branchId)
      .single();

    if (draft) {
      return (draft as DraftDbRow).snapshot;
    }

    const { data: branch } = await this.supabase
      .from('branches')
      .select('head_commit_id')
      .eq('id', branchId)
      .single();

    if (!branch?.head_commit_id) {
      return this.getEmptySnapshot();
    }

    const { data: commit } = await this.supabase
      .from('commits')
      .select('snapshot')
      .eq('id', branch.head_commit_id)
      .single();

    return commit?.snapshot ?? this.getEmptySnapshot();
  }

  private async getDefaultBranch(
    projectId: string,
  ): Promise<BranchDbRow | null> {
    const { data: branch } = await this.supabase
      .from('branches')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_default', true)
      .single();

    return branch as BranchDbRow | null;
  }

  private async getProjectBranchCount(projectId: string): Promise<number> {
    const { count } = await this.supabase
      .from('branches')
      .select('id', { count: 'exact' })
      .eq('project_id', projectId);

    return count ?? 0;
  }

  /**
   * Walk the `parent_commit_id` chain starting at `startId` (inclusive),
   * collecting ancestor ids head-first until a commit with no parent is
   * reached. The chain can cross branch_id boundaries (a branch's earliest
   * own commit has parent_commit_id pointing at the commit it forked from,
   * which belongs to a different branch_id) — that's what makes this a real
   * shared commit graph instead of per-branch-isolated history.
   */
  async getAncestorIds(startId: string | null): Promise<string[]> {
    const ids: string[] = [];
    let current = startId;
    let hops = 0;
    while (current && hops < MAX_CHAIN_HOPS) {
      ids.push(current);
      const { data } = await this.supabase
        .from('commits')
        .select('parent_commit_id')
        .eq('id', current)
        .single();
      current = data?.parent_commit_id ?? null;
      hops++;
    }
    return ids;
  }

  /**
   * Nearest common ancestor of two branch heads — the real merge-base,
   * computed by walking both parent chains, instead of relying on the
   * static `branches.base_commit_id` snapshot taken once at branch-creation
   * time (which goes stale after either branch has since merged elsewhere).
   * Returns null if the two heads share no ancestor (SRS UC-51 exception 2.E1).
   */
  async findMergeBase(
    headA: string | null,
    headB: string | null,
  ): Promise<string | null> {
    if (!headA || !headB) return null;
    if (headA === headB) return headA;

    const ancestorsA = new Set(await this.getAncestorIds(headA));

    let current: string | null = headB;
    let hops = 0;
    while (current && hops < MAX_CHAIN_HOPS) {
      if (ancestorsA.has(current)) return current;
      const { data } = await this.supabase
        .from('commits')
        .select('parent_commit_id')
        .eq('id', current)
        .single();
      current =
        (data as { parent_commit_id: string | null } | null)
          ?.parent_commit_id ?? null;
      hops++;
    }
    return null;
  }

  /** Number of commits strictly between `headId` and `stopId` (exclusive of stopId), walking parent_commit_id. */
  private async countCommitsUntil(
    headId: string | null,
    stopId: string | null,
  ): Promise<number> {
    let count = 0;
    let current = headId;
    let hops = 0;
    while (current && current !== stopId && hops < MAX_CHAIN_HOPS) {
      count++;
      const { data } = await this.supabase
        .from('commits')
        .select('parent_commit_id')
        .eq('id', current)
        .single();
      current = data?.parent_commit_id ?? null;
      hops++;
    }
    return count;
  }

  private async calculateDivergence(
    branch: BranchDbRow,
    defaultBranch: BranchDbRow,
  ): Promise<BranchDivergence> {
    if (branch.id === defaultBranch.id) {
      return { ahead: 0, behind: 0 };
    }

    const mergeBase = await this.findMergeBase(
      branch.head_commit_id,
      defaultBranch.head_commit_id,
    );

    const ahead = await this.countCommitsUntil(
      branch.head_commit_id,
      mergeBase,
    );
    const behind = await this.countCommitsUntil(
      defaultBranch.head_commit_id,
      mergeBase,
    );

    return { ahead, behind };
  }

  private async getAuthorInfo(userId: string): Promise<{
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  }> {
    const { data: user } = await this.supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .eq('id', userId)
      .single();

    return {
      id: user?.id ?? userId,
      username: user?.username ?? null,
      display_name: user?.display_name ?? null,
      avatar_url: user?.avatar_url ?? null,
    };
  }

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

    const { data: users } = await this.supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds);

    const map = new Map<
      string,
      {
        id: string;
        username: string | null;
        display_name: string | null;
        avatar_url: string | null;
      }
    >();
    for (const user of users ?? []) {
      map.set(user.id, {
        id: user.id,
        username: user.username ?? null,
        display_name: user.display_name ?? null,
        avatar_url: user.avatar_url ?? null,
      });
    }

    return map;
  }

  private normalizeSnapshot(dto: DraftSnapshotDto): DraftSnapshot {
    return {
      schemaVersion: dto.schemaVersion ?? 1,
      meta: dto.meta ?? { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: (dto.tracks ?? []).map((t) => ({
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
      notes: (dto.notes ?? []).map((n) => ({
        id: n.id ?? uuidv4(),
        trackId: n.trackId,
        pitch: n.pitch,
        start: n.startTime ?? n.start ?? 0,
        duration: n.duration ?? 0,
        velocity: n.velocity ?? 80,
      })),
    };
  }

  private getEmptySnapshot(): DraftSnapshot {
    return {
      schemaVersion: 1,
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: [],
      notes: [],
    };
  }
}
