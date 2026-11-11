import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import { ReportModerationService } from './report-moderation.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { CustomSoundsModule } from '../custom-sounds/custom-sounds.module';

@Module({
  imports: [NotificationsModule, PlatformSettingsModule, CustomSoundsModule],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService, AdminReportsService, ReportModerationService],
})
export class ReportsModule {}
