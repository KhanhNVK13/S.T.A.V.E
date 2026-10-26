import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { ProjectAccessService } from '../project-access/project-access.service';
import { InviteCollaboratorDto } from './dto/invite-collaborator.dto';
import { PatchCollaboratorDto } from './dto/patch-collaborator.dto';

/** Raw row from project_collaborators (columns per docs/duc.md — no others). */
interface CollaboratorRow {
  id: string;
  project_id: string;
  user_id: string;
  permission_level: 'view' | 'edit';
  invited_by: string;
  created_at: string;
  status: 'pending' | 'accepted';
  responded_at: string | null;
}

/** Collaborator list item, with the invited user's profile. */
export interface CollaboratorItem {
  id: string;
  userId: string;
  permissionLevel: 'view' | 'edit';
  status: 'pending' | 'accepted';
  respondedAt: string | null;
  invitedBy: string;
  createdAt: string;
  user: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

/** Invitation row returned to /users/me/collaboration-invitations. */
export interface InvitationItem {
  id: string;
  projectId: string;
  permissionLevel: 'view' | 'edit';
  projectName: string | null;
  inviterName: string | null;
  invitedAt: string;
}

/** Cap on collaborators per project, counting pending invitations. */
const MAX_COLLABORATORS = 10;

/**
 * UC-60/61/62: collaborator invitations, permissions, removal.
 *
 * A collaborator with status = 'pending' has no access at all (BR-65) —
 * access is enforced centrally by ProjectAccessService.
 */
@Injectable()
export class CollaborationService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  // ==========================================================================
  // UC-60: List collaborators
  // ==========================================================================

