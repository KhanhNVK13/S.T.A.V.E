import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { PaymentsService } from './payments.service';
import { SubscriptionsService } from './subscriptions.service';

/** UC-73..77 — gói đang dùng của người gọi; UC-74 đăng ký gói trả phí. */
@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return this.subscriptionsService.getEffective(req.user.id);
  }

  @UseGuards(UserThrottlerGuard)
  @Post('checkout')
  checkout(@Req() req: AuthenticatedRequest, @Body() dto: CheckoutDto) {
    return this.paymentsService.createCheckout(
      req.user.id,
      dto.planId,
      'subscribe',
      dto.returnTo,
    );
  }
}
