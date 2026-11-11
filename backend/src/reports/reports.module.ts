import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CustomSoundsModule } from '../custom-sounds/custom-sounds.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminProjectRestoreController } from './admin-project-restore.controller';
import { ModerationRemovalService } from './moderation-removal.service';

@Module({
  imports: [NotificationsModule, CustomSoundsModule, PlatformSettingsModule],
  controllers: [
    ReportsController,
    AdminReportsController,
    AdminModerationController,
    AdminProjectRestoreController,
  ],
  providers: [ReportsService, AdminReportsService, ModerationRemovalService],
})
export class ReportsModule {}
