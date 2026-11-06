import { Type } from 'class-transformer';
import { IsIn, IsInt, IsPositive, Max } from 'class-validator';
import { FAKE_PAYMENT_RESULTS } from '@stave/shared-types';
import type { FakePaymentResult } from '@stave/shared-types';

export class FakePaymentOrderParamsDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(Number.MAX_SAFE_INTEGER)
  orderCode!: number;
}

export class FakePaymentResultParamsDto extends FakePaymentOrderParamsDto {
  @IsIn(FAKE_PAYMENT_RESULTS)
  result!: FakePaymentResult;
}
