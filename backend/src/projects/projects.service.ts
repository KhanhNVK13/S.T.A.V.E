import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import type { BranchRow, ProjectRow } from './project-row.type';
import { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import { ProjectAccessService } from '../project-access/project-access.service';
import { ActiveBranchService } from '../active-branch/active-branch.service';
import { AudioSketchesService } from '../audio-sketches/audio-sketches.service';

export const DEFAULT_BRANCH_NAME = 'main';

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly customSounds: CustomSoundsService,
    private readonly access: ProjectAccessService,
    private readonly activeBranch: ActiveBranchService,
    private readonly audioSketches: AudioSketchesService,
  ) {}

  /** UC-18 (core): tạo project + branch mặc định 'main' đi kèm. */
  async create(ownerId: string, dto: CreateProjectDto): Promise<ProjectRow> {
    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .insert({
        owner_id: ownerId,
        name: dto.name,
        description: dto.description ?? null,
        genre: dto.genre ?? null,
      })
      .select('*')
      .single<ProjectRow>();

    if (projectError) {
      throw new InternalServerErrorException('Could not create project');
    }
    if (!project) {
      throw new InternalServerErrorException('Could not create project');
    }

    const { error: branchError } = await this.supabase.from('branches').insert({
      project_id: project.id,
      name: DEFAULT_BRANCH_NAME,
      is_default: true,
      created_by: ownerId,
    });

    if (branchError) {
      throw new InternalServerErrorException(
        'Project created but default branch could not be created',
      );
    }

    return project;
  }

  /** UC-22 (core): list project của user hiện tại. */
  async listMine(ownerId: string): Promise<ProjectRow[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

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
    if (project.archived_at) {
      throw new ConflictException(
        'Archived projects are read-only. Restore the project first',
      );
    }

    const updates: Partial<{
      name: string;
      description: string;
      genre: string;
    }> = {};

    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.genre !== undefined) updates.genre = dto.genre;

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

  /** UC-20: archive project — chỉ owner. */
  archiveOwned(projectId: string, ownerId: string): Promise<ProjectRow> {
    return this.updateOwnedProject(
      projectId,
      ownerId,
      { archived_at: new Date().toISOString() },
      'Could not archive project',
    );
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
  ): Promise<ProjectRow> {
    return this.updateOwnedProject(
      projectId,
      ownerId,
      { visibility },
      'Could not update project visibility',
    );
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
    patch: Record<string, unknown>,
    errorMessage: string,
  ): Promise<ProjectRow> {
    await this.getOwned(projectId, ownerId);

    const { data, error } = await this.supabase
      .from('projects')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .select('*')
      .single<ProjectRow>();

    if (error || !data) {
      throw new InternalServerErrorException(errorMessage);
    }
    return data;
  }
}
