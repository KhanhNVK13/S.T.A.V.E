import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

import { ProjectAccessModule } from '../project-access/project-access.module';
import { ActiveBranchModule } from '../active-branch/active-branch.module';

@Module({
  imports: [ProjectAccessModule, ActiveBranchModule],
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService], // Export for use by other modules
})
export class BranchesModule {}
