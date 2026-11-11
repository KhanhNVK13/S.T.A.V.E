import { Module } from '@nestjs/common';
import { CustomSoundsController } from './custom-sounds.controller';
import { CustomSoundsService } from './custom-sounds.service';
import { CustomSoundsGcSchedulerService } from './custom-sounds-gc-scheduler.service';
import { ProjectCustomSoundsController } from './project-custom-sounds.controller';

@Module({
  controllers: [CustomSoundsController, ProjectCustomSoundsController],
  providers: [CustomSoundsService, CustomSoundsGcSchedulerService],
  exports: [CustomSoundsService],
})
export class CustomSoundsModule {}
