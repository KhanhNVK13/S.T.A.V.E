import {
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
  AppealListResponse,
  AppealStatus,
  CopyrightForkInfo,
  ModerationAppeal,
  RemovedProject,
} from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { ReportModerationService } from './report-moderation.service';
import { retainUntilFrom } from './reports.logic';

const UNIQUE_VIOLATION = '23505';
const ADMIN_NOTIFY_LIMIT = 50;

interface RemovedProjectRow {
  id: string;
  name: string;
  moderation_hidden_at: string;
  moderation_hidden_reason: string | null;
  moderation_policy: string | null;
}

interface AppealRow {
  id: string;
  project_id: string;
  appellant_id: string | null;
  statement: string;
  status: AppealStatus;
  created_at: string;
  resolution_note: string | null;
  resolved_at: string | null;
}

interface ResolveRow {
  o_status: 'upheld' | 'rejected' | 'stale';
  o_appellant_id: string | null;
  o_project_id: string;
  o_project_name: string;
  o_restored_forks: CopyrightForkInfo[] | null;
}

@Injectable()
export class AppealsService {
  private readonly logger = new Logger(AppealsService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly notifications: NotificationsService,
    private readonly moderation: ReportModerationService,
  ) {}

  async listRemoved(ownerId: string): Promise<RemovedProject[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select(
        'id, name, moderation_hidden_at, moderation_hidden_reason, moderation_policy',
      )
      .eq('owner_id', ownerId)
      .not('moderation_hidden_at', 'is', null)
      .order('moderation_hidden_at', { ascending: false })
      .limit(100)
      .returns<RemovedProjectRow[]>();
    if (error) {
      this.logger.error(`Could not read removed projects: ${error.message}`);
      throw new InternalServerErrorException('Could not load removed projects');
    }
    const projects = data ?? [];
    if (projects.length === 0) return [];

    const appeals = await this.loadAppeals(projects.map((p) => p.id));
    const days = await this.moderation.getRetentionDays();
    const now = Date.now();

    return projects.map((project): RemovedProject => {
      const deadline = retainUntilFrom(project.moderation_hidden_at, days);
      const current = appeals.get(project.id);
      const appeal =
        current &&
        new Date(current.created_at) >= new Date(project.moderation_hidden_at)
          ? current
          : undefined;
      return {
        projectId: project.id,
        name: project.name,
        reason: project.moderation_hidden_reason,
        policy: project.moderation_policy,
        removedAt: project.moderation_hidden_at,
        appealDeadline: deadline,
        canAppeal: !appeal && new Date(deadline).getTime() >= now,
        appealStatus: appeal?.status ?? null,
        appealNote: appeal?.resolution_note ?? null,
      };
    });
  }

  async createAppeal(
    userId: string,
    projectId: string,
    statement: string,
  ): Promise<{ id: string }> {
    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .select(
        'id, name, owner_id, moderation_hidden_at, moderation_hidden_reason, moderation_policy',
      )
      .eq('id', projectId)
      .maybeSingle<RemovedProjectRow & { owner_id: string }>();
    if (projectError) {
      this.logger.error(`Could not read project: ${projectError.message}`);
      throw new InternalServerErrorException('Could not create appeal');
    }
    if (!project || project.owner_id !== userId) {
      throw new NotFoundException('Project not found');
    }
    if (!project.moderation_hidden_at) {
      throw new ConflictException('This project is not removed');
    }

    const days = await this.moderation.getRetentionDays();
    const deadline = retainUntilFrom(project.moderation_hidden_at, days);
    if (new Date(deadline).getTime() < Date.now()) {
      throw new GoneException('The appeal period for this project has ended');
    }

    const previous = (await this.loadAppeals([projectId])).get(projectId);
    if (
      previous &&
      new Date(previous.created_at) >= new Date(project.moderation_hidden_at)
    ) {
      throw new ConflictException('This removal has already been appealed');
    }

    const { data, error } = await this.supabase
      .from('moderation_appeals')
      .insert({
        project_id: projectId,
        appellant_id: userId,
        statement,
        status: 'pending',
      })
      .select('id')
      .single<{ id: string }>();
    if (error?.code === UNIQUE_VIOLATION) {
      throw new ConflictException('This removal has already been appealed');
    }
    if (error || !data) {
      this.logger.error(
        `Could not insert appeal: ${error?.message ?? 'no row returned'}`,
      );
      throw new InternalServerErrorException('Could not create appeal');
    }

    await this.notifyAdmins(project.name);
    return { id: data.id };
  }

