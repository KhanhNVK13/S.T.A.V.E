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
import type { RestoreProjectResponse } from '@stave/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { RestoreProjectDto } from './dto/restore-project.dto';
import { ModerationRemovalService } from './moderation-removal.service';

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/projects')
export class AdminProjectRestoreController {
  constructor(
    private readonly moderationRemovalService: ModerationRemovalService,
  ) {}

  @Post(':projectId/restore')
  @HttpCode(200)
  restore(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: RestoreProjectDto,
  ): Promise<RestoreProjectResponse> {
    return this.moderationRemovalService.restoreProject(
      req.user.id,
      projectId,
      dto.reason,
    );
  }
}
