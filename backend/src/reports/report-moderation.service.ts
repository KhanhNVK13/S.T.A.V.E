import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MODERATION_DEFAULT_RETENTION_DAYS,
  type DismissReportsResponse,
  type RemoveReportedProjectResponse,
  type ReportRemovalContext,
  type RestoreProjectResponse,
} from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import {
  extractSoundIds,
  resolveRetentionDays,
  retainUntilFrom,
} from './reports.logic';
import type { RemoveProjectDto } from './dto/remove-project.dto';
import type { DismissReportsDto } from './dto/dismiss-reports.dto';

export const RETENTION_SETTING_KEY = 'moderation_retention_days';
const NOTIFY_BATCH_SIZE = 20;

interface ProjectRef {
  id: string;
  owner_id: string;
}

interface RemoveRow {
  o_owner_id: string;
  o_project_name: string;
  o_reporter_ids: string[] | null;
  o_file_urls: string[] | null;
  o_closed_count: number;
}

interface DismissRow {
  o_status: 'dismissed' | 'stale' | 'none';
  o_project_name: string;
  o_reporter_ids: string[] | null;
  o_pending_ids: string[] | null;
}

interface RestoreRow {
  o_status: 'restored' | 'not_removed' | 'expired';
  o_owner_id: string;
  o_project_name: string;
}

const SOUND_INDEX_PAGE_SIZE = 500;
const SOUND_INDEX_MAX_PAGES = 200;

@Injectable()
export class ReportModerationService {
  private readonly logger = new Logger(ReportModerationService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly notifications: NotificationsService,
    private readonly settings: PlatformSettingsService,
    private readonly customSounds: CustomSoundsService,
  ) {}

  async getRemovalContext(projectId: string): Promise<ReportRemovalContext> {
    const project = await this.loadProject(projectId);
    if (!(await this.countOpenReports(projectId))) {
      throw new ForbiddenException('This project has no open reports');
    }
    return this.buildContext(project);
  }

  private async loadProject(projectId: string): Promise<ProjectRef> {
    const { data: project, error } = await this.supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .maybeSingle<ProjectRef>();
    if (error) {
      this.logger.error(`Could not read project: ${error.message}`);
      throw new InternalServerErrorException('Could not load removal details');
    }
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async countOpenReports(projectId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'pending');
    if (error) {
      this.logger.error(`Could not count reports: ${error.message}`);
      throw new InternalServerErrorException('Could not load removal details');
    }
    return count ?? 0;
  }

  private async buildContext(
    project: ProjectRef,
  ): Promise<ReportRemovalContext> {
    const projectId = project.id;
    const { count, error: forkError } = await this.supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('forked_from_project_id', projectId);
    if (forkError) {
      this.logger.error(`Could not count forks: ${forkError.message}`);
      throw new InternalServerErrorException('Could not load removal details');
    }

    const soundIds = await this.collectSoundIds(projectId);
    let sounds: { id: string; name: string }[] = [];
    if (soundIds.length > 0) {
      const { data, error: soundError } = await this.supabase
        .from('custom_sounds')
        .select('id, name')
        .eq('owner_id', project.owner_id)
        .in('id', soundIds)
        .returns<{ id: string; name: string }[]>();
      if (soundError) {
        this.logger.error(`Could not read sounds: ${soundError.message}`);
        throw new InternalServerErrorException(
          'Could not load removal details',
        );
      }
      sounds = data ?? [];
    }

    return {
      forkCount: count ?? 0,
      sounds,
      retentionDays: await this.getRetentionDays(),
    };
  }

  async removeProject(
    adminId: string,
    projectId: string,
    dto: RemoveProjectDto,
  ): Promise<RemoveReportedProjectResponse> {
    await this.assertSoundsBelongToProject(projectId, dto.removeSoundIds);
    const { data, error } = await this.supabase.rpc(
      'admin_remove_reported_project',
      {
        p_admin_id: adminId,
        p_project_id: projectId,
        p_reason: dto.reason,
        p_policy: dto.policy,
        p_sound_ids: dto.removeSoundIds ?? [],
      },
    );
    if (error) this.failRemove(error.message);
    const row = (data as RemoveRow[] | null)?.[0];
    if (!row) {
      throw new InternalServerErrorException('Could not remove project');
    }

    const removedFiles = row.o_file_urls ?? [];
    const removedSounds = removedFiles.length;
    const files = removedFiles.filter(Boolean);
    if (files.length > 0) await this.removeSoundFiles(projectId, files);

    await this.notifications.notify(
      row.o_owner_id,
      'moderation.project_removed',
      {
        projectName: row.o_project_name,
        reason: dto.reason,
        projectId,
      },
    );
    await this.notifyReporters(row.o_reporter_ids, row.o_project_name);

    const days = await this.getRetentionDays();
    return {
      closedReports: row.o_closed_count,
      removedSounds,
      retainUntil: retainUntilFrom(new Date().toISOString(), days),
    };
  }

