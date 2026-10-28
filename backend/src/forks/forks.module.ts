import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ForksController } from './forks.controller';
import { ForksService } from './forks.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ForksController],
  providers: [ForksService],
  exports: [ForksService],
})
export class ForksModule {}
