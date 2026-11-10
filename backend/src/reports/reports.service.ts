import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateReportResponse } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type { CreateReportDto } from './dto/create-report.dto';
import { sanitizeReportDetails } from './reports.logic';

interface ReportedProjectRow {
  owner_id: string;
  visibility: string;
  archived_at: string | null;
  moderation_hidden_at: string | null;
}

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async createReport(
    reporterId: string,
    projectId: string,
    dto: CreateReportDto,
  ): Promise<CreateReportResponse> {
    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .select('owner_id, visibility, archived_at, moderation_hidden_at')
      .eq('id', projectId)
      .maybeSingle<ReportedProjectRow>();

    if (projectError) {
      this.logger.error(
        `Could not read project to report: ${projectError.message}`,
      );
      throw new InternalServerErrorException('Could not create report');
    }
    if (!project) throw this.notFound();

    if (project.owner_id === reporterId) {
      throw new ForbiddenException('You cannot report your own project');
    }
    if (
      project.visibility !== 'public' ||
      project.archived_at ||
      project.moderation_hidden_at
    ) {
      throw this.notFound();
    }

    const { data, error } = await this.supabase
      .from('reports')
      .insert({
        project_id: projectId,
        reporter_id: reporterId,
        reason: dto.reason,
        details: sanitizeReportDetails(dto.details),
        status: 'pending',
      })
      .select('id')
      .single<{ id: string }>();

    if (error?.code === UNIQUE_VIOLATION) {
      throw new ConflictException('You have already reported this project');
    }
    if (error || !data) {
      this.logger.error(
        `Could not insert report: ${error?.message ?? 'no row returned'}`,
      );
      throw new InternalServerErrorException('Could not create report');
    }

    return { id: data.id };
  }

  private notFound(): NotFoundException {
    return new NotFoundException('Project not found');
  }
}
