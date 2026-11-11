import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  REMOVAL_POLICIES,
  REMOVAL_REASON_MAX_LENGTH,
  REMOVE_SOUND_IDS_MAX,
} from '@stave/shared-types';

export class RemoveProjectDto {
  /**
   * Shape only: the minimum length rule lives in `validateRemoveBody` so the
   * rejection carries a Vietnamese message instead of a raw validator one.
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(REMOVAL_REASON_MAX_LENGTH)
  reason!: string;

  @IsIn([...REMOVAL_POLICIES])
  policy!: (typeof REMOVAL_POLICIES)[number];

  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? [...new Set(value as unknown[])] : value,
  )
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REMOVE_SOUND_IDS_MAX)
  @IsUUID('all', { each: true })
  removeSoundIds?: string[];
}
