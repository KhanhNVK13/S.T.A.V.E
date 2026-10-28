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
import {
  DRAFT_SCHEMA_VERSION,
  sanitizeSoundMap,
  type DraftSnapshot,
} from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { ProjectAccessService } from '../project-access/project-access.service';
import { ActiveBranchService } from '../active-branch/active-branch.service';
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
  user_id: string;
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
  /**
   * UC-48: branch này có phải branch editor đang mở không. Chỉ
   * `getProjectBranches` điền (nó là chỗ duy nhất đọc
   * `projects.active_branch_id`); các response trả về 1 branch lẻ để undefined.
   */
  is_active?: boolean;
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
  parent_commit_id: string | null;
  /** UC-50 bước 4: hiện tác giả như màn lịch sử chính (UC-43). */
  author: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  /** UC-50 bước 5: gắn tag/so sánh/khôi phục "exactly as in the main history view". */
  tags: Array<{ id: string; name: string }>;
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

const ID_FILTER_CHUNK = 100;
const HISTORY_PAGE = 1000;

/** Safety cap on commit-graph walks — see loadAncestry/findMergeBase. */
const MAX_CHAIN_HOPS = 20000;

interface CommitGraphNode {
  id: string;
  parents: string[];
  createdAt: string;
}

@Injectable()
export class BranchesService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient<any, 'public', any>,
    private readonly access: ProjectAccessService,
    private readonly activeBranch: ActiveBranchService,
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

    await this.initializeDraftForBranch(branchId, startCommitId, userId);
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

    const currentBranch = await this.getBranchById(dto.currentBranchId);
    if (!currentBranch || currentBranch.project_id !== projectId) {
      throw new NotFoundException('Branch not found');
    }

    // BR-50 / CLAUDE.md §4.2: save the outgoing branch's draft before
    // switching — currentDraft is now required in the DTO, and saveDraft
    // throws on failure instead of silently swallowing the error.
    await this.saveDraft(dto.currentBranchId, dto.currentDraft, userId);

    const activeSnapshot = await this.getActiveSnapshot(
      dto.targetBranchId,
      userId,
    );
    const author = await this.getAuthorInfo(targetBranch.created_by);

    // Track which branch is "active" for this project — needed by UC-52
    // (cannot delete the currently active branch). Every branch has a draft
    // row, so "has a draft" can't be used as a proxy for "is active".
    await this.activeBranch.setActiveBranch(
      projectId,
      userId,
      dto.targetBranchId,
    );

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
    await this.access.assertCanView(branch.project_id, userId);

    const defaultBranch = await this.getDefaultBranch(branch.project_id);
    if (!defaultBranch) {
      throw new NotFoundException('Default branch not found');
    }

    const divergence = await this.calculateDivergence(branch, defaultBranch);
    const isMerged =
      branch.id === defaultBranch.id ||
      (divergence.ahead === 0 && (await this.countOwnCommits(branch.id)) > 0);
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
   * vs inherited-from-default, decided by the commit graph (parent and merge
   * links) rather than `created_at` timestamps.
   */
  async getBranchHistory(
    branchId: string,
    userId: string,
  ): Promise<BranchHistory> {
    const branch = await this.getBranchById(branchId);
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    await this.access.assertCanView(branch.project_id, userId);

    const defaultBranch = await this.getDefaultBranch(branch.project_id);
    const isDefaultBranch = defaultBranch?.id === branch.id;

    // Tải MỘT lần toàn bộ commit của project rồi đi chuỗi cha trong bộ nhớ.
    const { data: projectBranches } = await this.supabase
      .from('branches')
      .select('id')
      .eq('project_id', branch.project_id);
    const branchIds = (projectBranches ?? []).map((b) => b.id as string);

    const rows: unknown[] = [];
    for (let offset = 0; ; offset += HISTORY_PAGE) {
      const { data: page, error } = await this.supabase
        .from('commits')
        .select(
          'id, branch_id, author_id, message, created_at, parent_commit_id, merged_from_commit_id',
        )
        .in('branch_id', branchIds)
        .order('id')
        .range(offset, offset + HISTORY_PAGE - 1);

      if (error) {
        throw new InternalServerErrorException(
          `Failed to fetch branch history: ${error.message}`,
        );
      }
      rows.push(...(page ?? []));
      if ((page ?? []).length < HISTORY_PAGE) break;
    }

    type HistoryRow = {
      id: string;
      branch_id: string;
      author_id: string;
      message: string;
      created_at: string;
      parent_commit_id: string | null;
      merged_from_commit_id: string | null;
    };
    const byId = new Map(((rows ?? []) as HistoryRow[]).map((c) => [c.id, c]));

    const walk = (startId: string | null): string[] => {
      const ids: string[] = [];
      let current = startId;
      while (current && byId.has(current) && ids.length < MAX_CHAIN_HOPS) {
        ids.push(current);
        current = byId.get(current)!.parent_commit_id;
      }
      return ids;
    };

    const chainIds = walk(branch.head_commit_id); // head -> root
    if (chainIds.length === 0) {
      return { branchId: branch.id, branchName: branch.name, commits: [] };
    }

    const defaultAncestors = new Set<string>();
    if (defaultBranch && !isDefaultBranch) {
      const queue: string[] = defaultBranch.head_commit_id
        ? [defaultBranch.head_commit_id]
        : [];
      while (queue.length > 0 && defaultAncestors.size < MAX_CHAIN_HOPS) {
        const id = queue.shift()!;
        if (defaultAncestors.has(id)) continue;
        defaultAncestors.add(id);
        const row = byId.get(id);
        if (row?.parent_commit_id) queue.push(row.parent_commit_id);
        if (row?.merged_from_commit_id) queue.push(row.merged_from_commit_id);
      }
    }

    const authorsMap = await this.getAuthorsInfo([
      ...new Set(chainIds.map((id) => byId.get(id)!.author_id)),
    ]);

    const tagRows: Array<{ id: string; commit_id: string; name: string }> = [];
    for (let i = 0; i < chainIds.length; i += ID_FILTER_CHUNK) {
      const { data: part, error: tagError } = await this.supabase
        .from('commit_tags')
        .select('id, commit_id, name')
        .in('commit_id', chainIds.slice(i, i + ID_FILTER_CHUNK));
      if (tagError) {
        throw new InternalServerErrorException(
          `Failed to fetch commit tags: ${tagError.message}`,
        );
      }
      tagRows.push(...((part ?? []) as typeof tagRows));
    }
    const tagsByCommit = new Map<string, Array<{ id: string; name: string }>>();
    for (const t of tagRows) {
      const list = tagsByCommit.get(t.commit_id) ?? [];
      list.push({ id: t.id, name: t.name });
      tagsByCommit.set(t.commit_id, list);
    }

    const commitHistory: CommitInHistory[] = [];
    for (const id of chainIds) {
      const c = byId.get(id)!;
      const inherited = isDefaultBranch || defaultAncestors.has(id);
      commitHistory.push({
        id: c.id,
        branch_id: c.branch_id,
        message: c.message,
        created_at: c.created_at,
        isUniqueToBranch: !inherited,
        isInherited: inherited,
        parent_commit_id: c.parent_commit_id,
        author: authorsMap.get(c.author_id) ?? {
          id: c.author_id,
          username: null,
          display_name: null,
          avatar_url: null,
        },
        tags: tagsByCommit.get(c.id) ?? [],
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

    const { lostIds } = await this.classifyOwnCommits(branch, false);

    return {
      branchId: branch.id,
      branchName: branch.name,
      isDefault: branch.is_default,
      unmergedCommitsCount: lostIds.length,
      unmergedCommitIds: lostIds,
    };
  }

  private async classifyOwnCommits(
    branch: BranchDbRow,
    rehomeOnly: boolean,
  ): Promise<{
    rehome: Array<{ branchId: string; ids: string[] }>;
    lostIds: string[];
  }> {
    const { data: otherBranches } = await this.supabase
      .from('branches')
      .select('id, head_commit_id')
      .eq('project_id', branch.project_id)
      .neq('id', branch.id);

    const heads = (otherBranches ?? []).filter(
      (other: { head_commit_id: string | null }) => !!other.head_commit_id,
    );
    if (heads.length === 0 && rehomeOnly) return { rehome: [], lostIds: [] };

    const ownIds: string[] = [];
    for (let offset = 0; ; offset += HISTORY_PAGE) {
      const { data: own, error } = await this.supabase
        .from('commits')
        .select('id')
        .eq('branch_id', branch.id)
        .order('id')
        .range(offset, offset + HISTORY_PAGE - 1);
      if (error) {
        throw new InternalServerErrorException(
          `Failed to compute delete preview: ${error.message}`,
        );
      }
      ownIds.push(...(own ?? []).map((c: { id: string }) => c.id));
      if ((own ?? []).length < HISTORY_PAGE) break;
    }
    const ownSet = new Set(ownIds);
    const claimed = new Set<string>();
    const rehome: Array<{ branchId: string; ids: string[] }> = [];

    const nodes = await this.loadAncestry(
      heads.map((other) => other.head_commit_id),
    );
    for (const other of heads) {
      if (ownSet.size === claimed.size) break;
      const reachable = this.reachable(nodes, other.head_commit_id);
      const shared = reachable.filter(
        (id) => ownSet.has(id) && !claimed.has(id),
      );
      if (shared.length === 0) continue;
      rehome.push({ branchId: other.id, ids: shared });
      for (const id of shared) claimed.add(id);
    }
    return { rehome, lostIds: ownIds.filter((id) => !claimed.has(id)) };
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
        'Cannot delete the branch currently open in the editor — switch to another branch first',
      );
    }

    const { data: openedByMembers, error: membersError } = await this.supabase
      .from('project_member_active_branches')
      .select('user_id')
      .eq('branch_id', branchId)
      .limit(1);
    if (membersError) {
      throw new InternalServerErrorException(
        `Failed to check who has the branch open: ${membersError.message}`,
      );
    }
    if ((openedByMembers ?? []).length > 0) {
      throw new ConflictException(
        'Branch is the working branch of a collaborator',
      );
    }

    // A fast-forward merge moves another branch's head_commit_id to point at
    // a commit whose `branch_id` is still THIS branch; re-home those commits
    // before the cascade so a branch head never ends up dangling.
    const { rehome } = await this.classifyOwnCommits(branch, true);
    for (const group of rehome) {
      for (let i = 0; i < group.ids.length; i += ID_FILTER_CHUNK) {
        const { error: reassignError } = await this.supabase
          .from('commits')
          .update({ branch_id: group.branchId })
          .in('id', group.ids.slice(i, i + ID_FILTER_CHUNK));
        if (reassignError) {
          throw new InternalServerErrorException(
            `Failed to re-home shared commits before deleting branch: ${reassignError.message}`,
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
    await this.access.assertCanView(projectId, userId);

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

    // UC-48: cho client biết branch nào đang mở trong editor. Chưa từng chuyển
    // nhánh thì branch đang mở là branch mặc định — cùng quy tắc với
    // `ProjectsService.getActiveBranchForUser`, sửa một bên phải sửa cả bên kia.
    const storedActiveId = await this.activeBranch.getActiveBranchId(
      projectId,
      userId,
    );
    const activeId =
      storedActiveId && (branches ?? []).some((b) => b.id === storedActiveId)
        ? storedActiveId
        : ((branches ?? []).find((b) => b.is_default)?.id ?? null);

    return (branches ?? []).map((branch) => ({
      id: branch.id,
      project_id: branch.project_id,
      name: branch.name,
      is_default: branch.is_default,
      created_by: branch.created_by,
      created_at: branch.created_at,
      base_commit_id: branch.base_commit_id,
      head_commit_id: branch.head_commit_id,
      is_active: branch.id === activeId,
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

  private verifyUserEditPermission(
    projectId: string,
    userId: string,
  ): Promise<void> {
    return this.access.assertCanEdit(projectId, userId);
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
    userId: string,
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
      user_id: userId,
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
    userId: string,
  ): Promise<void> {
    const snapshot = this.normalizeSnapshot(draftDto);

    const { error } = await this.supabase.from('drafts').upsert(
      {
        branch_id: branchId,
        user_id: userId,
        snapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'branch_id,user_id' },
    );

    if (error) {
      throw new InternalServerErrorException(
        `Failed to save draft before switching branch: ${error.message}`,
      );
    }
  }

  private async getActiveSnapshot(
    branchId: string,
    userId: string,
  ): Promise<DraftSnapshot> {
    const { data: draft } = await this.supabase
      .from('drafts')
      .select('snapshot')
      .eq('branch_id', branchId)
      .eq('user_id', userId)
      .maybeSingle();

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

  private async loadAncestry(
    heads: Array<string | null>,
  ): Promise<Map<string, CommitGraphNode>> {
    const nodes = new Map<string, CommitGraphNode>();
    const unique = [...new Set(heads.filter((id): id is string => !!id))];
    if (unique.length === 0) return nodes;

    const { data, error } = await this.supabase.rpc('commit_ancestry', {
      p_heads: unique,
      p_limit: MAX_CHAIN_HOPS + 1,
    });
    if (error) {
      throw new InternalServerErrorException(
        `Failed to read commit history: ${error.message}`,
      );
    }

    const rows = (data ?? []) as Array<{
      id: string;
      parent_commit_id: string | null;
      merged_from_commit_id: string | null;
      created_at: string;
    }>;
    if (rows.length > MAX_CHAIN_HOPS) {
      throw new InternalServerErrorException(
        'Commit history is too large to analyse',
      );
    }
    for (const row of rows) {
      const parents = [row.parent_commit_id, row.merged_from_commit_id].filter(
        (id): id is string => !!id,
      );
      nodes.set(row.id, { id: row.id, parents, createdAt: row.created_at });
    }
    const referenced = [
      ...unique,
      ...rows.flatMap((row) => [
        row.parent_commit_id,
        row.merged_from_commit_id,
      ]),
    ];
    for (const id of referenced) {
      if (id && !nodes.has(id))
        nodes.set(id, { id, parents: [], createdAt: '' });
    }
    return nodes;
  }

  private reachable(
    nodes: Map<string, CommitGraphNode>,
    startId: string | null,
  ): string[] {
    if (!startId) return [];
    const order: string[] = [];
    const seen = new Set<string>();
    const queue = [startId];
    while (queue.length > 0 && order.length < MAX_CHAIN_HOPS) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
      for (const parent of nodes.get(id)?.parents ?? []) queue.push(parent);
    }
    return order;
  }

  /**
   * Every commit reachable from `startId` through both `parent_commit_id` and
   * `merged_from_commit_id`, head first.
   */
  async getAncestorIds(startId: string | null): Promise<string[]> {
    if (!startId) return [];
    const nodes = await this.loadAncestry([startId]);
    return this.reachable(nodes, startId);
  }

  /**
   * Nearest common ancestor of two branch heads in the commit graph: the
   * newest common ancestor that is not itself an ancestor of another common
   * ancestor. Returns null if the two heads share no ancestor (SRS UC-51
   * exception 2.E1).
   */
  async findMergeBase(
    headA: string | null,
    headB: string | null,
  ): Promise<string | null> {
    if (!headA || !headB) return null;
    if (headA === headB) return headA;

    const nodes = await this.loadAncestry([headA, headB]);
    const ancestorsB = new Set(this.reachable(nodes, headB));
    const common = this.reachable(nodes, headA).filter((id) =>
      ancestorsB.has(id),
    );
    if (common.length === 0) return null;

    const commonSet = new Set(common);
    const dominated = new Set<string>();
    const queue = common.flatMap((id) => nodes.get(id)?.parents ?? []);
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (dominated.has(id)) continue;
      dominated.add(id);
      for (const parent of nodes.get(id)?.parents ?? []) queue.push(parent);
    }
    const candidates = common.filter(
      (id) => commonSet.has(id) && !dominated.has(id),
    );
    candidates.sort((x, y) =>
      (nodes.get(y)?.createdAt ?? '').localeCompare(
        nodes.get(x)?.createdAt ?? '',
      ),
    );
    return candidates[0] ?? null;
  }

  private async countOwnCommits(branchId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('commits')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId);
    if (error) {
      throw new InternalServerErrorException(
        `Failed to read branch commits: ${error.message}`,
      );
    }
    return count ?? 0;
  }

  private async calculateDivergence(
    branch: BranchDbRow,
    defaultBranch: BranchDbRow,
  ): Promise<BranchDivergence> {
    if (branch.id === defaultBranch.id) {
      return { ahead: 0, behind: 0 };
    }

    const nodes = await this.loadAncestry([
      branch.head_commit_id,
      defaultBranch.head_commit_id,
    ]);
    const onBranch = new Set(this.reachable(nodes, branch.head_commit_id));
    const onDefault = new Set(
      this.reachable(nodes, defaultBranch.head_commit_id),
    );

    let ahead = 0;
    for (const id of onBranch) if (!onDefault.has(id)) ahead++;
    let behind = 0;
    for (const id of onDefault) if (!onBranch.has(id)) behind++;
    return { ahead, behind };
  }

  private async getAuthorInfo(userId: string | null): Promise<{
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  }> {
    if (!userId) {
      return { id: '', username: null, display_name: null, avatar_url: null };
    }
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
    userIds = userIds.filter((id) => !!id);
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
      schemaVersion: dto.schemaVersion ?? DRAFT_SCHEMA_VERSION,
      meta: dto.meta ?? { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: (dto.tracks ?? []).map((t) => ({
        id: t.id ?? uuidv4(),
        name: t.name,
        order: t.order ?? 0,
        color: t.color ?? '#6366f1',
        muted: t.muted ?? t.isMuted ?? false,
        solo: t.solo ?? t.isSolo ?? false,
        volume: t.volume ?? 1,
        pan: t.pan ?? 0,
        instrument: t.instrument ?? null,
        soundMap: sanitizeSoundMap(t.soundMap),
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
      schemaVersion: DRAFT_SCHEMA_VERSION,
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: [],
      notes: [],
    };
  }
}
