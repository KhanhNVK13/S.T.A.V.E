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
import {
  TheoryInsightService,
  type TheoryInsightResult,
} from './theory-insight.service';
import { TheoryInsightDto } from './dto/theory-insight.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard, SessionAuthGuard)
export class AiController {
  constructor(
    private readonly commitMessage: CommitMessageService,
    private readonly mergeRiskService: MergeRiskService,
    private readonly theoryInsight: TheoryInsightService,
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

  @Get('merge-risk')
  async getMergeRisk(
    @CurrentUser() userId: string,
    @Query() dto: MergeRiskDto,
  ): Promise<MergeRiskResult> {
    return this.mergeRiskService.assess(
      userId,
      dto.sourceBranchId,
      dto.targetBranchId,
      dto.lang,
    );
  }

  @Get('theory-insight')
  async getTheoryInsight(
    @CurrentUser() userId: string,
    @Query() dto: TheoryInsightDto,
  ): Promise<TheoryInsightResult> {
    return this.theoryInsight.insight(
      userId,
      dto.projectId,
      dto.commitId ?? null,
      dto.lang,
    );
  }
}
