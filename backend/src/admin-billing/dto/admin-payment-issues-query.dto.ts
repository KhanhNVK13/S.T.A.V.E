import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const PAYMENT_ISSUE_STATUSES = ['open', 'resolved'] as const;
export type PaymentIssueStatusFilter = (typeof PAYMENT_ISSUE_STATUSES)[number];

export class AdminPaymentIssuesQueryDto {
  @IsOptional()
  @IsIn(PAYMENT_ISSUE_STATUSES)
  status?: PaymentIssueStatusFilter;

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
