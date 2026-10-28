import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { CustomSoundsModule } from '../custom-sounds/custom-sounds.module';
import { ProjectAccessModule } from '../project-access/project-access.module';
import { ActiveBranchModule } from '../active-branch/active-branch.module';
import { AudioSketchesModule } from '../audio-sketches/audio-sketches.module';

@Module({
  imports: [
    CustomSoundsModule,
    ProjectAccessModule,
    ActiveBranchModule,
    AudioSketchesModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
