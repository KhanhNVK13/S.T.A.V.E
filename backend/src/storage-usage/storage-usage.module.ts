import { Module } from '@nestjs/common';
import { CustomSoundsModule } from '../custom-sounds/custom-sounds.module';
import { StorageUsageController } from './storage-usage.controller';
import { StorageUsageService } from './storage-usage.service';

@Module({
  imports: [CustomSoundsModule],
  controllers: [StorageUsageController],
  providers: [StorageUsageService],
})
export class StorageUsageModule {}
