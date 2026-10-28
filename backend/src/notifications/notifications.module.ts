import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationInboxService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
