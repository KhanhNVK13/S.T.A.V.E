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

/**
 * UC-70/71 (shared AI endpoints).
 *
 * UC-70: `POST /ai/commit-message` — gợi ý 1 câu commit message.
 * Trả `{ suggestion: string | null }` với HTTP 200 luôn (kể cả khi AI
 * bị bỏ qua); chỉ lỗi khi không có quyền (403/409) hoặc branch lạ (404).
 *
 * Guards: JwtAuthGuard + SessionAuthGuard (cùng các endpoint nghiệp vụ).
 */
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
    );
  }
}
