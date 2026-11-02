import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { AdminGuard } from '../common/guards/admin.guard';
import type {
  AvailableJamProjectDto,
  JamEndEventResponse,
  JamEvent,
  JamEventListItem,
} from '@stave/shared-types';
import { JamService } from './jam.service';
import { ConfigureJamEventDto } from './dto/configure-jam-event.dto';
import { CreateJamEventDto } from './dto/create-jam-event.dto';
import { JamEventQueryDto } from './dto/jam-event-query.dto';

const eventIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException('Mã định danh sự kiện Jam không hợp lệ.'),
});

/**
 * UC-93/94 & UC-95 — Admin surface for Community Jam events.
 *
 * Only an Admin (`public.users.role = 'admin'`, CLAUDE.md §4.3) reaches these routes:
 * `JwtAuthGuard` → `SessionAuthGuard` → `AdminGuard`.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
export class AdminJamController {
  constructor(private readonly jamService: JamService) {}

  /**
   * POST /admin/jam — create a Community Jam event (UC-93). 201 + the
   * created `JamEvent`. Errors: 400 (4.E1/4.E2/5.E1), 409
   * `JAM_OVERLAP_CONFLICT` (4.E3 — retry with `confirmOverlap: true`),
   * 403 (non-admin), 401 (auth layers), 500 (5.E2 — the jam project was
   * rolled back on failure).
   */
  @Post('jam')
  @HttpCode(HttpStatus.CREATED)
  async createEvent(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateJamEventDto,
  ): Promise<JamEvent> {
    return this.jamService.createEvent(req.user.id, dto);
  }

  /** GET /admin/jam/events — list all events for admin dashboard (UC-94 step 2). */
  @Get('jam/events')
  listEvents(@Query() query: JamEventQueryDto): Promise<JamEventListItem[]> {
    return this.jamService.listEvents(query);
  }

  /** Alias: GET /admin/jam-events */
  @Get('jam-events')
  listEventsAlias(@Query() query: JamEventQueryDto): Promise<JamEventListItem[]> {
    return this.jamService.listEvents(query);
  }

  /** GET /admin/jam/available-projects — list candidate starting projects (BR-106). */
  @Get('jam/available-projects')
  getAvailableProjects(): Promise<AvailableJamProjectDto[]> {
    return this.jamService.getAvailableStartingProjects();
  }

  /** Alias: GET /admin/jam-events/available-projects */
  @Get('jam-events/available-projects')
  getAvailableProjectsAlias(): Promise<AvailableJamProjectDto[]> {
    return this.jamService.getAvailableStartingProjects();
  }

  /** GET /admin/jam/events/:id — full event detail (UC-94). */
  @Get('jam/events/:id')
  getEvent(@Param('id', eventIdPipe) id: string): Promise<JamEvent> {
    return this.jamService.getEventById(id);
  }

  /** Alias: GET /admin/jam-events/:id */
  @Get('jam-events/:id')
  getEventAlias(@Param('id', eventIdPipe) id: string): Promise<JamEvent> {
    return this.jamService.getEventById(id);
  }

  /** PATCH /admin/jam/events/:id — configure event (UC-94). */
  @Patch('jam/events/:id')
  configure(
    @Req() req: AuthenticatedRequest,
    @Param('id', eventIdPipe) id: string,
    @Body() dto: ConfigureJamEventDto,
  ): Promise<JamEvent> {
    return this.jamService.configureEvent(req.user.id, id, dto);
  }

  /** Alias: PATCH /admin/jam-events/:id */
  @Patch('jam-events/:id')
  configureAlias(
    @Req() req: AuthenticatedRequest,
    @Param('id', eventIdPipe) id: string,
    @Body() dto: ConfigureJamEventDto,
  ): Promise<JamEvent> {
    return this.jamService.configureEvent(req.user.id, id, dto);
  }

  /** DELETE /admin/jam/events/:id — cancel scheduled event (UC-94). */
  @Delete('jam/events/:id')
  async cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id', eventIdPipe) id: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.jamService.cancelEvent(req.user.id, id);
    return { success: true, message: 'Cancelled' };
  }

  /** Alias: DELETE /admin/jam-events/:id */
  @Delete('jam-events/:id')
  async cancelAlias(
    @Req() req: AuthenticatedRequest,
    @Param('id', eventIdPipe) id: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.jamService.cancelEvent(req.user.id, id);
    return { success: true, message: 'Cancelled' };
  }

  /** POST /admin/jam-events/:id/end — force-end live event (UC-95). */
  @Post('jam-events/:id/end')
  @HttpCode(HttpStatus.OK)
  endEvent(
    @Req() req: AuthenticatedRequest,
    @Param('id', eventIdPipe) id: string,
  ): Promise<JamEndEventResponse> {
    return this.jamService.endJamEvent(id, req.user.id);
  }

  /** Alias: POST /admin/jam/events/:id/end (UC-95). */
  @Post('jam/events/:id/end')
  @HttpCode(HttpStatus.OK)
  endEventAlias(
    @Req() req: AuthenticatedRequest,
    @Param('id', eventIdPipe) id: string,
  ): Promise<JamEndEventResponse> {
    return this.jamService.endJamEvent(id, req.user.id);
  }
}
