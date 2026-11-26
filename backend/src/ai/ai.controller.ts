import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { CurrentUser } from '../common/decorators';
import { CommitMessageService } from './commit-message.service';
import { CommitMessageDto } from './dto/commit-message.dto';
import {
  ConflictAdviceService,
  type ConflictAdviceResult,
} from './conflict-advice.service';
import { ConflictAdviceDto } from './dto/conflict-advice.dto';
import {
  DiffSummaryService,
  type DiffSummaryResult,
  type PrSummaryResult,
} from './diff-summary.service';
import { DiffSummaryDto } from './dto/diff-summary.dto';
import { PrRiskExplainDto } from './dto/pr-risk-explain.dto';
import { PrSummaryDto } from './dto/pr-summary.dto';
import { JamRecapService, type JamRecapResult } from './jam-recap.service';
import { JamRecapDto } from './dto/jam-recap.dto';
import {
  MergeRiskService,
  type ExplanationSource,
  type MergeRiskResult,
} from './merge-risk.service';
import { MergeRiskDto } from './dto/merge-risk.dto';
import {
  PublishSuggestService,
  type PublishSuggestResult,
} from './publish-suggest.service';
import { PublishSuggestDto } from './dto/publish-suggest.dto';
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
    private readonly diffSummary: DiffSummaryService,
    private readonly conflictAdvice: ConflictAdviceService,
    private readonly publishSuggest: PublishSuggestService,
    private readonly jamRecap: JamRecapService,
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
      dto.explain !== 'false',
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
      dto.explain !== 'false',
    );
  }

  @Post('pull-requests/:id/risk-explain')
  @HttpCode(HttpStatus.OK)
  async explainPrRisk(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: PrRiskExplainDto,
    @CurrentUser() userId: string,
  ): Promise<{
    explanation: string | null;
    explanationSource: ExplanationSource;
  }> {
    return this.diffSummary.explainPullRequestRisk(userId, id, dto.lang);
  }

  @Post('pr-summary')
  @HttpCode(HttpStatus.OK)
  async summarizePr(
    @Body() dto: PrSummaryDto,
    @CurrentUser() userId: string,
  ): Promise<PrSummaryResult> {
    return this.diffSummary.summarizePullRequest(
      userId,
      dto.pullRequestId,
      dto.lang,
    );
  }

  @Post('diff-summary')
  @HttpCode(HttpStatus.OK)
  async summarizeDiff(
    @Body() dto: DiffSummaryDto,
    @CurrentUser() userId: string,
  ): Promise<DiffSummaryResult> {
    return this.diffSummary.summarizeCommitDiff(
      userId,
      dto.baseCommitId,
      dto.targetCommitId,
      dto.lang,
      dto.style,
    );
  }

  @Post('conflict-advice')
  @HttpCode(HttpStatus.OK)
  async adviseConflicts(
    @Body() dto: ConflictAdviceDto,
    @CurrentUser() userId: string,
  ): Promise<ConflictAdviceResult> {
    return this.conflictAdvice.advise(userId, dto);
  }

  @Post('publish-suggest')
  @HttpCode(HttpStatus.OK)
  async suggestPublishMetadata(
    @Body() dto: PublishSuggestDto,
    @CurrentUser() userId: string,
  ): Promise<PublishSuggestResult> {
    return this.publishSuggest.suggest(userId, dto.projectId, dto.lang);
  }

  @Post('jam-recap')
  @HttpCode(HttpStatus.OK)
  async recapJam(
    @Body() dto: JamRecapDto,
    @CurrentUser() userId: string,
  ): Promise<JamRecapResult> {
    return this.jamRecap.recap(userId, dto.eventId, dto.lang);
  }
}
