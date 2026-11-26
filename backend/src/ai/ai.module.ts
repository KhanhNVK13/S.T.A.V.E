import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';
import { AiController } from './ai.controller';
import { AskProjectController } from './ask-project.controller';
import { AskProjectService } from './ask-project.service';
import { CommitMessageService } from './commit-message.service';
import { ConflictAdviceService } from './conflict-advice.service';
import { DiffSummaryService } from './diff-summary.service';
import { ExploreAiController } from './explore-ai.controller';
import { ExploreSearchService } from './explore-search.service';
import { JamRecapService } from './jam-recap.service';
import { MergeRiskService } from './merge-risk.service';
import { ModerationTriageController } from './moderation-triage.controller';
import { ModerationTriageService } from './moderation-triage.service';
import { PublishSuggestService } from './publish-suggest.service';
import { TheoryInsightService } from './theory-insight.service';

import { BranchesModule } from '../branches/branches.module';
import { CommentsModule } from '../comments/comments.module';
import { CommitsModule } from '../commits/commits.module';
import { DraftsModule } from '../drafts/drafts.module';
import { ExploreModule } from '../explore/explore.module';
import { JamModule } from '../jam/jam.module';
import { MergeModule } from '../merge/merge.module';
import { MusicalFingerprintModule } from '../musical-fingerprint/musical-fingerprint.module';
import { ProjectAccessModule } from '../project-access/project-access.module';
import { ProjectsModule } from '../projects/projects.module';
import { PullRequestsModule } from '../pull-requests/pull-requests.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [
    BranchesModule,
    CommentsModule,
    CommitsModule,
    DraftsModule,
    ExploreModule,
    JamModule,
    MergeModule,
    MusicalFingerprintModule,
    ProjectAccessModule,
    ProjectsModule,
    PullRequestsModule,
    ReportsModule,
  ],
  controllers: [
    AiController,
    ExploreAiController,
    AskProjectController,
    ModerationTriageController,
  ],
  providers: [
    GeminiClient,
    AiRateLimiter,
    AskProjectService,
    CommitMessageService,
    ConflictAdviceService,
    DiffSummaryService,
    ExploreSearchService,
    JamRecapService,
    MergeRiskService,
    ModerationTriageService,
    PublishSuggestService,
    TheoryInsightService,
  ],
  exports: [GeminiClient, AiRateLimiter, MergeRiskService],
})
export class AiModule {}
