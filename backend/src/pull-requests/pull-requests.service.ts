import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { ProjectAccessService } from '../project-access/project-access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PullRequestAnalysisService } from './pull-request-analysis.service';
import type {
  ClosePullRequestDto,
  CommentPullRequestDto,
  CreatePullRequestDto,
  ListPullRequestsQueryDto,
  PullRequestStatus,
} from './dto/pull-request.dto';

const UNIQUE_VIOLATION = '23505';
const MAX_TITLE_LENGTH = 150;
const MAX_COMMENT_LENGTH = 2000;
const LIST_LIMIT = 100;

export interface PullRequestRow {
  id: string;
  number: number;
  source_project_id: string | null;
  source_branch_id: string | null;
  target_project_id: string | null;
  target_branch_id: string | null;
  author_id: string;
  title: string;
  description: string;
  status: PullRequestStatus;
  created_at: string;
  closed_at: string | null;
  merge_commit_id: string | null;
  merge_branch_id: string | null;
  source_project_name: string | null;
  target_project_name: string | null;
  source_branch_name: string | null;
  target_branch_name: string | null;
  new_commit_count: number;
  has_conflicts: boolean;
}

interface ProjectInfo {
  id: string;
  name: string;
  owner_id: string;
  visibility: string;
  archived_at: string | null;
  moderation_hidden_at: string | null;
  forked_from_project_id: string | null;
}

