import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { MergeService } from '../merge/merge.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PullRequestAnalysisService,
  type PullRequestAnalysis,
} from './pull-request-analysis.service';
import {
  PullRequestsService,
  type PullRequestRow,
} from './pull-requests.service';
import type {
  MergePullRequestDto,
  ResolvePullRequestDto,
} from './dto/pull-request.dto';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class PullRequestMergeService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly pullRequests: PullRequestsService,
    private readonly analysis: PullRequestAnalysisService,
    private readonly merge: MergeService,
    private readonly notifications: NotificationsService,
  ) {}

  async mergePullRequest(id: string, userId: string, dto: MergePullRequestDto) {
    const row = await this.loadMergeable(id, userId);

    const analysis = await this.analysis.analyze(
      row.source_branch_id!,
      row.target_branch_id!,
    );
    if (analysis.newCommits.length === 0) {
      throw new BadRequestException('There is nothing to merge');
    }

    const mergeBranchId = await this.importCommits(row, userId, analysis);

    const result = await this.merge.mergeBranch(userId, {
      sourceBranchId: mergeBranchId,
      targetBranchId: row.target_branch_id!,
      expectedTargetHeadCommitId: dto.expectedTargetHeadCommitId,
    });

    if (!('commit' in result)) {
      throw new ConflictException({
        message: 'Merge conflicts detected',
        conflicts: result,
      });
    }
    return this.finish(row, result.commit.id);
  }

  async resolvePullRequest(
    id: string,
    userId: string,
    dto: ResolvePullRequestDto,
  ) {
    const row = await this.loadMergeable(id, userId);
    if (!row.merge_branch_id) {
      throw new BadRequestException(
        'Start the merge before resolving conflicts',
      );
    }

    const result = await this.merge.resolveConflictsAndMerge(userId, {
      sourceBranchId: row.merge_branch_id,
      targetBranchId: row.target_branch_id!,
      resolutions: dto.resolutions,
      message: dto.message,
      expectedTargetHeadCommitId: dto.expectedTargetHeadCommitId,
    });
    return this.finish(row, result.commit.id);
  }

  private async loadMergeable(
    id: string,
    userId: string,
  ): Promise<PullRequestRow> {
    const { row, permissions } = await this.pullRequests.loadForUser(
      id,
      userId,
    );
    if (row.status !== 'open') {
      throw new ConflictException({
        message: 'Pull request is no longer open',
        status: row.status,
      });
    }
    if (!permissions.canMerge) {
      throw new ForbiddenException('You cannot merge this pull request');
    }
    if (!this.pullRequests.isApplicable(row)) {
      throw new ConflictException('This pull request can no longer be merged');
    }
    return row;
  }

  private async finish(row: PullRequestRow, commitId: string) {
    await this.pullRequests.markMerged(row.id, commitId);
    await this.notifications.notify(row.author_id, 'pr.merged', {
      title: row.title,
      projectName: row.target_project_name ?? '',
      pullRequestId: row.id,
    });
    return { ok: true, status: 'merged' as const, mergeCommitId: commitId };
  }

  private async importCommits(
    row: PullRequestRow,
    userId: string,
    analysis: PullRequestAnalysis,
  ): Promise<string> {
    const mergeBranchId = await this.ensureMergeBranch(
      row,
      userId,
      analysis.baseCommitId,
    );

    const imported = await this.loadImported(mergeBranchId);
    let previous = analysis.baseCommitId;

    for (const commit of [...analysis.newCommits].reverse()) {
      const existing = imported.get(commit.id);
      if (existing) {
        previous = existing;
        continue;
      }

      const { data: original, error: readError } = await this.supabase
        .from('commits')
        .select('author_id, message, snapshot, created_at')
        .eq('id', commit.id)
        .maybeSingle<{
          author_id: string | null;
          message: string;
          snapshot: unknown;
          created_at: string;
        }>();
      if (readError || !original) {
        throw new InternalServerErrorException(
          'Could not read pull request commit',
        );
      }

      const { data: copy, error: insertError } = await this.supabase
        .from('commits')
        .insert({
          branch_id: mergeBranchId,
          author_id: original.author_id,
          message: original.message,
          snapshot: original.snapshot,
          parent_commit_id: previous,
          created_at: original.created_at,
        })
        .select('id')
        .single<{ id: string }>();
      if (insertError || !copy) {
        throw new InternalServerErrorException(
          'Could not import pull request commits',
        );
      }

      const { error: lineageError } = await this.supabase
        .from('commit_lineage')
        .insert({ commit_id: copy.id, origin_commit_id: commit.id });
      if (lineageError) {
        throw new InternalServerErrorException(
          'Could not import pull request commits',
        );
      }
      previous = copy.id;
    }

    const { error: headError } = await this.supabase
      .from('branches')
      .update({ head_commit_id: previous })
      .eq('id', mergeBranchId);
    if (headError) {
      throw new InternalServerErrorException(
        'Could not import pull request commits',
      );
    }
    return mergeBranchId;
  }

  private async ensureMergeBranch(
    row: PullRequestRow,
    userId: string,
    baseCommitId: string,
  ): Promise<string> {
    if (row.merge_branch_id) {
      const { data } = await this.supabase
        .from('branches')
        .select('id')
        .eq('id', row.merge_branch_id)
        .maybeSingle<{ id: string }>();
      if (data) return data.id;
    }

    let branchId: string | null = null;
    for (let attempt = 0; attempt < 5 && !branchId; attempt++) {
      const name =
        attempt === 0 ? `pr-${row.number}` : `pr-${row.number}-${attempt + 1}`;
      const { data, error } = await this.supabase
        .from('branches')
        .insert({
          project_id: row.target_project_id,
          name,
          is_default: false,
          created_by: userId,
          base_commit_id: baseCommitId,
          head_commit_id: baseCommitId,
        })
        .select('id')
        .single<{ id: string }>();

      if (data) {
        branchId = data.id;
      } else if (error?.code !== UNIQUE_VIOLATION) {
        break;
      }
    }
    if (!branchId) {
      throw new InternalServerErrorException(
        'Could not prepare the merge branch',
      );
    }

    await this.pullRequests.setMergeBranch(row.id, branchId);
    return branchId;
  }

  private async loadImported(
    mergeBranchId: string,
  ): Promise<Map<string, string>> {
    const { data: commits } = await this.supabase
      .from('commits')
      .select('id')
      .eq('branch_id', mergeBranchId);
    const ids = (commits ?? []).map((c: { id: string }) => c.id);
    if (ids.length === 0) return new Map();

    const { data: lineage } = await this.supabase
      .from('commit_lineage')
      .select('commit_id, origin_commit_id')
      .in('commit_id', ids);
    return new Map(
      (lineage ?? []).map(
        (l: { commit_id: string; origin_commit_id: string }) => [
          l.origin_commit_id,
          l.commit_id,
        ],
      ),
    );
  }
}