  async dismissReports(
    adminId: string,
    projectId: string,
    dto: DismissReportsDto,
  ): Promise<DismissReportsResponse> {
    const { data, error } = await this.supabase.rpc('admin_dismiss_reports', {
      p_admin_id: adminId,
      p_project_id: projectId,
      p_report_ids: dto.reportIds,
      p_note: dto.reason,
    });
    if (error) {
      if (error.message.includes('PROJECT_NOT_FOUND')) {
        throw new NotFoundException('Project not found');
      }
      this.logger.error(`admin_dismiss_reports failed: ${error.message}`);
      throw new InternalServerErrorException('Could not dismiss reports');
    }
    const row = (data as DismissRow[] | null)?.[0];
    if (!row) {
      throw new InternalServerErrorException('Could not dismiss reports');
    }
    if (row.o_status !== 'dismissed') {
      throw new ConflictException({
        message: 'The open reports for this project changed',
        code: 'REPORTS_CHANGED',
        pendingReportIds: row.o_pending_ids ?? [],
      });
    }

    await this.notifyReporters(row.o_reporter_ids, row.o_project_name);
    return { dismissed: (row.o_pending_ids ?? []).length };
  }

  async restoreProject(
    adminId: string,
    projectId: string,
  ): Promise<RestoreProjectResponse> {
    const days = await this.getRetentionDays();
    const { data, error } = await this.supabase.rpc('admin_restore_project', {
      p_admin_id: adminId,
      p_project_id: projectId,
      p_retention_days: days,
    });
    if (error) {
      if (error.message.includes('PROJECT_NOT_FOUND')) {
        throw new NotFoundException('Project not found');
      }
      this.logger.error(`admin_restore_project failed: ${error.message}`);
      throw new InternalServerErrorException('Could not restore project');
    }
    const row = (data as RestoreRow[] | null)?.[0];
    if (!row) {
      throw new InternalServerErrorException('Could not restore project');
    }
    if (row.o_status === 'not_removed') {
      throw new ConflictException('This project is not removed');
    }
    if (row.o_status === 'expired') {
      throw new GoneException(
        'The retention period for this project has ended',
      );
    }

    await this.notifications.notify(
      row.o_owner_id,
      'moderation.project_restored',
      { projectName: row.o_project_name, projectId },
    );
    return { restored: true };
  }

  async getRetentionDays(): Promise<number> {
    const value = await this.settings.get<unknown>(
      RETENTION_SETTING_KEY,
      MODERATION_DEFAULT_RETENTION_DAYS,
    );
    return resolveRetentionDays(value, MODERATION_DEFAULT_RETENTION_DAYS);
  }

  private async assertSoundsBelongToProject(
    projectId: string,
    soundIds: string[] | undefined,
  ): Promise<void> {
    if (!soundIds || soundIds.length === 0) return;
    const project = await this.loadProject(projectId);
    if (!(await this.countOpenReports(projectId))) {
      throw new ConflictException('This project has no open reports');
    }
    const context = await this.buildContext(project);
    const allowed = new Set(context.sounds.map((sound) => sound.id));
    if (soundIds.some((id) => !allowed.has(id))) {
      throw new BadRequestException('Some sounds are not used by this project');
    }
  }

  private failRemove(message: string): never {
    if (message.includes('PROJECT_NOT_FOUND')) {
      throw new NotFoundException('Project not found');
    }
    if (message.includes('ALREADY_REMOVED')) {
      throw new ConflictException('This project is already removed');
    }
    if (message.includes('NO_OPEN_REPORTS')) {
      throw new ConflictException('This project has no open reports');
    }
    this.logger.error(`admin_remove_reported_project failed: ${message}`);
    throw new InternalServerErrorException('Could not remove project');
  }

