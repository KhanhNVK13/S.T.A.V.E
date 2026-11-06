import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';
import { AiController } from './ai.controller';
import { CommitMessageService } from './commit-message.service';
import { ProjectsModule } from '../projects/projects.module';
import { ProjectAccessModule } from '../project-access/project-access.module';
import { DraftsModule } from '../drafts/drafts.module';
import { CommitsModule } from '../commits/commits.module';

@Module({
  imports: [ProjectsModule, ProjectAccessModule, DraftsModule, CommitsModule],
  controllers: [AiController],
  providers: [GeminiClient, AiRateLimiter, CommitMessageService],
  exports: [GeminiClient, AiRateLimiter],
})
export class AiModule {}
