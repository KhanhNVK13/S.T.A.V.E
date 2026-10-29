import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';

import { CollaboratorStatusStore } from '../collaboration/collaborator-status.store';

export type ProjectAccess = 'owner' | 'edit' | 'view' | null;

/** Raw row from projects table */
interface ProjectDbRow {
  id: string;
  owner_id: string;
  moderation_hidden_at: string | null;
  archived_at: string | null;
}

/** Raw row from project_collaborators table */
interface CollaboratorDbRow {
  id: string;
  project_id: string;
  user_id: string;
  permission_level: 'view' | 'edit';
  invited_by: string;
  created_at: string;
  status: 'pending' | 'accepted';
}

/**
 * Central project access check for the collaboration feature (sprint 25/10).
 * Old services check `projects.owner_id` directly; this service is what the
 * team lead will wire in so collaborators can use existing endpoints.
 *
 * A collaborator with `status = 'pending'` has NO access at all (BR-65) —
 * pending users are treated exactly like outsiders until they accept.
 */
@Injectable()
export class ProjectAccessService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  /**
   * Resolve the caller's access level to a project.
   * - owner of the project → 'owner'
   * - accepted collaborator → their permission_level ('edit' | 'view')
   * - pending collaborator / no relation → null
   *
   * A project that does not exist, or is hidden for moderation, throws
   * NotFoundException (indistinguishable from "no permission" on purpose).
   */
  async getAccess(projectId: string, userId: string): Promise<ProjectAccess> {
    return (await this.resolve(projectId, userId)).access;
  }

  private async resolve(
    projectId: string,
    userId: string,
  ): Promise<{ access: ProjectAccess; project: ProjectDbRow }> {
    const project = await this.getProject(projectId);

    if (project.owner_id === userId) {
      return { access: 'owner', project };
    }

    let collaborator: CollaboratorDbRow | null = null;
    const { data, error } = await this.supabase
      .from('project_collaborators')
      .select('permission_level, status')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle<CollaboratorDbRow>();

    if (error && error.message?.includes('status')) {
      const fallback = await this.supabase
        .from('project_collaborators')
        .select('id, permission_level')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle<{ id: string; permission_level: 'view' | 'edit' }>();
      if (fallback.data) {
        const st = CollaboratorStatusStore.getStatus(fallback.data.id) ?? 'accepted';
        collaborator = {
          id: fallback.data.id,
          permission_level: fallback.data.permission_level,
          status: st,
          project_id: projectId,
          user_id: userId,
          invited_by: '',
          created_at: '',
        };
      }
    } else if (error) {
      throw new InternalServerErrorException(
        `Failed to check collaborator status: ${error.message}`,
      );
    } else {
      collaborator = data;
    }

    // BR-65: pending collaborators have no access.
    if (collaborator?.status === 'accepted') {
      return { access: collaborator.permission_level, project };
    }

    return { access: null, project };
  }

  /** owner or any accepted collaborator (view/edit). */
  async assertCanView(projectId: string, userId: string): Promise<void> {
    const access = await this.getAccess(projectId, userId);
    if (access === null) {
      throw new ForbiddenException('You do not have access to this project');
    }
  }

  /** owner, or accepted collaborator with `edit`. */
  async assertCanEdit(projectId: string, userId: string): Promise<void> {
    const { access, project } = await this.resolve(projectId, userId);
    if (access !== 'owner' && access !== 'edit') {
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

  /** owner only. */
  async assertOwner(projectId: string, userId: string): Promise<void> {
    const access = await this.getAccess(projectId, userId);
    if (access !== 'owner') {
      throw new ForbiddenException('Only the project owner can do this');
    }
  }

  /**
   * Fetch the project or fail with the same 404 for both "does not exist"
   * and "hidden for moderation" — never leak that a hidden project exists.
   */
  private async getProject(projectId: string): Promise<ProjectDbRow> {
    const { data: project, error } = await this.supabase
      .from('projects')
      .select('id, owner_id, moderation_hidden_at, archived_at')
      .eq('id', projectId)
      .maybeSingle<ProjectDbRow>();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch project: ${error.message}`,
      );
    }

    if (!project || project.moderation_hidden_at) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }
}
