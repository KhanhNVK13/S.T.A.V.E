import { Module } from '@nestjs/common';
import { CommitsController } from './commits.controller';
import { CommitsService } from './commits.service';
import { DiffService } from './diff.service';
import { ProjectsModule } from '../projects/projects.module';

import { ProjectAccessModule } from '../project-access/project-access.module';

@Module({
  imports: [ProjectsModule, ProjectAccessModule], // Needs ProjectsService for branch verification
  controllers: [CommitsController],
  providers: [CommitsService, DiffService],
  exports: [CommitsService, DiffService], // Export for use by other modules
})
export class CommitsModule {}
