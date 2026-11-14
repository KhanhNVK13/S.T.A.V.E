import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ActivityLogService } from '../activity-log/activity-log.service';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import { normalizeTags } from './project-tags';
import type { BranchRow, ProjectLicense, ProjectRow } from './project-row.type';
import { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import { ProjectAccessService } from '../project-access/project-access.service';
import { ActiveBranchService } from '../active-branch/active-branch.service';
import { AudioSketchesService } from '../audio-sketches/audio-sketches.service';
import { buildDefaultDraftSnapshot } from '../drafts/default-snapshot';

export const DEFAULT_BRANCH_NAME = 'main';
export const INITIAL_COMMIT_MESSAGE = 'Initial commit';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly customSounds: CustomSoundsService,
    private readonly access: ProjectAccessService,
    private readonly activeBranch: ActiveBranchService,
    private readonly audioSketches: AudioSketchesService,
    @Optional() private readonly activityLog?: ActivityLogService,
  ) {}

  /** UC-18 (core): tạo project + branch mặc định 'main' + commit khởi tạo. */
  async create(
    ownerId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectRow & { visibilityKeptPrivate?: true }> {
    let visibilityPatch: {
      visibility: 'public';
      license: ProjectLicense;
    } | null = null;
    let visibilityKeptPrivate = false;
    if (dto.visibility === 'public') {
      if (await this.isEmailVerified(ownerId)) {
        if (!dto.license) {
          throw new BadRequestException(
            'Choose a license before making the project public',
          );
        }
        visibilityPatch = { visibility: 'public', license: dto.license };
      } else {
        visibilityKeptPrivate = true;
      }
    }

    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .insert({
        owner_id: ownerId,
        name: dto.name,
        description: dto.description ?? null,
        genre: dto.genre ?? null,
        ...visibilityPatch,
      })
      .select('*')
      .single<ProjectRow>();

    if (projectError) {
      throw new InternalServerErrorException('Could not create project');
    }
    if (!project) {
      throw new InternalServerErrorException('Could not create project');
    }

    const { data: branch, error: branchError } = await this.supabase
      .from('branches')
      .insert({
        project_id: project.id,
        name: DEFAULT_BRANCH_NAME,
        is_default: true,
        created_by: ownerId,
      })
      .select('id')
      .single<{ id: string }>();

    if (branchError || !branch) {
      await this.supabase.from('projects').delete().eq('id', project.id);
      throw new InternalServerErrorException(
        'Project creation rolled back: default branch could not be created',
      );
    }

    const { error: commitError } = await this.supabase.rpc(
      'create_commit_atomic',
      {
        p_branch_id: branch.id,
        p_author_id: ownerId,
        p_message: INITIAL_COMMIT_MESSAGE,
        p_snapshot: buildDefaultDraftSnapshot(),
        p_parent_commit_id: null,
        p_merged_from_branch_id: null,
      },
    );

    if (commitError) {
      await this.supabase.from('projects').delete().eq('id', project.id);
      throw new InternalServerErrorException(
        'Project creation rolled back: initial commit could not be created',
      );
    }

    void this.activityLog?.record({
      userId: ownerId,
      action: 'project.created',
      targetType: 'project',
      targetId: project.id,
      targetName: project.name,
    });
    return visibilityKeptPrivate
      ? { ...project, visibilityKeptPrivate: true }
      : project;
  }

  /** UC-22 (core): list project của user hiện tại. */
  async listMine(ownerId: string): Promise<ProjectRow[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException('Could not list projects');
    }
    return data as ProjectRow[];
  }

  /** UC-22 (core): xem 1 project — chỉ owner (collaborator/public thuộc phạm vi sau). */
  async getOwned(projectId: string, ownerId: string): Promise<ProjectRow> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('owner_id', ownerId)
      .maybeSingle<ProjectRow>();

    if (error || !data) {
      throw new NotFoundException('Project not found');
    }
    return data;
  }

  /** Branch mặc định của project, chỉ nếu ownerId sở hữu project. */
  async getDefaultBranchForOwner(
    projectId: string,
    ownerId: string,
  ): Promise<BranchRow> {
    await this.getOwned(projectId, ownerId);
    return this.loadDefaultBranch(projectId);
  }

  /**
   * UC-48 — dùng bởi DraftsService: branch mà editor đang mở của người dùng.
   *
   * Không phải lúc nào cũng là branch mặc định: sau `POST /branches/switch`,
   * branch đang mở của người dùng (chủ: `projects.active_branch_id`, cộng tác
   * viên: `project_member_active_branches`) trỏ sang branch vừa chuyển tới và
   * `GET|PUT /projects/:id/draft` phải đọc/ghi đúng draft của branch đó.
   *
   * Rơi về branch mặc định khi cột NULL hoặc trỏ tới branch không còn/không
   * thuộc project này (dữ liệu hỏng — vẫn phải mở được editor).
   */
  async getActiveBranchForUser(
    projectId: string,
    userId: string,
    options: { accessChecked?: boolean } = {},
  ): Promise<BranchRow> {
    if (!options.accessChecked) {
      await this.access.assertCanView(projectId, userId);
    }

    const activeId = await this.activeBranch.getActiveBranchId(
      projectId,
      userId,
    );

    if (activeId) {
      const { data } = await this.supabase
        .from('branches')
        .select('*')
        .eq('id', activeId)
        .eq('project_id', projectId)
        .maybeSingle<BranchRow>();
      if (data) return data;
    }

    return this.loadDefaultBranch(projectId);
  }

  private async loadDefaultBranch(projectId: string): Promise<BranchRow> {
    const { data, error } = await this.supabase
      .from('branches')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_default', true)
      .maybeSingle<BranchRow>();

    if (error || !data) {
      throw new NotFoundException('Default branch not found');
    }
    return data;
  }

  /** UC-19: cập nhật thông tin project — chỉ owner. */
  async updateOwned(
    projectId: string,
    ownerId: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectRow> {
    const project = await this.getOwned(projectId, ownerId);
    this.assertNotArchived(project);

    const updates: Partial<{
      name: string;
      description: string;
      genre: string;
      license: ProjectLicense;
    }> = {};

    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.genre !== undefined) updates.genre = dto.genre;
    if (dto.license !== undefined) updates.license = dto.license;

    const { data, error } = await this.supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select('*')
      .single<ProjectRow>();

    if (error) {
      throw new InternalServerErrorException('Could not update project');
    }
    if (!data) {
      throw new InternalServerErrorException('Could not update project');
    }
    return data;
  }

  async getTags(projectId: string, ownerId: string): Promise<string[]> {
    await this.getOwned(projectId, ownerId);
    const { data, error } = await this.supabase
      .from('project_tags')
      .select('tag:tag_id (name)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    if (error) {
      throw new InternalServerErrorException('Could not load project tags');
    }
    const names: string[] = [];
    for (const row of (data ?? []) as unknown as Array<{
      tag: { name: string } | { name: string }[] | null;
    }>) {
      const tags = Array.isArray(row.tag) ? row.tag : row.tag ? [row.tag] : [];
      for (const tag of tags) names.push(tag.name);
    }
    return names;
  }

  async setTags(
    projectId: string,
    ownerId: string,
    tags: string[],
  ): Promise<string[]> {
    const names = normalizeTags(tags);
    const project = await this.getOwned(projectId, ownerId);
    this.assertNotArchived(project);
    const { data, error } = await this.supabase.rpc('set_project_tags', {
      p_project_id: projectId,
      p_names: names,
    });
    if (error) {
      throw new InternalServerErrorException('Could not update project tags');
    }
    return (data as string[] | null) ?? names;
  }

  private assertNotArchived(project: ProjectRow): void {
    if (project.archived_at) {
      throw new ConflictException(
        'Archived projects are read-only. Restore the project first',
      );
    }
  }

  /** UC-20: archive project — chỉ owner. */
  async archiveOwned(projectId: string, ownerId: string): Promise<ProjectRow> {
    const archived = await this.updateOwnedProject(
      projectId,
      ownerId,
      { archived_at: new Date().toISOString() },
      'Could not archive project',
    );
    await this.closeOpenPullRequestsTargeting(projectId);
    return archived;
  }

  private async closeOpenPullRequestsTargeting(
    projectId: string,
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('pull_requests')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('target_project_id', projectId)
        .eq('status', 'open');
      if (error) {
        this.logger.warn(
          `Could not close the open pull requests of archived project ${projectId}: ${error.message}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Could not close the open pull requests of archived project ${projectId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** UC-20: khôi phục project đã lưu trữ — chỉ owner. */
  unarchiveOwned(projectId: string, ownerId: string): Promise<ProjectRow> {
    return this.updateOwnedProject(
      projectId,
      ownerId,
      { archived_at: null },
      'Could not unarchive project',
    );
  }

  /** UC-23: đổi visibility project — chỉ owner. */
  setVisibility(
    projectId: string,
    ownerId: string,
    visibility: 'public' | 'private',
    license?: ProjectLicense,
  ): Promise<ProjectRow> {
    return this.updateOwnedProject(
      projectId,
      ownerId,
      (project) => {
        if (visibility === 'private') return { visibility };
        const chosen = license ?? project.license;
        if (!chosen) {
          throw new BadRequestException(
            'Choose a license before making the project public',
          );
        }
        return { visibility, license: chosen };
      },
      'Could not update project visibility',
      {
        rejectArchived: true,
        beforeUpdate:
          visibility === 'public'
            ? () => this.assertEmailVerified(ownerId)
            : undefined,
      },
    );
  }

  private async isEmailVerified(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      throw new InternalServerErrorException('Could not create project');
    }
    return !!data.user.email_confirmed_at;
  }

  private async assertEmailVerified(userId: string): Promise<void> {
    const { data, error } = await this.supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      throw new InternalServerErrorException(
        'Could not update project visibility',
      );
    }
    if (!data.user.email_confirmed_at) {
      throw new ForbiddenException(
        'Unverified account cannot make project public',
      );
    }
  }

  /** UC-21: xóa project — chỉ owner. */
  async getDeletePreview(
    projectId: string,
    ownerId: string,
  ): Promise<{ branchCount: number; commitCount: number }> {
    await this.getOwned(projectId, ownerId);

    const { data: branches, error: branchError } = await this.supabase
      .from('branches')
      .select('id')
      .eq('project_id', projectId);
    if (branchError) {
      throw new InternalServerErrorException('Could not load project summary');
    }
    const branchIds = ((branches ?? []) as { id: string }[]).map((b) => b.id);
    if (branchIds.length === 0) return { branchCount: 0, commitCount: 0 };

    const { count, error: commitError } = await this.supabase
      .from('commits')
      .select('id', { count: 'exact', head: true })
      .in('branch_id', branchIds);
    if (commitError) {
      throw new InternalServerErrorException('Could not load project summary');
    }
    return { branchCount: branchIds.length, commitCount: count ?? 0 };
  }

  async deleteOwned(projectId: string, ownerId: string): Promise<void> {
    await this.getOwned(projectId, ownerId);

    const { error } = await this.supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('owner_id', ownerId);

    if (error) {
      throw new InternalServerErrorException('Could not delete project');
    }

    await this.audioSketches.purgeProjectFiles([projectId]);
    await this.customSounds.collectGarbage();
  }

  /** Shared getOwned → update → error-check pattern for archive/unarchive/setVisibility. */
  private async updateOwnedProject(
    projectId: string,
    ownerId: string,
    patch:
      | Record<string, unknown>
      | ((project: ProjectRow) => Record<string, unknown>),
    errorMessage: string,
    options: {
      rejectArchived?: boolean;
      beforeUpdate?: () => Promise<void>;
    } = {},
  ): Promise<ProjectRow> {
    const project = await this.getOwned(projectId, ownerId);
    if (options.rejectArchived) this.assertNotArchived(project);
    await options.beforeUpdate?.();

    const { data, error } = await this.supabase
      .from('projects')
      .update({
        ...(typeof patch === 'function' ? patch(project) : patch),
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
      .select('*')
      .single<ProjectRow>();

    if (error || !data) {
      throw new InternalServerErrorException(errorMessage);
    }
    return data;
  }
}
