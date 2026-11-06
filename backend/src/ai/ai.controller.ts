import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { CurrentUser } from '../common/decorators';
import { CommitMessageService } from './commit-message.service';
import { CommitMessageDto } from './dto/commit-message.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard, SessionAuthGuard)
export class AiController {
  constructor(private readonly commitMessage: CommitMessageService) {}

  @Post('commit-message')
  @HttpCode(HttpStatus.OK)
  async suggestCommitMessage(
    @Body() dto: CommitMessageDto,
    @CurrentUser() userId: string,
  ): Promise<{ suggestion: string | null }> {
    return this.commitMessage.suggest(
      dto.projectId,
      dto.branchId ?? null,
      userId,
      dto.lang,
    );
  }
}
