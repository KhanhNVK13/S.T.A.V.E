import { IsEmail, IsIn, IsOptional, MaxLength } from 'class-validator';

export class NotifyConnectedAccountDto {
  @IsIn(['connected', 'disconnected'])
  event!: 'connected' | 'disconnected';

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}