  async listAppeals(
    status: AppealStatus,
    page: number,
    limit: number,
  ): Promise<AppealListResponse> {
    const from = (page - 1) * limit;
    const { data, error, count } = await this.supabase
      .from('moderation_appeals')
      .select(
        'id, project_id, appellant_id, statement, status, created_at, resolution_note, resolved_at',
        { count: 'exact' },
      )
      .eq('status', status)
      .order('created_at', { ascending: status === 'pending' })
      .range(from, from + limit - 1)
      .returns<AppealRow[]>();
    if (error) {
      this.logger.error(`Could not read appeals: ${error.message}`);
      throw new InternalServerErrorException('Could not load appeals');
    }
    const rows = data ?? [];

    const projects = await this.loadProjects(rows.map((r) => r.project_id));
    const names = await this.loadDisplayNames(
      rows.flatMap((r) => (r.appellant_id ? [r.appellant_id] : [])),
    );

    const items = rows.map((row): ModerationAppeal => {
      const project = projects.get(row.project_id);
      return {
        id: row.id,
        projectId: row.project_id,
        projectName: project?.name ?? null,
        appellantDisplayName: row.appellant_id
          ? (names.get(row.appellant_id) ?? null)
          : null,
        statement: row.statement,
        status: row.status,
        createdAt: row.created_at,
        removalReason: project?.moderation_hidden_reason ?? null,
        removalPolicy: project?.moderation_policy ?? null,
        resolutionNote: row.resolution_note,
        resolvedAt: row.resolved_at,
      };
    });
    return { items, total: count ?? items.length, page, limit };
  }

  async resolveAppeal(
    adminId: string,
    appealId: string,
    decision: 'uphold' | 'reject',
    note: string,
  ): Promise<{ status: 'upheld' | 'rejected'; restoredForks: number }> {
    const { data, error } = await this.supabase.rpc('admin_resolve_appeal', {
      p_admin_id: adminId,
      p_appeal_id: appealId,
      p_decision: decision,
      p_note: note,
    });
    if (error) {
      if (error.message.includes('APPEAL_NOT_FOUND')) {
        throw new NotFoundException('Appeal not found');
      }
      if (error.message.includes('ALREADY_RESOLVED')) {
        throw new ConflictException('This appeal was already resolved');
      }
      this.logger.error(`admin_resolve_appeal failed: ${error.message}`);
      throw new InternalServerErrorException('Could not resolve appeal');
    }
    const row = (data as ResolveRow[] | null)?.[0];
    if (!row) {
      throw new InternalServerErrorException('Could not resolve appeal');
    }
    if (row.o_status === 'stale') {
      throw new ConflictException('This appeal no longer applies');
    }

    if (row.o_appellant_id) {
      await this.notifications.notify(
        row.o_appellant_id,
        row.o_status === 'upheld'
          ? 'moderation.appeal_upheld'
          : 'moderation.appeal_rejected',
        {
          projectName: row.o_project_name,
          note,
          projectId: row.o_project_id,
        },
      );
    }
    const restoredForks = row.o_restored_forks ?? [];
    await this.moderation.notifyForkOwners(
      restoredForks,
      'moderation.project_restored',
    );
    return { status: row.o_status, restoredForks: restoredForks.length };
  }

  private async loadAppeals(
    projectIds: string[],
  ): Promise<Map<string, AppealRow>> {
    const latest = new Map<string, AppealRow>();
    if (projectIds.length === 0) return latest;
    const { data, error } = await this.supabase
      .from('moderation_appeals')
      .select(
        'id, project_id, appellant_id, statement, status, created_at, resolution_note, resolved_at',
      )
      .in('project_id', projectIds)
      .order('created_at', { ascending: false })
      .limit(500)
      .returns<AppealRow[]>();
    if (error) {
      this.logger.error(`Could not read appeals: ${error.message}`);
      throw new InternalServerErrorException('Could not load appeals');
    }
    for (const row of data ?? []) {
      if (!latest.has(row.project_id)) latest.set(row.project_id, row);
    }
    return latest;
  }

  private async loadProjects(
    ids: string[],
  ): Promise<Map<string, RemovedProjectRow>> {
    const map = new Map<string, RemovedProjectRow>();
    if (ids.length === 0) return map;
    const { data, error } = await this.supabase
      .from('projects')
      .select(
        'id, name, moderation_hidden_at, moderation_hidden_reason, moderation_policy',
      )
      .in('id', ids)
      .returns<RemovedProjectRow[]>();
    if (error) {
      this.logger.error(`Could not read appeal projects: ${error.message}`);
      throw new InternalServerErrorException('Could not load appeals');
    }
    for (const row of data ?? []) map.set(row.id, row);
    return map;
  }

  private async loadDisplayNames(
    ids: string[],
  ): Promise<Map<string, string | null>> {
    const names = new Map<string, string | null>();
    if (ids.length === 0) return names;
    const { data, error } = await this.supabase
      .from('users')
      .select('id, display_name')
      .in('id', [...new Set(ids)])
      .returns<{ id: string; display_name: string | null }[]>();
    if (error) {
      this.logger.error(`Could not read user names: ${error.message}`);
      return names;
    }
    for (const row of data ?? []) names.set(row.id, row.display_name);
    return names;
  }

  private async notifyAdmins(projectName: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .eq('status', 'active')
      .limit(ADMIN_NOTIFY_LIMIT)
      .returns<{ id: string }[]>();
    if (error) {
      this.logger.error(`Could not read admins to notify: ${error.message}`);
      return;
    }
    for (const admin of data ?? []) {
      await this.notifications.notify(admin.id, 'moderation.appeal_received', {
        projectName,
      });
    }
  }
}
