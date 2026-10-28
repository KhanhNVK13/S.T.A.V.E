import { Module } from '@nestjs/common';
import { DraftsController } from './drafts.controller';
import { DraftsService } from './drafts.service';
import { ProjectsModule } from '../projects/projects.module';

import { ProjectAccessModule } from '../project-access/project-access.module';
import { CommitsModule } from '../commits/commits.module';

@Module({
  imports: [ProjectsModule, ProjectAccessModule, CommitsModule],
  controllers: [DraftsController],
  providers: [DraftsService],
  exports: [DraftsService],
})
export class DraftsModule {}