  private async notifyReporters(
    reporterIds: string[] | null,
    projectName: string,
  ): Promise<void> {
    const ids = reporterIds ?? [];
    for (let i = 0; i < ids.length; i += NOTIFY_BATCH_SIZE) {
      const batch = ids.slice(i, i + NOTIFY_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((reporterId) =>
          this.notifications.notify(reporterId, 'report.reviewed', {
            projectName,
          }),
        ),
      );
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length > 0) {
        this.logger.error(
          `Could not notify ${failed.length} of ${batch.length} reporters`,
        );
      }
    }
  }

  private async removeSoundFiles(
    projectId: string,
    files: string[],
  ): Promise<void> {
    try {
      const failed = await this.customSounds.removeFiles(files);
      if (failed.length > 0) {
        this.logger.warn(
          `Project ${projectId}: ${failed.length} sound file(s) stay in Storage and will be collected by the next orphan sweep: ${failed.join(', ')}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Project ${projectId}: could not remove sound files, the next orphan sweep will collect them: ${String(err)}`,
      );
    }
    try {
      await this.customSounds.collectGarbage();
    } catch (err) {
      this.logger.error(`Orphan sweep failed: ${String(err)}`);
    }
  }

  private async collectSoundIds(projectId: string): Promise<string[]> {
    const { data: branches, error: branchError } = await this.supabase
      .from('branches')
      .select('id, head_commit_id')
      .eq('project_id', projectId)
      .returns<{ id: string; head_commit_id: string | null }[]>();
    if (branchError) {
      this.logger.error(`Could not read branches: ${branchError.message}`);
      throw new InternalServerErrorException('Could not load removal details');
    }
    const branchIds = (branches ?? []).map((branch) => branch.id);
    const headIds = (branches ?? [])
      .map((branch) => branch.head_commit_id)
      .filter((id): id is string => !!id);

    const snapshots: unknown[] = [];
    if (headIds.length > 0) {
      const { data, error } = await this.supabase
        .from('commits')
        .select('snapshot')
        .in('id', headIds)
        .returns<{ snapshot: unknown }[]>();
      if (error) {
        this.logger.error(`Could not read commits: ${error.message}`);
        throw new InternalServerErrorException(
          'Could not load removal details',
        );
      }
      snapshots.push(...(data ?? []).map((row) => row.snapshot));
    }
    if (branchIds.length > 0) {
      const { data, error } = await this.supabase
        .from('drafts')
        .select('snapshot')
        .in('branch_id', branchIds)
        .returns<{ snapshot: unknown }[]>();
      if (error) {
        this.logger.error(`Could not read drafts: ${error.message}`);
        throw new InternalServerErrorException(
          'Could not load removal details',
        );
      }
      snapshots.push(...(data ?? []).map((row) => row.snapshot));
    }
    const ids = new Set(
      snapshots.flatMap((snapshot) => extractSoundIds(snapshot)),
    );
    for (const id of await this.collectIndexedSoundIds(projectId)) ids.add(id);
    return [...ids];
  }

  private async collectIndexedSoundIds(projectId: string): Promise<string[]> {
    const ids = new Set<string>();
    let after: string | null = null;
    for (let page = 0; page < SOUND_INDEX_MAX_PAGES; page += 1) {
      const { data, error } = await this.supabase.rpc('sound_mappings_page', {
        p_project_id: projectId,
        p_limit: SOUND_INDEX_PAGE_SIZE,
        p_after: after,
      });
      if (error) {
        this.logger.error(`Could not read sound index: ${error.message}`);
        throw new InternalServerErrorException(
          'Could not load removal details',
        );
      }
      const rows = (data ?? []) as {
        o_id: string;
        o_custom_sound_id: string | null;
      }[];
      for (const row of rows) {
        if (row.o_custom_sound_id) ids.add(row.o_custom_sound_id);
      }
      if (rows.length < SOUND_INDEX_PAGE_SIZE) return [...ids];
      after = rows[rows.length - 1].o_id;
    }
    this.logger.error(
      `Sound index of project ${projectId} exceeds ${SOUND_INDEX_MAX_PAGES} pages`,
    );
    throw new InternalServerErrorException('Could not load removal details');
  }
}
