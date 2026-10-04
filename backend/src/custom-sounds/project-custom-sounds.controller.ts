import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MAX_SOUND_MAP_ENTRIES } from '@stave/shared-types';
import { CustomSoundsService } from './custom-sounds.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = MAX_SOUND_MAP_ENTRIES * 4;

/**
 * UC-57 — sound nào trong `soundMap` của project còn phát được (CLAUDE.md 4.8):
 * còn tồn tại VÀ (chưa "xoá cho bản thân" HOẶC chủ project khác chủ sound).
 */
@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('projects/:projectId/custom-sounds')
export class ProjectCustomSoundsController {
  constructor(private readonly customSoundsService: CustomSoundsService) {}

  @Get()
  resolve(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('ids') idsParam?: string,
  ) {
    const ids = Array.from(
      new Set((idsParam ?? '').split(',').filter((id) => id.length > 0)),
    );
    if (ids.length > MAX_IDS || ids.some((id) => !UUID_PATTERN.test(id))) {
      throw new BadRequestException('Invalid custom sound ids');
    }
    return this.customSoundsService.resolveForProject(
      req.user.id,
      projectId,
      ids,
    );
  }
}