export interface UserInfo {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface PullRequestPermissions {
  canMerge: boolean;
  canClose: boolean;
  canComment: boolean;
}

export interface PullRequestContext {
  row: PullRequestRow;
  targetProject: ProjectInfo | null;
  permissions: PullRequestPermissions;
}

const PROJECT_COLUMNS =
  'id, name, owner_id, visibility, archived_at, moderation_hidden_at, forked_from_project_id';
const PR_COLUMNS =
  'id, number, source_project_id, source_branch_id, target_project_id, target_branch_id, author_id, title, description, status, created_at, closed_at, merge_commit_id, merge_branch_id, source_project_name, target_project_name, source_branch_name, target_branch_name, new_commit_count, has_conflicts';

@Injectable()
export class PullRequestsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly access: ProjectAccessService,
    private readonly analysis: PullRequestAnalysisService,
    private readonly notifications: NotificationsService,
  ) {}

  async preview(
    projectId: string,
    userId: string,
    sourceBranchId: string,
    targetBranchId: string,
  ) {
    const { target } = await this.validateTarget(
      projectId,
      userId,
      sourceBranchId,
      targetBranchId,
    );
    const result = await this.analysis.analyze(sourceBranchId, targetBranchId);
    if (result.newCommits.length === 0) {
      throw new BadRequestException('There is nothing to propose');
    }
    return {
      targetProjectName: target.name,
      newCommitCount: result.newCommits.length,
      notes: result.summary.summary.notes,
      tracks: result.summary.summary.tracks,
      conflictsCount: result.conflictsCount,
      hasConflicts: result.conflictsCount > 0,
    };
  }

  async targetBranches(projectId: string, userId: string) {
    await this.access.assertOwner(projectId, userId);
    const source = await this.loadProject(projectId);
    if (!source?.forked_from_project_id) {
      throw new BadRequestException('This project is not a fork');
    }
    const target = await this.loadProject(source.forked_from_project_id);
    if (
      !target ||
      target.visibility !== 'public' ||
      target.archived_at ||
      target.moderation_hidden_at
    ) {
      throw new ConflictException(
        'The original project is no longer available',
      );
    }

    const { data, error } = await this.supabase
      .from('branches')
      .select('id, name, is_default')
      .eq('project_id', target.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) {
      throw new InternalServerErrorException('Could not list branches');
    }
    return {
      targetProjectId: target.id,
      targetProjectName: target.name,
      branches: (data ?? []) as Array<{
        id: string;
        name: string;
        is_default: boolean;
      }>,
    };
  }

  async create(
    projectId: string,
    userId: string,
    dto: CreatePullRequestDto,
  ): Promise<{ id: string; number: number }> {
    const title = (dto.title ?? '').trim();
    if (title.length === 0) {
      throw new BadRequestException('Title is required');
    }
    if (title.length > MAX_TITLE_LENGTH) {
      throw new BadRequestException('Title must not exceed 150 characters');
    }
    const description = (dto.description ?? '').trim();
    if (description.length > MAX_COMMENT_LENGTH) {
      throw new BadRequestException(
        'Description must not exceed 2000 characters',
      );
    }

    const { source, target, sourceBranch, targetBranch } =
      await this.validateTarget(
        projectId,
        userId,
        dto.sourceBranchId,
        dto.targetBranchId,
      );

    const result = await this.analysis.analyze(
      dto.sourceBranchId,
      dto.targetBranchId,
    );
    if (result.newCommits.length === 0) {
      throw new BadRequestException('There is nothing to propose');
    }

    const existing = await this.findOpenDuplicate(
      dto.sourceBranchId,
      dto.targetBranchId,
    );
    if (existing) throw this.duplicateError(existing);

    const { data, error } = await this.supabase
      .from('pull_requests')
      .insert({
        source_project_id: source.id,
        source_branch_id: dto.sourceBranchId,
        target_project_id: target.id,
        target_branch_id: dto.targetBranchId,
        author_id: userId,
        title,
        description,
        source_project_name: source.name,
        target_project_name: target.name,
        source_branch_name: sourceBranch.name,
        target_branch_name: targetBranch.name,
        new_commit_count: result.newCommits.length,
        has_conflicts: result.conflictsCount > 0,
      })
      .select('id, number')
      .single<{ id: string; number: number }>();

    if (error || !data) {
      if (error?.code === UNIQUE_VIOLATION) {
        const duplicate = await this.findOpenDuplicate(
          dto.sourceBranchId,
          dto.targetBranchId,
        );
        if (duplicate) throw this.duplicateError(duplicate);
      }
      throw new InternalServerErrorException('Could not create pull request');
    }

    await this.notifications.notify(target.owner_id, 'pr.opened', {
      authorName: await this.displayName(userId),
      title,
      projectName: target.name,
      pullRequestId: data.id,
      projectId: target.id,
    });

    return data;
  }

  async list(userId: string, query: ListPullRequestsQueryDto) {
    let builder = this.supabase.from('pull_requests').select(PR_COLUMNS);

    if (query.view === 'created') {
      builder = builder.eq('author_id', userId);
    } else {
      const { data: owned } = await this.supabase
        .from('projects')
        .select('id')
        .eq('owner_id', userId);
      const ids = (owned ?? []).map((p: { id: string }) => p.id);
      if (ids.length === 0) return [];
      builder = builder.in('target_project_id', ids);
    }
    if (query.status) builder = builder.eq('status', query.status);

    const { data, error } = await builder
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (error) {
      throw new InternalServerErrorException('Could not list pull requests');
    }
    return this.toListItems(data ?? []);
  }

  async listForProject(
    projectId: string,
    userId: string,
    status?: PullRequestStatus,
  ) {
    const project = await this.loadProject(projectId);
    if (!project || project.moderation_hidden_at) {
      throw new NotFoundException('Project not found');
    }
    const access = await this.access.getAccess(projectId, userId);
    if (!access && project.visibility !== 'public') {
      throw new NotFoundException('Project not found');
    }

    let builder = this.supabase
      .from('pull_requests')
      .select(PR_COLUMNS)
      .or(
        `target_project_id.eq.${projectId},source_project_id.eq.${projectId}`,
      );
    if (status) builder = builder.eq('status', status);

    const { data, error } = await builder
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (error) {
      throw new InternalServerErrorException('Could not list pull requests');
    }

    const rows = (data ?? []).filter(
      (row) =>
        access !== null ||
        row.author_id === userId ||
        row.target_project_id === projectId,
    );
    return this.toListItems(rows);
  }

  async loadForUser(id: string, userId: string): Promise<PullRequestContext> {
    const { data, error } = await this.supabase
      .from('pull_requests')
      .select(PR_COLUMNS)
      .eq('id', id)
      .maybeSingle<PullRequestRow>();
    if (error) {
      throw new InternalServerErrorException('Could not read pull request');
    }
    if (!data) throw new NotFoundException('Pull request not found');

    const targetProject = data.target_project_id
      ? await this.loadProject(data.target_project_id)
      : null;
    const isAuthor = data.author_id === userId;
    const targetAccess = targetProject
      ? await this.access.getAccess(targetProject.id, userId)
      : null;
    const hasWrite = targetAccess === 'owner' || targetAccess === 'edit';

    const publicTarget =
      targetProject?.visibility === 'public' &&
      !targetProject.moderation_hidden_at;
    const canView = isAuthor || targetAccess !== null || !!publicTarget;
    if (!canView) throw new NotFoundException('Pull request not found');

    return {
      row: data,
      targetProject,
      permissions: {
        canMerge: data.status === 'open' && hasWrite,
        canClose: data.status === 'open' && (isAuthor || hasWrite),
        canComment: targetProject !== null || isAuthor,
      },
    };
  }

  async get(id: string, userId: string) {
    const { row, targetProject, permissions } = await this.loadForUser(
      id,
      userId,
    );
    const applicable = this.isApplicable(row);

    let analysis: Awaited<ReturnType<typeof this.analyzeForDetail>> | null =
      null;
    let analysisError: string | null = null;
    if (row.status === 'open' && applicable) {
      try {
        analysis = await this.analyzeForDetail(row);
      } catch (err) {
        analysisError =
          err instanceof BadRequestException
            ? 'The branches are no longer related'
            : 'Could not compare the branches';
      }
    }

    const comments = await this.loadComments(id);
    const userIds = [
      row.author_id,
      ...comments.map((c) => c.author_id),
      ...(analysis?.newCommits.map((c) => c.authorId) ?? []),
    ];
    const users = await this.loadUsers(userIds);

    return {
      pullRequest: {
        ...row,
        author: users.get(row.author_id) ?? null,
        applicable,
        targetOwnerId: targetProject?.owner_id ?? null,
      },
      analysis: analysis
        ? {
            ...analysis,
            newCommits: analysis.newCommits.map((commit) => ({
              ...commit,
              author: commit.authorId
                ? (users.get(commit.authorId) ?? null)
                : null,
            })),
          }
        : null,
      analysisError,
      comments: comments.map((comment) => ({
        ...comment,
        author: users.get(comment.author_id) ?? null,
      })),
      permissions,
    };
  }

  async addComment(id: string, userId: string, dto: CommentPullRequestDto) {
    const { row, targetProject, permissions } = await this.loadForUser(
      id,
      userId,
    );
    if (!permissions.canComment) {
      throw new ForbiddenException(
        'This pull request can no longer be commented on',
      );
    }

    const body = (dto.body ?? '').trim();
    if (body.length === 0) throw new BadRequestException('Comment is required');
    if (body.length > MAX_COMMENT_LENGTH) {
      throw new BadRequestException('Comment must not exceed 2000 characters');
    }

    const { data, error } = await this.supabase
      .from('pull_request_comments')
      .insert({ pull_request_id: id, author_id: userId, body })
      .select('id, pull_request_id, author_id, body, created_at')
      .single<{
        id: string;
        pull_request_id: string;
        author_id: string;
        body: string;
        created_at: string;
      }>();
    if (error || !data) {
      throw new InternalServerErrorException('Could not save comment');
    }

    const recipients = new Set<string>([row.author_id]);
    if (targetProject) recipients.add(targetProject.owner_id);
    recipients.delete(userId);
    const authorName = await this.displayName(userId);
    for (const recipient of recipients) {
      await this.notifications.notify(recipient, 'pr.comment', {
        authorName,
        title: row.title,
        pullRequestId: id,
      });
    }

    const users = await this.loadUsers([userId]);
    return { ...data, author: users.get(userId) ?? null };
  }

  async deleteComment(id: string, commentId: string, userId: string) {
    const { targetProject } = await this.loadForUser(id, userId);

    const { data: comment } = await this.supabase
      .from('pull_request_comments')
      .select('id, author_id')
      .eq('id', commentId)
      .eq('pull_request_id', id)
      .maybeSingle<{ id: string; author_id: string }>();
    if (!comment) throw new NotFoundException('Comment not found');

    const targetAccess = targetProject
      ? await this.access.getAccess(targetProject.id, userId)
      : null;
    const mayDelete =
      comment.author_id === userId ||
      targetAccess === 'owner' ||
      targetAccess === 'edit';
    if (!mayDelete) {
      throw new ForbiddenException('You cannot delete this comment');
    }

    const { error } = await this.supabase
      .from('pull_request_comments')
      .delete()
      .eq('id', commentId);
    if (error) {
      throw new InternalServerErrorException('Could not delete comment');
    }
    return { ok: true };
  }

  async close(id: string, userId: string, dto: ClosePullRequestDto) {
    const { row, targetProject, permissions } = await this.loadForUser(
      id,
      userId,
    );
    if (row.status !== 'open') {
      throw new ConflictException({
        message: 'Pull request is no longer open',
        status: row.status,
      });
    }
    if (!permissions.canClose) {
      throw new ForbiddenException('You cannot close this pull request');
    }

    const comment = (dto.comment ?? '').trim();
    if (comment.length > MAX_COMMENT_LENGTH) {
      throw new BadRequestException('Comment must not exceed 2000 characters');
    }

    const { data, error } = await this.supabase
      .from('pull_requests')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'open')
      .select('id')
      .maybeSingle<{ id: string }>();
    if (error) {
      throw new InternalServerErrorException('Could not close pull request');
    }
    if (!data) {
      throw new ConflictException({
        message: 'Pull request is no longer open',
        status: 'merged',
      });
    }

    if (comment) {
      await this.supabase
        .from('pull_request_comments')
        .insert({ pull_request_id: id, author_id: userId, body: comment });
    }

    const actorName = await this.displayName(userId);
    const recipient =
      userId === row.author_id
        ? (targetProject?.owner_id ?? null)
        : row.author_id;
    if (recipient && recipient !== userId) {
      await this.notifications.notify(recipient, 'pr.closed', {
        title: row.title,
        actorName,
        pullRequestId: id,
      });
    }
    return { ok: true, status: 'closed' as const };
  }

  async markMerged(id: string, mergeCommitId: string | null): Promise<void> {
    const { data, error } = await this.supabase
      .from('pull_requests')
      .update({
        status: 'merged',
        merge_commit_id: mergeCommitId,
        closed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'open')
      .select('id')
      .maybeSingle<{ id: string }>();
    if (error) {
      throw new InternalServerErrorException('Could not update pull request');
    }
    if (!data) {
      throw new ConflictException({
        message: 'Pull request is no longer open',
        status: 'merged',
      });
    }
  }

  async setMergeBranch(id: string, branchId: string): Promise<void> {
    const { error } = await this.supabase
      .from('pull_requests')
      .update({ merge_branch_id: branchId })
      .eq('id', id);
    if (error) {
      throw new InternalServerErrorException('Could not update pull request');
    }
  }

  async displayName(userId: string): Promise<string> {
    const { data } = await this.supabase
      .from('users')
      .select('display_name, username')
      .eq('id', userId)
      .maybeSingle<{ display_name: string | null; username: string | null }>();
    return data?.display_name ?? data?.username ?? 'Một người dùng';
  }

  isApplicable(row: PullRequestRow): boolean {
    return !!(
      row.source_project_id &&
      row.source_branch_id &&
      row.target_project_id &&
      row.target_branch_id
    );
  }

  private async analyzeForDetail(row: PullRequestRow) {
    const result = await this.analysis.analyze(
      row.source_branch_id!,
      row.target_branch_id!,
    );
    return {
      baseCommitId: result.baseCommitId,
      newCommits: result.newCommits,
      summary: result.summary,
      targetChanges: result.targetChanges,
      conflictsCount: result.conflictsCount,
      conflictsByBar: result.conflictsByBar,
      snapshots: {
        base: result.baseSnapshot,
        source: result.sourceSnapshot,
        target: result.targetSnapshot,
      },
    };
  }

  private async validateTarget(
    projectId: string,
    userId: string,
    sourceBranchId: string,
    targetBranchId: string,
  ) {
    await this.access.assertOwner(projectId, userId);

    const source = await this.loadProject(projectId);
    if (!source) throw new NotFoundException('Project not found');
    if (!source.forked_from_project_id) {
      throw new BadRequestException('This project is not a fork');
    }

    const target = await this.loadProject(source.forked_from_project_id);
    if (
      !target ||
      target.visibility !== 'public' ||
      target.archived_at ||
      target.moderation_hidden_at
    ) {
      throw new ConflictException(
        'The original project is no longer available',
      );
    }

    const [sourceBranch, targetBranch] = await Promise.all([
      this.loadBranch(sourceBranchId, source.id),
      this.loadBranch(targetBranchId, target.id),
    ]);
    return { source, target, sourceBranch, targetBranch };
  }

  private async loadBranch(branchId: string, projectId: string) {
    const { data } = await this.supabase
      .from('branches')
      .select('id, name, project_id')
      .eq('id', branchId)
      .eq('project_id', projectId)
      .maybeSingle<{ id: string; name: string; project_id: string }>();
    if (!data) throw new NotFoundException('Branch not found');
    return data;
  }

  private async loadProject(projectId: string): Promise<ProjectInfo | null> {
    const { data } = await this.supabase
      .from('projects')
      .select(PROJECT_COLUMNS)
      .eq('id', projectId)
      .maybeSingle<ProjectInfo>();
    return data ?? null;
  }

  private async findOpenDuplicate(
    sourceBranchId: string,
    targetBranchId: string,
  ): Promise<string | null> {
    const { data } = await this.supabase
      .from('pull_requests')
      .select('id')
      .eq('source_branch_id', sourceBranchId)
      .eq('target_branch_id', targetBranchId)
      .eq('status', 'open')
      .maybeSingle<{ id: string }>();
    return data?.id ?? null;
  }

  private duplicateError(pullRequestId: string): ConflictException {
    return new ConflictException({
      message: 'An open pull request already exists',
      pullRequestId,
    });
  }

  private async loadComments(id: string) {
    const { data } = await this.supabase
      .from('pull_request_comments')
      .select('id, pull_request_id, author_id, body, created_at')
      .eq('pull_request_id', id)
      .order('created_at', { ascending: true });
    return (data ?? []) as Array<{
      id: string;
      pull_request_id: string;
      author_id: string;
      body: string;
      created_at: string;
    }>;
  }

  private async loadUsers(
    ids: Array<string | null | undefined>,
  ): Promise<Map<string, UserInfo>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    const { data } = await this.supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .in('id', unique);
    return new Map(((data ?? []) as UserInfo[]).map((u) => [u.id, u]));
  }

  private async toListItems(rows: PullRequestRow[]) {
    const users = await this.loadUsers(rows.map((r) => r.author_id));
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      title: row.title,
      status: row.status,
      author: users.get(row.author_id) ?? null,
      sourceProjectName: row.source_project_name,
      targetProjectName: row.target_project_name,
      sourceBranchName: row.source_branch_name,
      targetBranchName: row.target_branch_name,
      createdAt: row.created_at,
      closedAt: row.closed_at,
      newCommitCount: row.new_commit_count,
      hasConflicts: row.has_conflicts,
      applicable: this.isApplicable(row),
    }));
  }
}
