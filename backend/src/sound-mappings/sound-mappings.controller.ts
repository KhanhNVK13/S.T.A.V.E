import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SoundMappingsService } from './sound-mappings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { CreateSoundMappingDto } from './dto/create-mapping.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('projects/:projectId/sound-mappings')
export class SoundMappingsController {
  constructor(private readonly soundMappingsService: SoundMappingsService) {}

  /** UC-57: tạo/update mapping sound cho note. */
  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateSoundMappingDto,
  ) {
    return this.soundMappingsService.create(req.user.id, {
      ...dto,
      projectId,
    });
  }

  /** UC-57: lấy danh sách mapping của project. */
  @Get()
  listByProject(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.soundMappingsService.listByProject(req.user.id, projectId);
  }

  /** UC-59 variant: xoá mapping theo ID. */
  @Delete(':mappingId')
  delete(
    @Req() req: AuthenticatedRequest,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
  ) {
    return this.soundMappingsService.delete(req.user.id, mappingId);
  }
}
