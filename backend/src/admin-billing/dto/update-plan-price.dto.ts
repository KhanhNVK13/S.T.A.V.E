import { Type } from 'class-transformer';
import { IsDateString, IsInt, Min } from 'class-validator';

export class UpdatePlanPriceDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceVnd!: number;

  /** ISO 8601 — ngày giá mới bắt đầu có hiệu lực. */
  @IsDateString()
  effectiveAt!: string;
}
