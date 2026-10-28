import { Module } from '@nestjs/common';
import { ProjectAccessService } from './project-access.service';

@Module({
  providers: [ProjectAccessService],
  exports: [ProjectAccessService],
})
export class ProjectAccessModule {}
