import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  RemovalImpact,
  RemoveProjectResult,
  RestoreProjectResponse,
} from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { RemoveProjectDto } from './dto/remove-project.dto';
import {
  isWithinRetention,
  retainedUntil,
  splitSoundsToRemove,
  validateRemoveBody,
} from './moderation-removal.logic';

interface ProjectRow {
  id: string;
  name: string;
  owner_id: string;
  moderation_hidden_at: string | null;
}

interface OwnerSoundRow {
  sound_id: string;
  sound_name: string | null;
}

@Injectable()
export class ModerationRemovalService {
  private readonly logger = new Logger(ModerationRemovalService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly customSounds: CustomSoundsService,
    private readonly notifications: NotificationsService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async getRemovalImpact(projectId: string): Promise<RemovalImpact> {
    // 404s when the project does not exist; the RPC below assumes it does.
    await this.loadProject(projectId);
    const retentionDays = await this.platformSettings.get<number>(
      'moderation_retention_days',
      30,
    );
    const forkCount = await this.countForks(projectId);
    const ownerSounds = await this.loadOwnerSounds(projectId);

    return {
      forkCount,
      retentionDays,
      ownerSounds,
    };
  }

  async removeProject(
    adminId: string,
    projectId: string,
    dto: RemoveProjectDto,
  ): Promise<RemoveProjectResult> {
    const validated = validateRemoveBody(dto);
    if (!validated.ok) {
      throw new BadRequestException(validated.errors);
    }
    const { reason, policy, removeSoundIds } = validated.body!;

    const project = await this.loadProject(projectId);
    if (project.moderation_hidden_at) {
      throw new ConflictException('This project has already been removed');
    }

    const ownerSounds = await this.loadOwnerSounds(projectId);
    const { accepted, rejected } = splitSoundsToRemove(
      removeSoundIds,
      ownerSounds.map((sound) => sound.id),
    );
    if (rejected.length > 0) {
      throw new BadRequestException(
        'Some selected sounds do not belong to this project',
      );
    }

    const rpcResult = await this.callRemoveRpc(adminId, projectId, reason);
    if (rpcResult.status === 'not_removable') {
      throw new ConflictException('This project has already been removed');
    }

    const retentionDays = await this.platformSettings.get<number>(
      'moderation_retention_days',
      30,
    );
    const hiddenAt = new Date(rpcResult.hiddenAt);
    const retainedUntilDate = retainedUntil(hiddenAt, retentionDays);

    await this.writeAudit(
      adminId,
      projectId,
      'project.remove',
      `${reason} [${policy}]`,
    );
    await this.notifyOwner(project, reason, retainedUntilDate);

    const soundResults = await this.deleteSounds(project.owner_id, accepted);

    return {
      hiddenAt: hiddenAt.toISOString(),
      retainedUntil: retainedUntilDate.toISOString(),
      closedReports: rpcResult.closedReports,
      soundResults,
    };
  }

  async restoreProject(
    adminId: string,
    projectId: string,
    reason: string,
  ): Promise<RestoreProjectResponse> {
    const trimmed = (reason ?? '').trim();
    if (trimmed.length < 1) {
      throw new BadRequestException('A reason is required');
    }

    const project = await this.loadProject(projectId);
    if (!project.moderation_hidden_at) {
      throw new ConflictException('This project is not currently removed');
    }

    const retentionDays = await this.platformSettings.get<number>(
      'moderation_retention_days',
      30,
    );
    if (
      !isWithinRetention(
        new Date(),
        project.moderation_hidden_at,
        retentionDays,
      )
    ) {
      throw new GoneException('The restoration deadline has passed');
    }

    const rpcResult = await this.callRestoreRpc(adminId, projectId);
    if (rpcResult.status !== 'restored') {
      throw new ConflictException('This project is not currently removed');
    }

    await this.writeAudit(adminId, projectId, 'project.restore', trimmed);
    await this.notifications.notify(
      project.owner_id,
      'moderation.project_restored',
      {
        projectName: project.name,
      },
    );

    return { restored: true };
  }

  private async loadProject(projectId: string): Promise<ProjectRow> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('id, name, owner_id, moderation_hidden_at')
      .eq('id', projectId)
      .maybeSingle<ProjectRow>();
    if (error) {
      this.logger.error(`Could not read project: ${error.message}`);
      throw new InternalServerErrorException('Could not load project');
    }
    if (!data) throw new NotFoundException('Project not found');
    return data;
  }

