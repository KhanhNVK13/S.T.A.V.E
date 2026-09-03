import { IsString, MinLength } from 'class-validator';

export class SuspendUserDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
