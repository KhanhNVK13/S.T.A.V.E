import { Module } from '@nestjs/common';
import { ProjectAccessService } from './project-access.service';
import { JamLockService } from './jam-lock.service';
import { BranchMovedNotifier } from './branch-moved-notifier';

/**
 * No controller: `ProjectAccessService` is a shared service that other
 * modules (and the team lead's wiring into old services) inject and use
 * — no endpoint of its own.
 */
@Module({
  providers: [ProjectAccessService, JamLockService, BranchMovedNotifier],
  exports: [ProjectAccessService, JamLockService, BranchMovedNotifier],
})
export class ProjectAccessModule {}