  private async countForks(projectId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('forked_from_project_id', projectId);
    if (error) {
      this.logger.error(`Could not count forks: ${error.message}`);
      return 0;
    }
    return count ?? 0;
  }

  private async loadOwnerSounds(
    projectId: string,
  ): Promise<{ id: string; name: string | null }[]> {
    const { data, error } = await this.supabase.rpc(
      'moderation_project_owner_sound_ids',
      { p_project_id: projectId },
    );
    if (error) {
      this.logger.error(`Could not load owner sounds: ${error.message}`);
      throw new InternalServerErrorException('Could not load project');
    }
    return ((data ?? []) as OwnerSoundRow[]).map((row) => ({
      id: row.sound_id,
      name: row.sound_name,
    }));
  }

  private async callRemoveRpc(
    adminId: string,
    projectId: string,
    reason: string,
  ): Promise<{ status: string; closedReports: number; hiddenAt: string }> {
    const { data, error } = await this.supabase.rpc(
      'moderation_remove_project',
      { p_admin_id: adminId, p_project_id: projectId, p_reason: reason },
    );
    if (error) {
      this.logger.error(`moderation_remove_project failed: ${error.message}`);
      throw new InternalServerErrorException('Could not remove project');
    }
    const row = (
      data as { status: string; closed_reports: number; hidden_at: string }[]
    )?.[0];
    if (!row) {
      throw new InternalServerErrorException('Could not remove project');
    }
    return {
      status: row.status,
      closedReports: Number(row.closed_reports),
      hiddenAt: row.hidden_at,
    };
  }

  private async callRestoreRpc(
    adminId: string,
    projectId: string,
  ): Promise<{ status: string }> {
    const { data, error } = await this.supabase.rpc(
      'moderation_restore_project',
      { p_admin_id: adminId, p_project_id: projectId },
    );
    if (error) {
      this.logger.error(`moderation_restore_project failed: ${error.message}`);
      throw new InternalServerErrorException('Could not restore project');
    }
    const row = (data as { status: string }[])?.[0];
    if (!row) {
      throw new InternalServerErrorException('Could not restore project');
    }
    return { status: row.status };
  }

  private async deleteSounds(
    ownerId: string,
    soundIds: string[],
  ): Promise<RemoveProjectResult['soundResults']> {
    const results: RemoveProjectResult['soundResults'] = [];
    for (const soundId of soundIds) {
      try {
        const outcome = await this.customSounds.delete(
          ownerId,
          soundId,
          'hard',
        );
        results.push({ id: soundId, removed: outcome.removed });
      } catch (err) {
        this.logger.error(`Could not delete sound ${soundId}: ${String(err)}`);
        results.push({
          id: soundId,
          removed: false,
          error: 'Could not delete sound',
        });
      }
    }
    return results;
  }

  private async notifyOwner(
    project: ProjectRow,
    reason: string,
    retainedUntilDate: Date,
  ): Promise<void> {
    try {
      await this.notifications.notify(
        project.owner_id,
        'moderation.project_removed',
        {
          projectName: project.name,
          reason,
          retainedUntil: retainedUntilDate.toISOString(),
        },
      );
    } catch (err) {
      this.logger.error(`Could not notify owner of removal: ${String(err)}`);
    }
  }

  private async writeAudit(
    adminId: string,
    projectId: string,
    action: string,
    reason: string,
  ): Promise<void> {
    try {
      const { error } = await this.supabase.from('admin_audit_log').insert({
        admin_id: adminId,
        action,
        target_type: 'project',
        target_id: projectId,
        reason,
      });
      if (error) {
        this.logger.error(
          `Could not write audit entry ${action} for ${projectId}: ${error.message}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Could not write audit entry ${action} for ${projectId}: ${String(err)}`,
      );
    }
  }
}
