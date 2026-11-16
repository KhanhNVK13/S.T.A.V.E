import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminReportListResponse,
  DismissReportsConflict,
  DismissReportsResponse,
  ReportDetail,
  ReportGroup,
  ReportPreview,
  ReportResolution,
  ReportStatusFilter,
} from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import type { DismissReportsDto } from './dto/dismiss-reports.dto';
import {
  mapStatusFilter,
  summarizeSnapshot,
  toReportReason,
} from './reports.logic';
import { isWithinRetention, retainedUntil } from './moderation-removal.logic';

const MODERATION_RETENTION_KEY = 'moderation_retention_days';
const MODERATION_RETENTION_DEFAULT = 30;

export const MAX_DETAIL_REPORTS = 500;

export interface ListGroupsParams {
  status: ReportStatusFilter;
  page: number;
  limit: number;
}

interface GroupRpcRow {
  project_id: string | null;
  report_count: number;
  latest_at: string;
  reasons: { reason: string; count: number }[] | null;
  resolution: ReportResolution | null;
  resolution_note: string | null;
  resolved_at: string | null;
  total_groups: number | string;
}

interface ProjectNameRow {
  id: string;
  name: string;
  owner_id: string;
  moderation_hidden_at: string | null;
}

interface UserNameRow {
  id: string;
  display_name: string | null;
}

interface ReportDetailRow {
  id: string;
  reason: string;
  details: string | null;
  created_at: string;
  status: 'pending' | 'resolved';
  resolution: ReportResolution | null;
  reporter_id: string | null;
}

interface PreviewProjectRow {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
}

