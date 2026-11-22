import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
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
import { MAX_REMOVED_SOUNDS } from './remove-project.dto';

export class CopyrightTakedownDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (sanitizeReportDetails(value) ?? '') : value,
  )
  @IsString()
  @MinLength(MODERATION_NOTE_MIN_LENGTH)
  @MaxLength(MODERATION_NOTE_MAX_LENGTH)
  reason!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_REMOVED_SOUNDS)
  @IsUUID('all', { each: true })
  removeSoundIds?: string[];
}
