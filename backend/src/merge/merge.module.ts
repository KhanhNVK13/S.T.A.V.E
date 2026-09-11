import { Module } from '@nestjs/common';
import { MergeController } from './merge.controller';
import { MergeService } from './merge.service';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [BranchesModule], // Needs BranchesService for merge-base computation
  controllers: [MergeController],
  providers: [MergeService],
  exports: [MergeService],
})
export class MergeModule {}
