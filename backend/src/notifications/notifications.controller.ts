import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { NotificationInboxService } from './notification-inbox.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { SetPreferenceDto } from './dto/set-preference.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly inbox: NotificationInboxService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.inbox.list(req.user.id, query);
  }

  @Get('unread-count')
  unreadCount(@Req() req: AuthenticatedRequest) {
    return this.inbox.unreadCount(req.user.id);
  }

  @Get('preferences')
  getPreferences(@Req() req: AuthenticatedRequest) {
    return this.inbox.getPreferences(req.user.id);
  }

  @Put('preferences')
  setPreference(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SetPreferenceDto,
  ) {
    return this.inbox.setPreference(req.user.id, dto);
  }

  @Post('read-all')
  readAll(@Req() req: AuthenticatedRequest) {
    return this.inbox.readAll(req.user.id);
  }

  @Post(':id/open')
  open(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inbox.open(req.user.id, id);
  }
}
