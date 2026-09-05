import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { BranchRow, ProjectRow } from './project-row.type';

export const DEFAULT_BRANCH_NAME = 'main';

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  /** UC-18 (core): tạo project + branch mặc định 'main' đi kèm. */
  async create(ownerId: string, dto: CreateProjectDto): Promise<ProjectRow> {
    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .insert({ owner_id: ownerId, name: dto.name })
      .select('*')
      .single<ProjectRow>();

    if (projectError || !project) {
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

  /** Dùng bởi DraftsService: branch mặc định của project, chỉ nếu ownerId sở hữu project. */
  async getDefaultBranchForOwner(
    projectId: string,
    ownerId: string,
  ): Promise<BranchRow> {
    await this.getOwned(projectId, ownerId);

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
}
