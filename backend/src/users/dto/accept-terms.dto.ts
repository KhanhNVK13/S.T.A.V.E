import { IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptTermsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  version!: string;
}
