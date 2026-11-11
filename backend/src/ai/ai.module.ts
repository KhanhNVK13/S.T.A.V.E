import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';
import { AiController } from './ai.controller';
import { CommitMessageService } from './commit-message.service';
import { MergeRiskService } from './merge-risk.service';
import { TheoryInsightService } from './theory-insight.service';

import { BranchesModule } from '../branches/branches.module';
import { CommitsModule } from '../commits/commits.module';
import { DraftsModule } from '../drafts/drafts.module';
import { MergeModule } from '../merge/merge.module';
import { ProjectAccessModule } from '../project-access/project-access.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    BranchesModule,
    CommitsModule,
    DraftsModule,
    MergeModule,
    ProjectAccessModule,
    ProjectsModule,
  ],
  controllers: [AiController],
  providers: [
    GeminiClient,
    AiRateLimiter,
    CommitMessageService,
    MergeRiskService,
    TheoryInsightService,
  ],
  exports: [GeminiClient, AiRateLimiter, MergeRiskService],
})
export class AiModule {}
