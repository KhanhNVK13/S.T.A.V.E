import { Module } from '@nestjs/common';
import { AudioSketchesController } from './audio-sketches.controller';
import { AudioSketchesService } from './audio-sketches.service';

@Module({
  controllers: [AudioSketchesController],
  providers: [AudioSketchesService],
})
export class AudioSketchesModule {}