@Injectable()
export class AdminReportsService {
  private readonly logger = new Logger(AdminReportsService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly notifications: NotificationsService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async listGroups(params: ListGroupsParams): Promise<AdminReportListResponse> {
    const { page, limit } = params;
    const filter = mapStatusFilter(params.status);
    const offset = (page - 1) * limit;

    const rows = await this.callGroups(filter, limit, offset);

    if (rows.length === 0) {
      const total = page > 1 ? await this.countGroups(filter) : 0;
      return { items: [], total, page, limit };
    }

    const projectIds = [
      ...new Set(
        rows.map((row) => row.project_id).filter((id): id is string => !!id),
      ),
    ];
    const projects = await this.loadProjects(projectIds);
    const owners = await this.loadUserNames(
      [...new Set([...projects.values()].map((project) => project.owner_id))],
      'owner',
    );

    // The "removed" (upheld) tab shows the retention window; the other tabs do
    // not, so only read the setting when we are listing those projects.
    const retentionDays =
      params.status === 'upheld'
        ? await this.platformSettings.get<number>(
            MODERATION_RETENTION_KEY,
            MODERATION_RETENTION_DEFAULT,
          )
        : null;

    const now = new Date();
    const items = rows.map((row): ReportGroup => {
      const project = row.project_id ? projects.get(row.project_id) : undefined;
      const group: ReportGroup = {
        projectId: row.project_id,
        projectName: project?.name ?? null,
        projectExists: project !== undefined,
        ownerDisplayName: project
          ? (owners.get(project.owner_id) ?? null)
          : null,
        reportCount: row.report_count,
        reasons: (row.reasons ?? []).map((entry) => ({
          reason: toReportReason(entry.reason),
          count: entry.count,
        })),
        latestAt: row.latest_at,
      };
      if (row.resolution) {
        group.resolution = row.resolution;
        group.resolutionNote = row.resolution_note;
        group.resolvedAt = row.resolved_at;
      }
      if (retentionDays !== null && project?.moderation_hidden_at) {
        const hiddenAt = project.moderation_hidden_at;
        group.hiddenAt = hiddenAt;
        group.retainedUntil = retainedUntil(
          hiddenAt,
          retentionDays,
        ).toISOString();
        group.restorable = isWithinRetention(now, hiddenAt, retentionDays);
      }
      return group;
    });

    return { items, total: Number(rows[0].total_groups), page, limit };
  }

  async getDetails(
    projectId: string,
    status: ReportStatusFilter,
  ): Promise<ReportDetail[]> {
    const filter = mapStatusFilter(status);

    let query = this.supabase
      .from('reports')
      .select(
        'id, reason, details, created_at, status, resolution, reporter_id',
      )
      .eq('project_id', projectId)
      .eq('status', filter.status);
    if (filter.resolution) {
      query = query.eq('resolution', filter.resolution);
    }
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(0, MAX_DETAIL_REPORTS - 1)
      .returns<ReportDetailRow[]>();

    if (error) {
      this.logger.error(`Could not read reports: ${error.message}`);
      throw new InternalServerErrorException('Could not load reports');
    }

    const rows = data ?? [];
    const reporters = await this.loadUserNames(
      [
        ...new Set(
          rows.map((row) => row.reporter_id).filter((id): id is string => !!id),
        ),
      ],
      'reporter',
    );

    return rows.map((row): ReportDetail => ({
      id: row.id,
      reason: toReportReason(row.reason),
      details: row.details,
      createdAt: row.created_at,
      reporter: row.reporter_id
        ? {
            id: row.reporter_id,
            displayName: reporters.get(row.reporter_id) ?? null,
          }
        : null,
      status: row.status,
      resolution: row.resolution,
    }));
  }

  async dismissReports(
    adminId: string,
    projectId: string,
    dto: DismissReportsDto,
  ): Promise<DismissReportsResponse> {
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('A reason is required');

    const requestedIds = [...new Set(dto.reportIds)];
    if (requestedIds.length === 0) {
      throw new BadRequestException('At least one report is required');
    }

    const { data: pendingRows, error: pendingError } = await this.supabase
      .from('reports')
      .select('id, reporter_id')
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .returns<{ id: string; reporter_id: string | null }[]>();
    if (pendingError) {
      this.logger.error(`Could not read pending reports: ${pendingError.message}`);
      throw new InternalServerErrorException('Could not dismiss reports');
    }

    const pendingIds = new Set((pendingRows ?? []).map((row) => row.id));
    // 5.E1: pending reports missing from the submitted list are NEW reports —
    // surface them so the UI re-reviews instead of dismissing stale rows.
    const newIds = (pendingRows ?? [])
      .map((row) => row.id)
      .filter((id) => !requestedIds.includes(id));
    if (newIds.length > 0) {
      const body: DismissReportsConflict = {
        message: 'New reports were received; review the list again',
        reportIds: newIds,
      };
      throw new ConflictException(body);
    }
    if (requestedIds.some((id) => !pendingIds.has(id))) {
      throw new ConflictException('Some selected reports are no longer open');
    }

    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .maybeSingle<{ name: string }>();
    if (projectError) {
      this.logger.error(`Could not read reported project: ${projectError.message}`);
      throw new InternalServerErrorException('Could not dismiss reports');
    }
    if (!project) throw new NotFoundException('Project not found');

    // 5.E2: the report update is the source of truth. If it fails, every row
    // stays pending and we surface 500 before recording the outcome.
    const resolvedAt = new Date().toISOString();
    const { error: updateError } = await this.supabase
      .from('reports')
      .update({
        status: 'resolved',
        resolution: 'dismissed',
        resolution_note: reason,
        resolved_by: adminId,
        resolved_at: resolvedAt,
      })
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .in('id', requestedIds);
    if (updateError) {
      this.logger.error(`Could not dismiss reports: ${updateError.message}`);
      throw new InternalServerErrorException('Could not dismiss reporters');
    }

    // Best-effort follow-up (matches the moderation-removal convention): the
    // reports are already closed, so a notification/audit hiccup must not
    // undo the mutation or masquerade it as a failure.
    for (const row of pendingRows ?? []) {
      if (requestedIds.includes(row.id) && row.reporter_id) {
        await this.notifications.notify(row.reporter_id, 'report.reviewed', {
          projectName: project.name,
        });
      }
    }
    await this.writeDismissAudit(adminId, projectId, reason);

    return { dismissed: requestedIds.length };
  }

  async getPreview(projectId: string): Promise<ReportPreview> {
    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .select('id, name, description, genre')
      .eq('id', projectId)
      .maybeSingle<PreviewProjectRow>();
    if (projectError) {
      this.logger.error(`Could not read project: ${projectError.message}`);
      throw new InternalServerErrorException('Could not load project preview');
    }
    if (!project) throw new NotFoundException('Project not found');

    const { count, error: countError } = await this.supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', mapStatusFilter('open').status);
    if (countError) {
      this.logger.error(`Could not count open reports: ${countError.message}`);
      throw new InternalServerErrorException('Could not load project preview');
    }
    if (!count) {
      throw new ForbiddenException('This project has no open reports');
    }

    const header = {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        genre: project.genre,
      },
    };
    const snapshot = await this.loadHeadSnapshot(projectId);
    if (snapshot === undefined) {
      return {
        ...header,
        hasCommit: false,
        trackCount: 0,
        noteCount: 0,
        tracks: [],
      };
    }
    return { ...header, hasCommit: true, ...summarizeSnapshot(snapshot) };
  }

