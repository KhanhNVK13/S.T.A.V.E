import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  AdminReportListResponse,
  DismissReportsResponse,
  RemoveReportedProjectResponse,
  ReportDetail,
  ReportPreview,
  ReportRemovalContext,
  RestoreProjectResponse,
} from '@stave/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminReportsService } from './admin-reports.service';
import { ReportModerationService } from './report-moderation.service';
import { DismissReportsDto } from './dto/dismiss-reports.dto';
import { RemoveProjectDto } from './dto/remove-project.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { ReportStatusQueryDto } from './dto/report-status-query.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(
    private readonly adminReportsService: AdminReportsService,
    private readonly moderationService: ReportModerationService,
  ) {}

  @Get()
  list(@Query() query: ListReportsQueryDto): Promise<AdminReportListResponse> {
    return this.adminReportsService.listGroups({
      status: query.status ?? 'open',
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Get(':projectId')
  details(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ReportStatusQueryDto,
  ): Promise<ReportDetail[]> {
    return this.adminReportsService.getDetails(
      projectId,
      query.status ?? 'open',
    );
  }

  @Get(':projectId/preview')
  preview(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ReportPreview> {
    return this.adminReportsService.getPreview(projectId);
  }

  @Get(':projectId/removal-context')
  removalContext(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ReportRemovalContext> {
    return this.moderationService.getRemovalContext(projectId);
  }

  @Post(':projectId/remove')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: RemoveProjectDto,
  ): Promise<RemoveReportedProjectResponse> {
    return this.moderationService.removeProject(req.user.id, projectId, dto);
  }

  @Post(':projectId/dismiss')
  dismiss(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: DismissReportsDto,
  ): Promise<DismissReportsResponse> {
    return this.moderationService.dismissReports(req.user.id, projectId, dto);
  }

  @Post(':projectId/restore')
  restore(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<RestoreProjectResponse> {
    return this.moderationService.restoreProject(req.user.id, projectId);
  }
}
