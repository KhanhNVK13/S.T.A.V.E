import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DraftsService } from './drafts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { UpdateDraftDto } from './dto/update-draft.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('projects/:id')
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Get('draft')
  getDraft(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.draftsService.getDraft(id, req.user.id);
  }

  @Put('draft')
  putDraft(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDraftDto,
  ) {
    return this.draftsService.putDraft(id, req.user.id, dto);
  }
}
