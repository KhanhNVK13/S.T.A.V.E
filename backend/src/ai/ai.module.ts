import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';
import { AiController } from './ai.controller';
import { CommitMessageService } from './commit-message.service';
import { ProjectsModule } from '../projects/projects.module';
import { ProjectAccessModule } from '../project-access/project-access.module';
import { DraftsModule } from '../drafts/drafts.module';
import { CommitsModule } from '../commits/commits.module';

/**
 * UC-70/71: shared AI capability. `GeminiClient` (thin, timeout-guarded,
 * graceful-null) plus `AiRateLimiter` (per-user quota guard). Both are
 * exported so feature modules (commits, merge) can provide their own
 * endpoints that call the model.
 *
 * `CommitMessageService` (UC-70) lives here next to the model it wraps and
 * re-uses the existing server-side building blocks (draft read, commit
 * head, diff) — it is not load-bearing on any of them (BR-79): a missing
 * key or a hung model simply means `suggestion: null`.
 */
@Module({
  imports: [ProjectsModule, ProjectAccessModule, DraftsModule, CommitsModule],
  controllers: [AiController],
  providers: [GeminiClient, AiRateLimiter, CommitMessageService],
  exports: [GeminiClient, AiRateLimiter],
})
export class AiModule {}
