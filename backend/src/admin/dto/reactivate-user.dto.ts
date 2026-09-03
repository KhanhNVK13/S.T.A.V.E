import { IsString, MinLength } from 'class-validator';

export class ReactivateUserDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
