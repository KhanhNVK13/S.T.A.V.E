import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  MODERATION_NOTE_MAX_LENGTH,
  MODERATION_NOTE_MIN_LENGTH,
} from '@stave/shared-types';
import { sanitizeReportDetails } from '../reports.logic';

export const MAX_DISMISS_REPORTS = 500;

export class DismissReportsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DISMISS_REPORTS)
  @IsUUID('all', { each: true })
  reportIds!: string[];

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (sanitizeReportDetails(value) ?? '') : value,
  )
  @IsString()
  @MinLength(MODERATION_NOTE_MIN_LENGTH)
  @MaxLength(MODERATION_NOTE_MAX_LENGTH)
  reason!: string;
}
