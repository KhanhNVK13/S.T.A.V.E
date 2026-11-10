import { IsIn } from 'class-validator';
import { FAKE_PAYMENT_RESULTS } from '@stave/shared-types';
import type { FakePaymentResult } from '@stave/shared-types';
import { OrderCodeParamsDto } from './order-code.dto';

export class FakePaymentResultParamsDto extends OrderCodeParamsDto {
  @IsIn(FAKE_PAYMENT_RESULTS)
  result!: FakePaymentResult;
}
