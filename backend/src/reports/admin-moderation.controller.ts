import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RemovalImpact, RemoveProjectResult } from '@stave/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { RemoveProjectDto } from './dto/remove-project.dto';
import { ModerationRemovalService } from './moderation-removal.service';

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/reports')
export class AdminModerationController {
  constructor(
    private readonly moderationRemovalService: ModerationRemovalService,
  ) {}

  @Get(':projectId/removal-impact')
  removalImpact(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<RemovalImpact> {
    return this.moderationRemovalService.getRemovalImpact(projectId);
  }

  @Post(':projectId/remove')
  @HttpCode(200)
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: RemoveProjectDto,
  ): Promise<RemoveProjectResult> {
    return this.moderationRemovalService.removeProject(
      req.user.id,
      projectId,
      dto,
    );
  }
}
