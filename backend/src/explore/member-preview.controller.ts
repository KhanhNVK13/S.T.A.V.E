import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { PublicHistoryService } from './public-history.service';

@Controller('projects/:id')
@UseGuards(JwtAuthGuard, SessionAuthGuard)
export class MemberPreviewController {
  constructor(private readonly history: PublicHistoryService) {}

  @Get('preview')
  getPreview(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.history.getPreviewForMember(id, req.user.id);
  }
}
