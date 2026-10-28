import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ForksService } from './forks.service';

@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('projects/:projectId/fork')
export class ForksController {
  constructor(private readonly forks: ForksService) {}

  @Post()
  fork(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.forks.fork(projectId, req.user.id);
  }
}
