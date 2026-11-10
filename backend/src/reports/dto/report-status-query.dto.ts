import { IsIn, IsOptional } from 'class-validator';
import {
  REPORT_STATUS_FILTERS,
  type ReportStatusFilter,
} from '@stave/shared-types';

export class ReportStatusQueryDto {
  @IsOptional()
  @IsIn(REPORT_STATUS_FILTERS)
  status?: ReportStatusFilter = 'open';
}
