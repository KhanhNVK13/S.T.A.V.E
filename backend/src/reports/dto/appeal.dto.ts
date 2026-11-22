import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  APPEAL_STATEMENT_MAX_LENGTH,
  APPEAL_STATEMENT_MIN_LENGTH,
  APPEAL_STATUSES,
  MODERATION_NOTE_MAX_LENGTH,
  MODERATION_NOTE_MIN_LENGTH,
  type AppealStatus,
} from '@stave/shared-types';
import { sanitizeReportDetails } from '../reports.logic';

const clean = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? (sanitizeReportDetails(value) ?? '') : value;

export class CreateAppealDto {
  @Transform(clean)
  @IsString()
  @MinLength(APPEAL_STATEMENT_MIN_LENGTH)
  @MaxLength(APPEAL_STATEMENT_MAX_LENGTH)
  statement!: string;
}

export class ResolveAppealDto {
  @Transform(clean)
  @IsString()
  @MinLength(MODERATION_NOTE_MIN_LENGTH)
  @MaxLength(MODERATION_NOTE_MAX_LENGTH)
  note!: string;
}

export class ListAppealsQueryDto {
  @IsOptional()
  @IsIn(APPEAL_STATUSES)
  status?: AppealStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
