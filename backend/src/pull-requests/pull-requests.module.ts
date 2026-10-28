import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { CommitsModule } from '../commits/commits.module';
import { MergeModule } from '../merge/merge.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectAccessModule } from '../project-access/project-access.module';
import { PullRequestAnalysisService } from './pull-request-analysis.service';
import { PullRequestMergeService } from './pull-request-merge.service';
import { PullRequestsController } from './pull-requests.controller';
import { PullRequestsService } from './pull-requests.service';

@Module({
  imports: [
    BranchesModule,
    CommitsModule,
    MergeModule,
    NotificationsModule,
    ProjectAccessModule,
  ],
  controllers: [PullRequestsController],
  providers: [
    PullRequestAnalysisService,
    PullRequestsService,
    PullRequestMergeService,
  ],
})
export class PullRequestsModule {}
