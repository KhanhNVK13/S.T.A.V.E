import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceLabel?: string;
}
