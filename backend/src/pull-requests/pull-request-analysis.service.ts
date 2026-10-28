import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftSnapshot } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { BranchesService } from '../branches/branches.service';
import { DiffService, type SnapshotDiff } from '../commits/diff.service';
import { MergeService } from '../merge/merge.service';

const MAX_CHAIN = 2000;

interface BranchInfo {
  id: string;
  project_id: string;
  name: string;
  head_commit_id: string | null;
}

interface CommitRow {
  id: string;
  branch_id: string;
  author_id: string | null;
  message: string;
  created_at: string;
  parent_commit_id: string | null;
}

export interface PullRequestCommit {
  id: string;
  message: string;
  authorId: string | null;
  createdAt: string;
}

export interface PullRequestAnalysis {
  sourceBranch: BranchInfo;
  targetBranch: BranchInfo;
  baseCommitId: string;
  newCommits: PullRequestCommit[];
  summary: SnapshotDiff;
  targetChanges: SnapshotDiff;
  conflictsCount: number;
  conflictsByBar: ReturnType<MergeService['previewMerge']>['conflictsByBar'];
  baseSnapshot: DraftSnapshot | null;
  sourceSnapshot: DraftSnapshot | null;
  targetSnapshot: DraftSnapshot | null;
}

@Injectable()
export class PullRequestAnalysisService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly branches: BranchesService,
    private readonly diff: DiffService,
    private readonly merge: MergeService,
  ) {}

  async analyze(
    sourceBranchId: string,
    targetBranchId: string,
  ): Promise<PullRequestAnalysis> {
    const [sourceBranch, targetBranch] = await Promise.all([
      this.loadBranch(sourceBranchId),
      this.loadBranch(targetBranchId),
    ]);

    const chain = await this.loadChain(sourceBranch);
    const chainIds = chain.map((commit) => commit.id);
    const targetAncestors = new Set(
      await this.branches.getAncestorIds(targetBranch.head_commit_id),
    );

    const origins = await this.loadOrigins(chainIds);
    const imported = await this.loadImported(chainIds, targetAncestors);

    let baseCommitId: string | null = null;
    let boundary = chain.length;
    for (let i = 0; i < chain.length; i++) {
      const commit = chain[i];
      const origin = origins.get(commit.id);
      if (origin && targetAncestors.has(origin)) {
        baseCommitId = origin;
        boundary = i;
        break;
      }
      const copy = imported.get(commit.id);
      if (copy) {
        baseCommitId = copy;
        boundary = i;
        break;
      }
    }

    if (!baseCommitId) {
      throw new BadRequestException('The branches are not related');
    }

    const newCommits = chain.slice(0, boundary).map((commit) => ({
      id: commit.id,
      message: commit.message,
      authorId: commit.author_id,
      createdAt: commit.created_at,
    }));

    const [baseSnapshot, sourceSnapshot, targetSnapshot] = await Promise.all([
      this.snapshotOf(baseCommitId),
      this.snapshotOf(sourceBranch.head_commit_id),
      this.snapshotOf(targetBranch.head_commit_id),
    ]);

    const empty = (): DraftSnapshot => ({
      schemaVersion: 3,
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: [],
      notes: [],
    });
    const base = baseSnapshot ?? empty();
    const source = sourceSnapshot ?? empty();
    const target = targetSnapshot ?? empty();

    const conflicts = this.merge.previewMerge(base, source, target);

    return {
      sourceBranch,
      targetBranch,
      baseCommitId,
      newCommits,
      summary: this.diff.compareSnapshots(base, source),
      targetChanges: this.diff.compareSnapshots(base, target),
      conflictsCount: conflicts.conflictsCount,
      conflictsByBar: conflicts.conflictsByBar,
      baseSnapshot,
      sourceSnapshot,
      targetSnapshot,
    };
  }

  private async loadBranch(branchId: string): Promise<BranchInfo> {
    const { data, error } = await this.supabase
      .from('branches')
      .select('id, project_id, name, head_commit_id')
      .eq('id', branchId)
      .maybeSingle<BranchInfo>();
    if (error) throw new InternalServerErrorException('Could not read branch');
    if (!data) throw new NotFoundException('Branch not found');
    return data;
  }

  private async loadChain(branch: BranchInfo): Promise<CommitRow[]> {
    const { data: branchRows } = await this.supabase
      .from('branches')
      .select('id')
      .eq('project_id', branch.project_id);
    const branchIds = (branchRows ?? []).map((b: { id: string }) => b.id);

    const { data, error } = await this.supabase
      .from('commits')
      .select('id, branch_id, author_id, message, created_at, parent_commit_id')
      .in('branch_id', branchIds);
    if (error) throw new InternalServerErrorException('Could not read commits');

    const byId = new Map(
      ((data ?? []) as CommitRow[]).map((commit) => [commit.id, commit]),
    );
    const chain: CommitRow[] = [];
    let current = branch.head_commit_id;
    while (current && byId.has(current) && chain.length < MAX_CHAIN) {
      const commit = byId.get(current)!;
      chain.push(commit);
      current = commit.parent_commit_id;
    }
    return chain;
  }

  private async loadOrigins(commitIds: string[]): Promise<Map<string, string>> {
    if (commitIds.length === 0) return new Map();
    const { data, error } = await this.supabase
      .from('commit_lineage')
      .select('commit_id, origin_commit_id')
      .in('commit_id', commitIds);
    if (error) throw new InternalServerErrorException('Could not read lineage');
    return new Map(
      (data ?? []).map(
        (row: { commit_id: string; origin_commit_id: string }) => [
          row.commit_id,
          row.origin_commit_id,
        ],
      ),
    );
  }

  private async loadImported(
    commitIds: string[],
    targetAncestors: Set<string>,
  ): Promise<Map<string, string>> {
    if (commitIds.length === 0) return new Map();
    const { data, error } = await this.supabase
      .from('commit_lineage')
      .select('commit_id, origin_commit_id')
      .in('origin_commit_id', commitIds);
    if (error) throw new InternalServerErrorException('Could not read lineage');

    const imported = new Map<string, string>();
    for (const row of (data ?? []) as Array<{
      commit_id: string;
      origin_commit_id: string;
    }>) {
      if (targetAncestors.has(row.commit_id)) {
        imported.set(row.origin_commit_id, row.commit_id);
      }
    }
    return imported;
  }

  private async snapshotOf(
    commitId: string | null,
  ): Promise<DraftSnapshot | null> {
    if (!commitId) return null;
    const { data } = await this.supabase
      .from('commits')
      .select('snapshot')
      .eq('id', commitId)
      .maybeSingle<{ snapshot: DraftSnapshot }>();
    return data?.snapshot ?? null;
  }
}
