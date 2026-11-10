import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AdminReportListResponse,
  ReportDetail,
  ReportPreview,
} from '@stave/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminReportsService } from './admin-reports.service';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { ReportStatusQueryDto } from './dto/report-status-query.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly adminReportsService: AdminReportsService) {}

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
}
