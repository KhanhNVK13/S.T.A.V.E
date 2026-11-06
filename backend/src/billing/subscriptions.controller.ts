import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { SubscriptionsService } from './subscriptions.service';

/** UC-73..77 — gói đang dùng của người gọi. */
@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return this.subscriptionsService.getEffective(req.user.id);
  }
}
