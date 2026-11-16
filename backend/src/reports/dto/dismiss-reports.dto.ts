import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { REPORT_DISMISS_REASON_MAX_LENGTH } from '@stave/shared-types';

export class DismissReportsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  reportIds!: string[];

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(REPORT_DISMISS_REASON_MAX_LENGTH)
  reason!: string;
}
