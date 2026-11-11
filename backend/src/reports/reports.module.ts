import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import { AdminReportDismissController } from './admin-report-dismiss.controller';
import { ReportDismissService } from './report-dismiss.service';

@Module({
  imports: [NotificationsModule],
  controllers: [
    ReportsController,
    AdminReportsController,
    AdminReportDismissController,
  ],
  providers: [ReportsService, AdminReportsService, ReportDismissService],
})
export class ReportsModule {}
