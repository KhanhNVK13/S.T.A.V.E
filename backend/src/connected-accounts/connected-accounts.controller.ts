import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ConnectedAccountsService } from './connected-accounts.service';
import { NotifyConnectedAccountDto } from './dto/notify-connected-account.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('account/connected-accounts')
export class ConnectedAccountsController {
  constructor(private readonly service: ConnectedAccountsService) {}

  @Post('notify')
  notify(
    @Req() req: AuthenticatedRequest,
    @Body() dto: NotifyConnectedAccountDto,
  ) {
    return this.service.notify(req.user.id, dto);
  }
}
