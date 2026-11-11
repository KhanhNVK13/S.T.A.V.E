import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DismissReportsResponse } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { NotificationsService } from '../notifications/notifications.service';
import type { DismissReportsDto } from './dto/dismiss-reports.dto';
import { diffReportIds } from './reports.logic';

const MAX_PENDING_READ = 1000;

interface DismissedRow {
  id: string;
  reporter_id: string | null;
}

@Injectable()
export class ReportDismissService {
  private readonly logger = new Logger(ReportDismissService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly notifications: NotificationsService,
  ) {}

  async dismiss(
    adminId: string,
    projectId: string,
    dto: DismissReportsDto,
  ): Promise<DismissReportsResponse> {
    const reason = dto.reason?.trim() ?? '';
    if (!reason) throw new BadRequestException('A reason is required');
    const reportIds = [...new Set(dto.reportIds)];

    const projectName = await this.loadProjectName(projectId);
    const pendingIds = await this.loadPendingIds(projectId);

    const { extra, missing } = diffReportIds(reportIds, pendingIds);
    if (extra.length > 0) {
      throw new ConflictException({
        message:
          'New reports were filed for this project. Review them before dismissing.',
        newReportIds: extra,
      });
    }
    if (missing.length > 0) {
      throw new ConflictException({
        message: 'Some selected reports are no longer open for this project.',
        newReportIds: [],
      });
    }

    const { data, error } = await this.supabase
      .from('reports')
      .update({
        status: 'resolved',
        resolution: 'dismissed',
        resolution_note: reason,
        resolved_by: adminId,
        resolved_at: new Date().toISOString(),
      })
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .in('id', reportIds)
      .select('id, reporter_id')
      .returns<DismissedRow[]>();

    if (error) {
      this.logger.error(`Could not dismiss reports: ${error.message}`);
      throw new InternalServerErrorException('Could not dismiss reports');
    }

    const changed = data ?? [];
    if (changed.length !== reportIds.length) {
      this.logger.warn(
        `Dismiss for project ${projectId} changed ${changed.length} of ${reportIds.length} reports`,
      );
      throw new ConflictException({
        message:
          'Reports changed while you were reviewing. Reload and review again.',
        newReportIds: [],
      });
    }

    await this.writeAuditLog(adminId, projectId, reason);
    await this.notifyReporters(changed, projectName);

    return { dismissedCount: changed.length };
  }

  private async loadProjectName(projectId: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .maybeSingle<{ id: string; name: string }>();
    if (error) {
      this.logger.error(`Could not read project: ${error.message}`);
      throw new InternalServerErrorException('Could not dismiss reports');
    }
    if (!data) throw new NotFoundException('Project not found');
    return data.name;
  }

  private async loadPendingIds(projectId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('reports')
      .select('id')
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .range(0, MAX_PENDING_READ - 1)
      .returns<{ id: string }[]>();
    if (error) {
      this.logger.error(`Could not read pending reports: ${error.message}`);
      throw new InternalServerErrorException('Could not dismiss reports');
    }
    return (data ?? []).map((row) => row.id);
  }

  private async writeAuditLog(
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
        this.logger.error(
          `Could not write audit entry report.dismiss for ${projectId}: ${error.message}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Could not write audit entry report.dismiss for ${projectId}: ${String(err)}`,
      );
    }
  }

  private async notifyReporters(
    rows: DismissedRow[],
    projectName: string,
  ): Promise<void> {
    const reporterIds = [
      ...new Set(
        rows
          .map((row) => row.reporter_id)
          .filter((id): id is string => id !== null),
      ),
    ];
    await Promise.all(
      reporterIds.map(async (reporterId) => {
        try {
          await this.notifications.notify(reporterId, 'report.reviewed', {
            projectName,
          });
        } catch (err) {
          this.logger.error(
            `Could not notify reporter about report.reviewed: ${String(err)}`,
          );
        }
      }),
    );
  }
}
