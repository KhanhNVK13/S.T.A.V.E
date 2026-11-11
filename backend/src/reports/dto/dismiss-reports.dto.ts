import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  DISMISS_MAX_REPORT_IDS,
  DISMISS_REASON_MAX_LENGTH,
} from '@stave/shared-types';

export class DismissReportsDto {
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? [...new Set(value as unknown[])] : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(DISMISS_MAX_REPORT_IDS)
  @IsUUID('all', { each: true })
  reportIds!: string[];

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(DISMISS_REASON_MAX_LENGTH)
  reason!: string;
}
