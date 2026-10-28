import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';

export type ProjectAccess = 'owner' | 'edit' | 'view';

interface ProjectAccessRow {
  owner_id: string;
  archived_at: string | null;
}

@Injectable()
export class ProjectAccessService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async getAccess(
    projectId: string,
    userId: string,
  ): Promise<ProjectAccess | null> {
    const project = await this.loadProject(projectId);
    return project?.owner_id === userId ? 'owner' : null;
  }

  async assertCanView(projectId: string, userId: string): Promise<void> {
    await this.requireAccess(
      projectId,
      userId,
      'You do not have access to this project',
    );
  }

  async assertCanEdit(projectId: string, userId: string): Promise<void> {
    const { access, project } = await this.requireAccess(
      projectId,
      userId,
      'You do not have edit permission on this project',
    );
    if (access === 'view') {
      throw new ForbiddenException(
        'You do not have edit permission on this project',
      );
    }
    if (project.archived_at) {
      throw new ConflictException(
        'Archived projects are read-only. Restore the project first',
      );
    }
  }

  async assertOwner(projectId: string, userId: string): Promise<void> {
    const { access } = await this.requireAccess(
      projectId,
      userId,
      'Only the project owner can do this',
    );
    if (access !== 'owner') {
      throw new ForbiddenException('Only the project owner can do this');
    }
  }

  private async loadProject(
    projectId: string,
  ): Promise<ProjectAccessRow | null> {
    const { data } = await this.supabase
      .from('projects')
      .select('owner_id, archived_at')
      .eq('id', projectId)
      .maybeSingle<ProjectAccessRow>();
    return data ?? null;
  }

  private async requireAccess(
    projectId: string,
    userId: string,
    forbiddenMessage: string,
  ): Promise<{ access: ProjectAccess; project: ProjectAccessRow }> {
    const project = await this.loadProject(projectId);
    if (!project) throw new NotFoundException('Project not found');
    if (project.owner_id === userId) return { access: 'owner', project };
    throw new ForbiddenException(forbiddenMessage);
  }
}
