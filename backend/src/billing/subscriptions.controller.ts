import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { PlanIdDto } from './dto/plan-change.dto';
import { PaymentsService } from './payments.service';
import { SubscriptionChangesService } from './subscription-changes.service';
import { SubscriptionsService } from './subscriptions.service';

/** UC-73..77 — gói của người gọi: xem, đăng ký (UC-74), đổi gói (UC-75), huỷ / tiếp tục (UC-76). */
@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly paymentsService: PaymentsService,
    private readonly changes: SubscriptionChangesService,
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

  @Get('change-preview')
  changePreview(@Req() req: AuthenticatedRequest, @Query() query: PlanIdDto) {
    return this.changes.previewChange(req.user.id, query.planId);
  }

  @UseGuards(UserThrottlerGuard)
  @Post('change')
  @HttpCode(200)
  change(@Req() req: AuthenticatedRequest, @Body() dto: PlanIdDto) {
    return this.changes.change(req.user.id, dto.planId);
  }

  @UseGuards(UserThrottlerGuard)
  @Post('cancel-downgrade')
  @HttpCode(200)
  cancelDowngrade(@Req() req: AuthenticatedRequest) {
    return this.changes.cancelDowngrade(req.user.id);
  }

  @Get('cancel-preview')
  cancelPreview(@Req() req: AuthenticatedRequest) {
    return this.changes.previewCancel(req.user.id);
  }

  @UseGuards(UserThrottlerGuard)
  @Post('cancel')
  @HttpCode(200)
  cancel(@Req() req: AuthenticatedRequest) {
    return this.changes.cancel(req.user.id);
  }

  @UseGuards(UserThrottlerGuard)
  @Post('resume')
  @HttpCode(200)
  resume(@Req() req: AuthenticatedRequest) {
    return this.changes.resume(req.user.id);
  }

  @UseGuards(UserThrottlerGuard)
  @Post('renew')
  @HttpCode(201)
  renew(@Req() req: AuthenticatedRequest) {
    return this.changes.renew(req.user.id);
  }
}
