import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import { ReportModerationService } from './report-moderation.service';
import { AppealsService } from './appeals.service';
import {
  AdminAppealsController,
  RemovedProjectsController,
} from './appeals.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { CustomSoundsModule } from '../custom-sounds/custom-sounds.module';

@Module({
  imports: [NotificationsModule, PlatformSettingsModule, CustomSoundsModule],
  controllers: [
    ReportsController,
    AdminReportsController,
    RemovedProjectsController,
    AdminAppealsController,
  ],
  providers: [
    ReportsService,
    AdminReportsService,
    ReportModerationService,
    AppealsService,
  ],
  exports: [AdminReportsService],
})
export class ReportsModule {}
