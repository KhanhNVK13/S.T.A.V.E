import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { REMOVAL_REASON_MAX_LENGTH } from '@stave/shared-types';

export class RestoreProjectDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(REMOVAL_REASON_MAX_LENGTH)
  reason!: string;
}
