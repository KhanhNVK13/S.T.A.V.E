import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  REPORT_DETAILS_MAX_LENGTH,
  type ReportReason,
} from '@stave/shared-types';
import { REPORT_REASON_KEYS, sanitizeReportDetails } from '../reports.logic';

export class CreateReportDto {
  @IsIn(REPORT_REASON_KEYS)
  reason!: ReportReason;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? sanitizeReportDetails(value) : value,
  )
  @IsString()
  @MaxLength(REPORT_DETAILS_MAX_LENGTH)
  details?: string | null;
}
