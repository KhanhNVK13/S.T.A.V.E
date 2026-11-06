import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PAYMENT_ISSUE_DESCRIPTION_MAX } from '@stave/shared-types';

export class ListTransactionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class CreatePaymentIssueDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, PAYMENT_ISSUE_DESCRIPTION_MAX, {
    message: 'Description must be 1 to 500 characters',
  })
  description!: string;
}
