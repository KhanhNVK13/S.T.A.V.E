import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CheckoutDto {
  @IsUUID()
  planId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  returnTo?: string;
}
