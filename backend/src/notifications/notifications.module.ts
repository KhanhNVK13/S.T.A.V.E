import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationsService } from './notifications.service';
import { createEmailSender, EMAIL_SENDER } from './email-sender';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationInboxService,
    { provide: EMAIL_SENDER, useFactory: () => createEmailSender() },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
