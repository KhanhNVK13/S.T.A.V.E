import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';

@Module({
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService, AdminReportsService],
})
export class ReportsModule {}
