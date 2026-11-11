import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  MODERATION_NOTE_MAX_LENGTH,
  MODERATION_NOTE_MIN_LENGTH,
  MODERATION_POLICIES,
  type ModerationPolicy,
} from '@stave/shared-types';
import { sanitizeReportDetails } from '../reports.logic';

export const MAX_REMOVED_SOUNDS = 50;

export class RemoveProjectDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (sanitizeReportDetails(value) ?? '') : value,
  )
  @IsString()
  @MinLength(MODERATION_NOTE_MIN_LENGTH)
  @MaxLength(MODERATION_NOTE_MAX_LENGTH)
  reason!: string;

  @IsIn(MODERATION_POLICIES)
  policy!: ModerationPolicy;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_REMOVED_SOUNDS)
  @IsUUID('all', { each: true })
  removeSoundIds?: string[];
}
