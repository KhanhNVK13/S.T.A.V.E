import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { ModerationTriageDto } from './dto/moderation-triage.dto';
import {
  ModerationTriageService,
  type ModerationTriageResult,
} from './moderation-triage.service';

@Controller('ai')
@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
export class ModerationTriageController {
  constructor(private readonly moderationTriage: ModerationTriageService) {}

  @Post('moderation-triage')
  @HttpCode(HttpStatus.OK)
  async triage(
    @Body() dto: ModerationTriageDto,
    @CurrentUser() adminUserId: string,
  ): Promise<ModerationTriageResult> {
    return this.moderationTriage.triage(
      adminUserId,
      dto.projectId,
      dto.status ?? 'open',
      dto.lang ?? 'vi',
    );
  }
}
