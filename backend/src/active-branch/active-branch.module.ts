import { Module } from '@nestjs/common';
import { ActiveBranchService } from './active-branch.service';

@Module({
  providers: [ActiveBranchService],
  exports: [ActiveBranchService],
})
export class ActiveBranchModule {}
