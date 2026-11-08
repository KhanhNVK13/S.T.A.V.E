import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { CurrentUser } from '../common/decorators';
import { CommitMessageService } from './commit-message.service';
import { CommitMessageDto } from './dto/commit-message.dto';
import { MergeRiskService, type MergeRiskResult } from './merge-risk.service';
import { MergeRiskDto } from './dto/merge-risk.dto';

/**
 * AI endpoints.
 *
 * POST /ai/commit-message (UC-70) — gợi ý commit message.
 * GET  /ai/merge-risk?sourceBranchId=&targetBranchId= (UC-71) — cảnh báo
 * rủi ro merge.
 *
 * Guards: JwtAuthGuard + SessionAuthGuard (both required)
 */
@Controller('ai')
@UseGuards(JwtAuthGuard, SessionAuthGuard)
export class AiController {
  constructor(
    private readonly commitMessage: CommitMessageService,
    private readonly mergeRiskService: MergeRiskService,
  ) {}

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

  /**
   * GET /ai/merge-risk
   *
   * Mức rủi ro (thấp / vừa / cao) kèm các con số và câu giải thích ngắn.
   *
   * - Hai nhánh không có điểm gốc chung → 400 "Branches cannot be compared"
   *   (đó là lỗi merge, không phải đánh giá rủi ro).
   * - Mức thấp: câu cố định, không gọi AI.
   * - Gemini lỗi/quá hạn → `explanation: null`, các con số vẫn trả về đủ.
   */
  @Get('merge-risk')
  async getMergeRisk(
    @CurrentUser() userId: string,
    @Query() dto: MergeRiskDto,
  ): Promise<MergeRiskResult> {
    return this.mergeRiskService.assess(
      userId,
      dto.sourceBranchId,
      dto.targetBranchId,
    );
  }
}
