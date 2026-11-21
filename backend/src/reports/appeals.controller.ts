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
import type { AppealListResponse, RemovedProject } from '@stave/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { Throttle } from '@nestjs/throttler';
import { AppealsService } from './appeals.service';
import {
  CreateAppealDto,
  ListAppealsQueryDto,
  ResolveAppealDto,
} from './dto/appeal.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('moderation')
export class RemovedProjectsController {
  constructor(private readonly appeals: AppealsService) {}

  @Get('removed-projects')
  list(@Req() req: AuthenticatedRequest): Promise<RemovedProject[]> {
    return this.appeals.listRemoved(req.user.id);
  }

  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post('removed-projects/:projectId/appeal')
  appeal(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateAppealDto,
  ): Promise<{ id: string }> {
    return this.appeals.createAppeal(req.user.id, projectId, dto.statement);
  }
}

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/appeals')
export class AdminAppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Get()
  list(@Query() query: ListAppealsQueryDto): Promise<AppealListResponse> {
    return this.appeals.listAppeals(
      query.status ?? 'pending',
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Post(':appealId/uphold')
  uphold(
    @Req() req: AuthenticatedRequest,
    @Param('appealId', ParseUUIDPipe) appealId: string,
    @Body() dto: ResolveAppealDto,
  ) {
    return this.appeals.resolveAppeal(
      req.user.id,
      appealId,
      'uphold',
      dto.note,
    );
  }

  @Post(':appealId/reject')
  reject(
    @Req() req: AuthenticatedRequest,
    @Param('appealId', ParseUUIDPipe) appealId: string,
    @Body() dto: ResolveAppealDto,
  ) {
    return this.appeals.resolveAppeal(
      req.user.id,
      appealId,
      'reject',
      dto.note,
    );
  }
}
