import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AccountRemovalModule } from '../account-removal/account-removal.module';

@Module({
  imports: [AccountRemovalModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