  /**
   * Owner and accepted collaborators can list the team (including pending
   * rows); pending collaborators and outsiders are rejected.
   */
  async listCollaborators(
    projectId: string,
    userId: string,
  ): Promise<CollaboratorItem[]> {
    await this.projectAccess.assertCanView(projectId, userId);

    const { data: rows, error } = await this.supabase
      .from('project_collaborators')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch collaborators: ${error.message}`,
      );
    }

    return this.toItems((rows ?? []) as CollaboratorRow[]);
  }

  // ==========================================================================
  // UC-60: Invite a collaborator
  // ==========================================================================

  async inviteCollaborator(
    projectId: string,
    dto: InviteCollaboratorDto,
    userId: string,
  ): Promise<CollaboratorItem> {
    // Only the owner invites; pending collaborators see no controls.
    await this.projectAccess.assertOwner(projectId, userId);

    const target = await this.findUserByIdentifier(dto.identifier);
    if (!target) {
      // Neutral message: never reveal whether this email is registered here.
      throw new NotFoundException('No account matches the provided identifier');
    }

    if (target.id === userId) {
      throw new BadRequestException(
        'You are the project owner and already have full access',
      );
    }

    const existing = await this.findCollaboratorRowByUser(projectId, target.id);
    if (existing) {
      throw new ConflictException(
        existing.status === 'pending'
          ? 'An invitation is already pending for this person'
          : 'This person is already a collaborator',
      );
    }

    const count = await this.countCollaborators(projectId);
    if (count >= MAX_COLLABORATORS) {
      throw new ConflictException(
        `The project already has ${MAX_COLLABORATORS} collaborators (including pending invitations)`,
      );
    }

    const { data: created, error } = await this.supabase
      .from('project_collaborators')
      .insert({
        id: uuidv4(),
        project_id: projectId,
        user_id: target.id,
        permission_level: dto.permissionLevel,
        invited_by: userId,
        status: 'pending',
      })
      .select('*')
      .single<CollaboratorRow>();

    if (error) {
      // Unique (project_id, user_id) index is the second line of defense
      // against concurrent invites of the same person.
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(
          'An invitation is already pending for this person',
        );
      }
      throw new InternalServerErrorException(
        `Failed to invite collaborator: ${error.message}`,
      );
    }

    const [item] = await this.toItems([created]);

    // Notify the invitee: collab.invite (payload carries the page link data).
    // TODO(Trí UC-80): swap for NotificationsService.notify once merged —
    // payload per docs/team-workload.md notification-types table.
    const inviterName = (await this.getUserName(userId)) ?? 'Người dùng';
    const projectName = await this.getProjectName(projectId);
    this.emitNotification({
      userId: target.id,
      type: 'collab.invite',
      payload: {
        projectId,
        projectName,
        inviterName,
        invitationId: created.id,
      },
    });

    return item;
  }

  // ==========================================================================
  // UC-60: My pending invitations + accept / decline
  // ==========================================================================

  async getMyInvitations(userId: string): Promise<InvitationItem[]> {
    const { data: fetched, error } = await this.supabase
      .from('project_collaborators')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch invitations: ${error.message}`,
      );
    }

    const rows = (fetched ?? []) as CollaboratorRow[];

    // Fill project names + inviter names for display.
    const projectNameMap = await this.getNames(
      'projects',
      rows.map((r) => r.project_id),
      'name',
    );
    const userMap = await this.getNames(
      'users',
      rows.map((r) => r.invited_by),
      'display_name',
    );
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      permissionLevel: r.permission_level,
      invitedAt: r.created_at,
      projectName: projectNameMap.get(r.project_id) ?? null,
      inviterName: userMap.get(`${r.invited_by}:display_name`) ?? null,
    }));
  }

  async acceptInvitation(invitationId: string, userId: string): Promise<void> {
    const row = await this.getPendingInvitation(invitationId, userId);

    const { error } = await this.supabase
      .from('project_collaborators')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) {
      throw new InternalServerErrorException(
        `Failed to accept invitation: ${error.message}`,
      );
    }

    this.emitNotification({
      userId: row.invited_by,
      type: 'collab.invite_accepted',
      payload: { projectId: row.project_id, invitationId: row.id },
    });
  }

  async declineInvitation(invitationId: string, userId: string): Promise<void> {
    const row = await this.getPendingInvitation(invitationId, userId);

    // Declining removes the invitation row entirely.
    const { error } = await this.supabase
      .from('project_collaborators')
      .delete()
      .eq('id', row.id);
    if (error) {
      throw new InternalServerErrorException(
        `Failed to decline invitation: ${error.message}`,
      );
    }

    this.emitNotification({
      userId: row.invited_by,
      type: 'collab.invite_declined',
      payload: { projectId: row.project_id, invitationId: row.id },
    });
  }

  // ==========================================================================
  // UC-61: Change a collaborator's permission level
  // ==========================================================================

  async patchCollaborator(
    projectId: string,
    collaboratorId: string,
    dto: PatchCollaboratorDto,
    userId: string,
  ): Promise<CollaboratorItem> {
    await this.projectAccess.assertOwner(projectId, userId);

    const row = await this.getCollaboratorRow(projectId, collaboratorId);

    // Pending collaborators: changes the level that will be granted, never
    // grants access itself (BR-65 — access only after accepting).
    const { error } = await this.supabase
      .from('project_collaborators')
      .update({ permission_level: dto.permissionLevel })
      .eq('id', row.id);
    if (error) {
      // On error the old level stands; the client rolls its dropdown back.
      throw new InternalServerErrorException(
        `Failed to update collaborator permission: ${error.message}`,
      );
    }

    const updated = { ...row, permission_level: dto.permissionLevel };

    // Notify the changed person. If they are currently in the project and
    // lost edit access, the browser picks it up live via
    // `collab:permission_changed` on the collab gateway.
    // TODO(UC-64): replace with CollaborationGateway.toRoom(projectId).emit(
    //   'collab:permission_changed', { collaboratorId, permissionLevel }).
    this.emitNotification({
      userId: row.user_id,
      type: 'collab.permission_changed',
      payload: {
        projectId,
        invitationId: row.id,
        permissionLevel: dto.permissionLevel,
      },
    });

    return (await this.toItems([updated]))[0];
  }

  // ==========================================================================
  // UC-62: Remove a collaborator
  // ==========================================================================

  async removeCollaborator(
    projectId: string,
    collaboratorId: string,
    userId: string,
  ): Promise<void> {
    await this.projectAccess.assertOwner(projectId, userId);

    const row = await this.getCollaboratorRow(projectId, collaboratorId);

    // 1.E1: the owner is never a collaborator row — refuse, defensively, if
    // one exists anyway (owner already confirmed by assertOwner above).
    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .single();
    if (projectError) {
      throw new InternalServerErrorException(
        `Failed to fetch project owner: ${projectError.message}`,
      );
    }
    if (row.user_id === project.owner_id) {
      throw new BadRequestException('The project owner cannot be removed');
    }

    const { error } = await this.supabase
      .from('project_collaborators')
      .delete()
      .eq('id', row.id);
    if (error) {
      throw new InternalServerErrorException(
        `Failed to remove collaborator: ${error.message}`,
      );
    }

    // Their commits and comments stay untouched (BR-67 — commits are
    // immutable; comments are their own rows, never deleted here).

    if (row.status === 'accepted') {
      // Their uncommitted draft is discarded by the drafts service.
      // TODO(trưởng nhóm): call DraftsService.discardUserDraft(projectId,
      // row.user_id) once the shared function exists — do not patch
      // DraftsService from this module.
      //
      // Their open tabs hear about it via `collab:access_revoked` on the
      // collab gateway and redirect to /projects (5.E1).
      // TODO(UC-64): replace with CollaborationGateway.toRoom(projectId)
      //   .emit('collab:access_revoked', { userId: row.user_id }).
      this.emitNotification({
        userId: row.user_id,
        type: 'collab.access_removed',
        payload: { projectId, invitationId: row.id },
      });
    }
    // Pending invitation: withdrawal only, no "you were removed" notice.
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /** Find a user by username (exact) or email (case-insensitive). */
  private async findUserByIdentifier(
    identifier: string,
  ): Promise<{ id: string } | null> {
    const trimmed = identifier.trim();

    const { data: byUsername, error: usernameError } = await this.supabase
      .from('users')
      .select('id')
      .eq('username', trimmed)
      .maybeSingle<{ id: string }>();
    if (usernameError) {
      throw new InternalServerErrorException(
        `Failed to look up user: ${usernameError.message}`,
      );
    }
    if (byUsername) return byUsername;

    const { data: byEmail, error: emailError } = await this.supabase
      .from('users')
      .select('id')
      .ilike('email', trimmed)
      .maybeSingle<{ id: string }>();
    if (emailError) {
      throw new InternalServerErrorException(
        `Failed to look up user: ${emailError.message}`,
      );
    }
    return byEmail;
  }

  private async findCollaboratorRowByUser(
    projectId: string,
    userId: string,
  ): Promise<CollaboratorRow | null> {
    const { data: row, error } = await this.supabase
      .from('project_collaborators')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle<CollaboratorRow>();
    if (error) {
      throw new InternalServerErrorException(
        `Failed to check existing collaboration: ${error.message}`,
      );
    }
    return row ?? null;
  }

  private async countCollaborators(projectId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('project_collaborators')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);
    if (error) {
      throw new InternalServerErrorException(
        `Failed to count collaborators: ${error.message}`,
      );
    }
    return count ?? 0;
  }

  private async getCollaboratorRow(
    projectId: string,
    collaboratorId: string,
  ): Promise<CollaboratorRow> {
    const { data: row, error } = await this.supabase
      .from('project_collaborators')
      .select('*')
      .eq('id', collaboratorId)
      .eq('project_id', projectId)
      .maybeSingle<CollaboratorRow>();
    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch collaborator: ${error.message}`,
      );
    }
    if (!row) {
      throw new NotFoundException('Collaborator not found');
    }
    return row;
  }

  private async getPendingInvitation(
    invitationId: string,
    userId: string,
  ): Promise<CollaboratorRow> {
    const { data: row, error } = await this.supabase
      .from('project_collaborators')
      .select('*')
      .eq('id', invitationId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle<CollaboratorRow>();
    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch invitation: ${error.message}`,
      );
    }
    if (!row) {
      throw new NotFoundException('Invitation not found');
    }
    return row;
  }

  private async toItems(rows: CollaboratorRow[]): Promise<CollaboratorItem[]> {
    if (rows.length === 0) return [];
    const userMap = await this.getNames(
      'users',
      rows.map((r) => r.user_id),
      'username',
      'display_name',
      'avatar_url',
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      permissionLevel: r.permission_level,
      status: r.status,
      respondedAt: r.responded_at,
      invitedBy: r.invited_by,
      createdAt: r.created_at,
      user: {
        id: r.user_id,
        username: userMap.get(`${r.user_id}:username`) ?? null,
        displayName: userMap.get(`${r.user_id}:display_name`) ?? null,
        avatarUrl: userMap.get(`${r.user_id}:avatar_url`) ?? null,
      },
    }));
  }

  /** Map `${id}:${field}` → value for the given user ids. */
  private async getNames(
    table: 'users' | 'projects',
    ids: string[],
    ...fields: string[]
  ): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return map;
    const select = ['id', ...fields].join(', ');
    const { data, error } = await this.supabase
      .from(table)
      .select(select)
      .in('id', unique);
    if (error) {
      throw new InternalServerErrorException(
        `Failed to look up ${table}: ${error.message}`,
      );
    }
    for (const row of (data ?? []) as unknown as Array<
      Record<string, unknown>
    >) {
      for (const field of fields) {
        map.set(
          `${String(row.id)}:${field}`,
          (row[field] as string | null | undefined) ?? null,
        );
      }
    }
    return map;
  }

  private async getUserName(userId: string): Promise<string | null> {
    const map = await this.getNames('users', [userId], 'display_name');
    return map.get(`${userId}:display_name`) ?? null;
  }

  private async getProjectName(projectId: string): Promise<string> {
    const map = await this.getNames('projects', [projectId], 'name');
    return map.get(`${projectId}:name`) ?? '';
  }

  /**
   * Notification emission point.
   *
   * NotificationsService (Trí, UC-80) is not in the repo yet, so this is
   * the single seam to swap: one `notify(userId, type, payload)` call with
   * the payload columns already populated per docs/team-workload.md.
   */
  private emitNotification(args: {
    userId: string;
    type: string;
    payload: Record<string, unknown>;
  }): void {
    // TODO(Trí UC-80): replace with
    //   notificationsService.notify(args.userId, args.type, args.payload)
    // and inject NotificationsService into this module's imports.
    console.warn(
      '[collaboration] notify',
      args.type,
      args.userId,
      args.payload,
    );
  }
}
