import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  /** BR-02: minimum 8 characters. */
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