  private async loadHeadSnapshot(projectId: string): Promise<unknown> {
    const { data: branch, error: branchError } = await this.supabase
      .from('branches')
      .select('head_commit_id')
      .eq('project_id', projectId)
      .eq('is_default', true)
      .maybeSingle<{ head_commit_id: string | null }>();
    if (branchError) {
      this.logger.error(
        `Could not read default branch: ${branchError.message}`,
      );
      throw new InternalServerErrorException('Could not load project preview');
    }
    if (!branch?.head_commit_id) return undefined;

    const { data: commit, error: commitError } = await this.supabase
      .from('commits')
      .select('snapshot')
      .eq('id', branch.head_commit_id)
      .maybeSingle<{ snapshot: unknown }>();
    if (commitError) {
      this.logger.error(`Could not read head commit: ${commitError.message}`);
      throw new InternalServerErrorException('Could not load project preview');
    }
    return commit ? commit.snapshot : undefined;
  }

  private async callGroups(
    filter: ReturnType<typeof mapStatusFilter>,
    limit: number,
    offset: number,
  ): Promise<GroupRpcRow[]> {
    const { data, error } = await this.supabase.rpc('admin_report_groups', {
      p_status: filter.status,
      p_resolution: filter.resolution ?? null,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) {
      this.logger.error(`admin_report_groups failed: ${error.message}`);
      throw new InternalServerErrorException('Could not load reports');
    }
    return (data ?? []) as GroupRpcRow[];
  }

  private async countGroups(
    filter: ReturnType<typeof mapStatusFilter>,
  ): Promise<number> {
    const rows = await this.callGroups(filter, 1, 0);
    return rows.length > 0 ? Number(rows[0].total_groups) : 0;
  }

  private async writeDismissAudit(
    adminId: string,
    projectId: string,
    reason: string,
  ): Promise<void> {
    try {
      const { error } = await this.supabase.from('admin_audit_log').insert({
        admin_id: adminId,
        action: 'report.dismiss',
        target_type: 'project',
        target_id: projectId,
        reason,
      });
      if (error) {
        this.logger.error(`Could not write dismiss audit: ${error.message}`);
      }
    } catch (err) {
      this.logger.error(`Could not write dismiss audit: ${String(err)}`);
    }
  }

  private async loadProjects(
    ids: string[],
  ): Promise<Map<string, ProjectNameRow>> {
    if (ids.length === 0) return new Map();
    const { data, error } = await this.supabase
      .from('projects')
      .select('id, name, owner_id')
      .in('id', ids)
      .returns<ProjectNameRow[]>();
    if (error) {
      this.logger.error(`Could not read reported projects: ${error.message}`);
      throw new InternalServerErrorException('Could not load reports');
    }
    return new Map((data ?? []).map((row) => [row.id, row]));
  }

  private async loadUserNames(
    ids: string[],
    purpose: string,
  ): Promise<Map<string, string | null>> {
    if (ids.length === 0) return new Map();
    const { data, error } = await this.supabase
      .from('users')
      .select('id, display_name')
      .in('id', ids)
      .returns<UserNameRow[]>();
    if (error) {
      this.logger.error(`Could not read ${purpose} names: ${error.message}`);
      throw new InternalServerErrorException('Could not load reports');
    }
    return new Map((data ?? []).map((row) => [row.id, row.display_name]));
  }
}
