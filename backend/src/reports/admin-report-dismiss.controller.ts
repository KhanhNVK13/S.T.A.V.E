import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { DismissReportsResponse } from '@stave/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { DismissReportsDto } from './dto/dismiss-reports.dto';
import { ReportDismissService } from './report-dismiss.service';

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/reports')
export class AdminReportDismissController {
  constructor(private readonly reportDismissService: ReportDismissService) {}

  @Post(':projectId/dismiss')
  @HttpCode(200)
  dismiss(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: DismissReportsDto,
  ): Promise<DismissReportsResponse> {
    return this.reportDismissService.dismiss(req.user.id, projectId, dto);
  }
}
