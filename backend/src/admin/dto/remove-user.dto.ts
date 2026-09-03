import { IsString, MinLength } from 'class-validator';

export class RemoveUserDto {
  @IsString()
  @MinLength(1)
  reason!: string;

  /** Must match the target account's username — SRS UC-99 confirm-by-handle. */
  @IsString()
  confirmUsername!: string;
}
