import { Module } from '@nestjs/common';
import { AccountRemovalService } from './account-removal.service';
import { CustomSoundsModule } from '../custom-sounds/custom-sounds.module';
import { AudioSketchesModule } from '../audio-sketches/audio-sketches.module';

@Module({
  imports: [CustomSoundsModule, AudioSketchesModule],
  providers: [AccountRemovalService],
  exports: [AccountRemovalService],
})
export class AccountRemovalModule {}
