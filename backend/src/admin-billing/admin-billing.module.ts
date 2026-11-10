import { Module } from '@nestjs/common';
import { AdminBillingController } from './admin-billing.controller';
import { AdminBillingService } from './admin-billing.service';
import { AdminPlansController } from './admin-plans.controller';
import { AdminPlansService } from './admin-plans.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';

@Module({
  imports: [NotificationsModule, PlatformSettingsModule],
  controllers: [AdminBillingController, AdminPlansController],
  providers: [AdminBillingService, AdminPlansService],
})
export class AdminBillingModule {}
