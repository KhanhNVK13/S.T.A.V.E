import { Type } from 'class-transformer';
import { IsInt, IsPositive, Max } from 'class-validator';

export class OrderCodeParamsDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(Number.MAX_SAFE_INTEGER)
  orderCode!: number;
}
