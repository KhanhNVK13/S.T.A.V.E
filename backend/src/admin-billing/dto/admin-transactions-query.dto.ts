import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export const ADMIN_TRANSACTION_OUTCOMES = [
  'success',
  'failed',
  'pending',
] as const;

export type AdminTransactionOutcome =
  (typeof ADMIN_TRANSACTION_OUTCOMES)[number];

export class AdminTransactionsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(ADMIN_TRANSACTION_OUTCOMES)
  outcome?: AdminTransactionOutcome;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  cursor?: string;
}
