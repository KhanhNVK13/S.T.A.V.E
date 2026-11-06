import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { SubscriptionsService } from './subscriptions.service';

/** UC-73 — danh sách gói cho người đăng nhập. */
@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('subscription-plans')
export class SubscriptionPlansController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.subscriptionsService.listPlans(req.user.id);
  }
}
