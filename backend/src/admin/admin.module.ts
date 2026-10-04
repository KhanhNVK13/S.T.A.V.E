import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { CustomSoundsModule } from '../custom-sounds/custom-sounds.module';

@Module({
  imports: [CustomSoundsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
