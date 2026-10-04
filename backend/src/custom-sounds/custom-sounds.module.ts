import { Module } from '@nestjs/common';
import { CustomSoundsController } from './custom-sounds.controller';
import { CustomSoundsService } from './custom-sounds.service';
import { ProjectCustomSoundsController } from './project-custom-sounds.controller';

@Module({
  controllers: [CustomSoundsController, ProjectCustomSoundsController],
  providers: [CustomSoundsService],
  exports: [CustomSoundsService],
})
export class CustomSoundsModule {}
