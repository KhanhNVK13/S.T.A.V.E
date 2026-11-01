import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';

/**
 * UC-70/71: shared AI capability. `GeminiClient` (thin, timeout-guarded,
 * graceful-null) plus `AiRateLimiter` (per-user quota guard). Both are
 * exported so feature modules (commits, merge) can provide their own
 * endpoints that call the model.
 */
@Module({
  providers: [GeminiClient, AiRateLimiter],
  exports: [GeminiClient, AiRateLimiter],
})
export class AiModule {}
