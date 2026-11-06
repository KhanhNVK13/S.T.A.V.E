import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';
import { AiController } from './ai.controller';
import { MergeRiskService } from './merge-risk.service';

import { BranchesModule } from '../branches/branches.module';
import { CommitsModule } from '../commits/commits.module';
import { MergeModule } from '../merge/merge.module';
import { ProjectAccessModule } from '../project-access/project-access.module';

/**
 * UC-70/71: shared AI capability. `GeminiClient` (thin, timeout-guarded,
 * graceful-null) plus `AiRateLimiter` (per-user quota guard). Both are
 * exported so feature modules (commits, merge) can provide their own
 * endpoints that call the model.
 *
 * UC-71 adds the merge-risk endpoint: `MergeRiskService` reuses the
 * system's existing `BranchesService.findMergeBase`, `DiffService` and
 * `MergeService.previewMerge` rather than re-implementing merge maths.
 */
@Module({
  imports: [BranchesModule, CommitsModule, MergeModule, ProjectAccessModule],
  controllers: [AiController],
  providers: [GeminiClient, AiRateLimiter, MergeRiskService],
  exports: [GeminiClient, AiRateLimiter, MergeRiskService],
})
export class AiModule {}
