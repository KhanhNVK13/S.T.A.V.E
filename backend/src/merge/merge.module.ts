import { Module } from '@nestjs/common';
import { MergeController } from './merge.controller';
import { MergeService } from './merge.service';
import { BranchesModule } from '../branches/branches.module';

import { ProjectAccessModule } from '../project-access/project-access.module';

@Module({
  imports: [BranchesModule, ProjectAccessModule], // Needs BranchesService for merge-base computation
  controllers: [MergeController],
  providers: [MergeService],
  exports: [MergeService],
})
export class MergeModule {}
