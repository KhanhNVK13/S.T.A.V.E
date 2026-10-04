import { Module } from '@nestjs/common';
import { SoundMappingsController } from './sound-mappings.controller';
import { SoundMappingsService } from './sound-mappings.service';

@Module({
  controllers: [SoundMappingsController],
  providers: [SoundMappingsService],
  exports: [SoundMappingsService],
})
export class SoundMappingsModule {}
