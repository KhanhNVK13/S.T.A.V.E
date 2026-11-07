import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ActivityPage } from '@stave/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { ActivityLogService } from './activity-log.service';

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/users')
export class ActivityLogController {
  constructor(private readonly activityLog: ActivityLogService) {}

  @Get(':id/activity')
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: Record<string, unknown>,
  ): Promise<ActivityPage> {
    return this.activityLog.list(id, query);
  }
}
