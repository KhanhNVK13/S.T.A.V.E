import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { OrderCodeParamsDto } from './dto/order-code.dto';
import { PAYMENT_GATEWAY, type PaymentGateway } from './payment-gateway';
import { PaymentsService } from './payments.service';

/** UC-74 — webhook PayOS (xác minh chữ ký, không cần đăng nhập) và trạng thái đơn của người gọi. */
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
  ) {}

  @Post('payos/webhook')
  @HttpCode(200)
  async payosWebhook(
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    const verified = await this.gateway.verifyWebhook(body, headers);
    if (!verified) throw new BadRequestException('Invalid webhook signature');
    await this.paymentsService.completeOrder(
      verified.orderCode,
      verified.success,
    );
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard, SessionAuthGuard)
  @Get('orders/:orderCode')
  getOrder(
    @Req() req: AuthenticatedRequest,
    @Param() params: OrderCodeParamsDto,
  ) {
    return this.paymentsService.getOrderForUser(req.user.id, params.orderCode);
  }

  @UseGuards(JwtAuthGuard, SessionAuthGuard, UserThrottlerGuard)
  @Post('orders/:orderCode/sync')
  @HttpCode(200)
  syncOrder(
    @Req() req: AuthenticatedRequest,
    @Param() params: OrderCodeParamsDto,
  ) {
    return this.paymentsService.syncOrder(req.user.id, params.orderCode);
  }
}
