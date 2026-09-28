import { Module } from '@nestjs/common';
import { CustomSoundsController } from './custom-sounds.controller';
import { CustomSoundsService } from './custom-sounds.service';

@Module({
  controllers: [CustomSoundsController],
  providers: [CustomSoundsService],
  exports: [CustomSoundsService],
})
export class CustomSoundsModule {}
