import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';

export type ProjectAccess = 'owner' | 'edit' | 'view' | null;

/** Raw row from projects table */
interface ProjectDbRow {
  id: string;
  owner_id: string;
  moderation_hidden_at: string | null;
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
    const project = await this.getProject(projectId);

    if (project.owner_id === userId) {
      return 'owner';
    }

    const { data: collaborator, error } = await this.supabase
      .from('project_collaborators')
      .select('permission_level, status')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle<CollaboratorDbRow>();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to check collaborator status: ${error.message}`,
      );
    }

    // BR-65: pending collaborators have no access.
    if (collaborator?.status === 'accepted') {
      return collaborator.permission_level;
    }

    return null;
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
    const access = await this.getAccess(projectId, userId);
    if (access !== 'owner' && access !== 'edit') {
      throw new ForbiddenException(
        'You do not have edit access to this project',
      );
    }
  }

  /** owner only. */
  async assertOwner(projectId: string, userId: string): Promise<void> {
    const access = await this.getAccess(projectId, userId);
    if (access !== 'owner') {
      throw new ForbiddenException('You do not have access to this project');
    }
  }

  /**
   * Fetch the project or fail with the same 404 for both "does not exist"
   * and "hidden for moderation" — never leak that a hidden project exists.
   */
  private async getProject(projectId: string): Promise<ProjectDbRow> {
    const { data: project, error } = await this.supabase
      .from('projects')
      .select('id, owner_id, moderation_hidden_at')
      .eq('id', projectId)
      .maybeSingle<ProjectDbRow>();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch project: ${error.message}`,
      );
    }

    if (!project || project.moderation_hidden_at !== null) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }
}
