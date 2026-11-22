import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  REPORT_DETAILS_MAX_LENGTH,
  type ReportReason,
} from '@stave/shared-types';
import { REPORT_REASON_KEYS, sanitizeReportDetails } from '../reports.logic';
import { CopyrightClaimDto } from './copyright-claim.dto';

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

  @ValidateIf((dto: CreateReportDto) => dto.reason === 'copyright')
  @IsDefined()
  @ValidateNested()
  @Type(() => CopyrightClaimDto)
  copyrightClaim?: CopyrightClaimDto;
}
