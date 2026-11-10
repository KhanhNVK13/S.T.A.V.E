import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const PAYMENT_ISSUE_REMEDIES = [
  'extend',
  'refund',
  'activate',
  'dismiss',
] as const;
export type PaymentIssueRemedy = (typeof PAYMENT_ISSUE_REMEDIES)[number];

export const PAYMENT_ISSUE_NOTE_MAX = 1000;

export class ResolvePaymentIssueDto {
  @IsIn(PAYMENT_ISSUE_REMEDIES)
  remedy!: PaymentIssueRemedy;

  @IsString()
  @IsNotEmpty()
  @MaxLength(PAYMENT_ISSUE_NOTE_MAX)
  note!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  refundAmountVnd?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  refundRef?: string;

  @IsOptional()
  @IsUUID()
  duplicateOfIssueId?: string;
}
