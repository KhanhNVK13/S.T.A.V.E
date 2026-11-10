import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { FakePaymentResultParamsDto } from './dto/fake-payment.dto';
import { OrderCodeParamsDto } from './dto/order-code.dto';
import { PaymentsService } from './payments.service';

/** UC-74 — cổng thanh toán giả, chỉ được đăng ký khi PAYMENT_PROVIDER=fake và không phải production. */
@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('dev/fake-payment')
export class DevFakePaymentController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get(':orderCode')
  getOrder(
    @Req() req: AuthenticatedRequest,
    @Param() params: OrderCodeParamsDto,
  ) {
    return this.paymentsService.getOrderForUser(req.user.id, params.orderCode);
  }

  @Post(':orderCode/:result')
  async complete(
    @Req() req: AuthenticatedRequest,
    @Param() params: FakePaymentResultParamsDto,
  ) {
    await this.paymentsService.getOrderForUser(req.user.id, params.orderCode);
    await this.paymentsService.completeOrder(
      params.orderCode,
      params.result === 'success',
    );
    return this.paymentsService.getOrderForUser(req.user.id, params.orderCode);
  }
}
