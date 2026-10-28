import { Module } from '@nestjs/common';
import { ProjectAccessService } from './project-access.service';

/**
 * No controller: `ProjectAccessService` is a shared service that other
 * modules (and the team lead's wiring into old services) inject and use
 * — no endpoint of its own.
 */
@Module({
  providers: [ProjectAccessService],
  exports: [ProjectAccessService],
})
export class ProjectAccessModule {}
