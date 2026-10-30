import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type {
  JamEvent,
  JamEventListItem,
  JamStatePayload,
} from '@stave/shared-types';
import { JamService } from './jam.service';
import { JamEventQueryDto } from './dto/jam-event-query.dto';

/**
 * UC-66 — Community Jam HTTP surface.
 *
 * `GET /jam/events` is open to everyone (the event list is public; joining a
 * room still requires auth on the socket). `GET /jam/events/:id` is public
 * too so guests can see the schedule; `POST .../join` and everything the
 * socket does require the two auth layers (CLAUDE.md §4.6).
 */
@Controller('jam')
export class JamController {
  constructor(private readonly jamService: JamService) {}

  /** GET /jam/events?status= — list scheduled / active / ended events. */
  @Get('events')
  listEvents(@Query() query: JamEventQueryDto): Promise<JamEventListItem[]> {
    return this.jamService.listEvents(query);
  }

  /** GET /jam/events/:id — one event's details (public schedule view). */
  @Get('events/:id')
  getEvent(@Param('id', ParseUUIDPipe) id: string): Promise<JamEvent> {
    return this.jamService.getEventById(id);
  }

  /**
   * POST /jam/events/:id/join — validate every rule BEFORE the socket
   * connects (PRE-3: inside the time window + active account + capacity),
   * then hand back the initial state so the client can open the socket with
   * a warm payload. `record: false` — no participant row / socket handle is
   * left behind; the real `jam:join` on the socket is what records them.
   */
  @Post('events/:id/join')
  @UseGuards(JwtAuthGuard, SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  async joinEvent(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JamStatePayload> {
    const profile = req.user;
    return this.jamService.handleUserJoin(
      id,
      {
        id: profile.id,
        username:
          (profile.user_metadata?.username as string | undefined) ?? null,
        displayName:
          (profile.user_metadata?.display_name as string | undefined) ??
          profile.email ??
          null,
        avatarUrl:
          (profile.user_metadata?.avatar_url as string | undefined) ?? null,
      },
      `http:${profile.id}`,
      false,
    );
  }
}
