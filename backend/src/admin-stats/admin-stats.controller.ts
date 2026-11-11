import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type {
  AdminOverviewStats,
  GrowthStats,
  UsageStats,
} from '@stave/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminStatsService } from './admin-stats.service';
import { StatsQueryDto } from './dto/stats-query.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly service: AdminStatsService) {}

  @Get('growth')
  growth(@Query() query: StatsQueryDto): Promise<GrowthStats> {
    return this.service.growth(query.from, query.to, query.compare ?? false);
  }

  @Get('usage')
  usage(@Query() query: StatsQueryDto): Promise<UsageStats> {
    return this.service.usage(query.from, query.to, query.compare ?? false);
  }

  @Get('overview')
  overview(@Query() query: StatsQueryDto): Promise<AdminOverviewStats> {
    return this.service.overview(query.from, query.to, query.compare ?? false);
  }
}
