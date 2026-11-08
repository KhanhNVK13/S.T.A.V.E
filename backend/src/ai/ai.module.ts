import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';
import { AiController } from './ai.controller';
import { CommitMessageService } from './commit-message.service';
import { MergeRiskService } from './merge-risk.service';

import { BranchesModule } from '../branches/branches.module';
import { CommitsModule } from '../commits/commits.module';
import { DraftsModule } from '../drafts/drafts.module';
import { MergeModule } from '../merge/merge.module';
import { ProjectAccessModule } from '../project-access/project-access.module';
import { ProjectsModule } from '../projects/projects.module';

/**
 * UC-70/71: shared AI capability. `GeminiClient` (thin, timeout-guarded,
 * graceful-null) plus `AiRateLimiter` (per-user quota guard). Both are
 * exported so feature modules (commits, merge) can provide their own
 * endpoints that call the model.
 *
 * UC-70 adds the commit-message endpoint (`CommitMessageService`).
 * UC-71 adds the merge-risk endpoint: `MergeRiskService` reuses the
 * system's existing `BranchesService.findMergeBase`, `DiffService` and
 * `MergeService.previewMerge` rather than re-implementing merge maths.
 */
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
  ],
  exports: [GeminiClient, AiRateLimiter, MergeRiskService],
})
export class AiModule {}
