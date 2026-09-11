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

    if (dto.currentDraft) {
      await this.saveDraft(dto.currentBranchId, dto.currentDraft);
    }

    const activeSnapshot = await this.getActiveSnapshot(dto.targetBranchId);
    const author = await this.getAuthorInfo(targetBranch.created_by);

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

  async getBranchDetails(branchId: string): Promise<BranchDetails> {
    const branch = await this.getBranchById(branchId);
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

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

  async getBranchHistory(branchId: string): Promise<BranchHistory> {
    const branch = await this.getBranchById(branchId);
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const { data: commits, error } = await this.supabase
      .from('commits')
      .select('id, branch_id, message, created_at, created_by')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch branch history: ${error.message}`,
      );
    }

    const baseCommitId = branch.base_commit_id;
    const baseDate = baseCommitId
      ? await this.getCommitCreatedAt(baseCommitId)
      : null;
    const baseDateObj = baseDate ? new Date(baseDate) : null;

    const commitHistory: CommitInHistory[] = (commits ?? []).map((c) => {
      const commitDate = new Date(c.created_at);
      const isUniqueToBranch = baseDateObj
        ? c.id !== baseCommitId && commitDate > baseDateObj
        : true;

      return {
        id: c.id,
        branch_id: c.branch_id,
        message: c.message,
        created_at: c.created_at,
        isUniqueToBranch,
        isInherited:
          !isUniqueToBranch || (baseCommitId !== null && c.id === baseCommitId),
      };
    });

    return {
      branchId: branch.id,
      branchName: branch.name,
      commits: commitHistory,
    };
  }

  // ==========================================================================
  // Additional Methods
  // ==========================================================================

  async getProjectBranches(projectId: string): Promise<BranchWithAuthor[]> {
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
      console.error('Failed to initialize draft for branch:', error);
    }
  }

  private async saveDraft(
    branchId: string,
    draftDto: DraftSnapshotDto,
  ): Promise<void> {
    const snapshot = this.normalizeSnapshot(draftDto);

    await this.supabase.from('drafts').upsert({
      branch_id: branchId,
      snapshot,
      updated_at: new Date().toISOString(),
    });
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

  private async calculateDivergence(
    branch: BranchDbRow,
    defaultBranch: BranchDbRow,
  ): Promise<BranchDivergence> {
    let ahead = 0;
    if (branch.base_commit_id && branch.head_commit_id) {
      const baseDate = await this.getCommitCreatedAt(branch.base_commit_id);
      if (baseDate) {
        const { data: commits } = await this.supabase
          .from('commits')
          .select('id, created_at')
          .eq('branch_id', branch.id)
          .gt('created_at', baseDate);

        ahead = (commits ?? []).length;
      }
    }

    let behind = 0;
    if (branch.base_commit_id && defaultBranch.head_commit_id) {
      const baseDate = await this.getCommitCreatedAt(branch.base_commit_id);
      if (baseDate) {
        const { data: defaultCommits } = await this.supabase
          .from('commits')
          .select('id, created_at')
          .eq('branch_id', defaultBranch.id)
          .gt('created_at', baseDate);

        behind = (defaultCommits ?? []).length;
      }
    }

    return { ahead, behind };
  }

  private async getCommitCreatedAt(commitId: string): Promise<string | null> {
    const { data: commit } = await this.supabase
      .from('commits')
      .select('created_at')
      .eq('id', commitId)
      .single();

    return commit?.created_at ?? null;
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
