import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';
import { AiController } from './ai.controller';
import { CommitMessageService } from './commit-message.service';
import { ConflictAdviceService } from './conflict-advice.service';
import { DiffSummaryService } from './diff-summary.service';
import { JamRecapService } from './jam-recap.service';
import { MergeRiskService } from './merge-risk.service';
import { PublishSuggestService } from './publish-suggest.service';
import { TheoryInsightService } from './theory-insight.service';

import { BranchesModule } from '../branches/branches.module';
import { CommitsModule } from '../commits/commits.module';
import { DraftsModule } from '../drafts/drafts.module';
import { JamModule } from '../jam/jam.module';
import { MergeModule } from '../merge/merge.module';
import { ProjectAccessModule } from '../project-access/project-access.module';
import { ProjectsModule } from '../projects/projects.module';
import { PullRequestsModule } from '../pull-requests/pull-requests.module';

@Module({
  imports: [
    BranchesModule,
    CommitsModule,
    DraftsModule,
    JamModule,
    MergeModule,
    ProjectAccessModule,
    ProjectsModule,
    PullRequestsModule,
  ],
  controllers: [AiController],
  providers: [
    GeminiClient,
    AiRateLimiter,
    CommitMessageService,
    ConflictAdviceService,
    DiffSummaryService,
    JamRecapService,
    MergeRiskService,
    PublishSuggestService,
    TheoryInsightService,
  ],
  exports: [GeminiClient, AiRateLimiter, MergeRiskService],
})
export class AiModule {}
