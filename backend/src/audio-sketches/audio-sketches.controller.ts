import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AudioSketchesService } from './audio-sketches.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { AttachSketchDto } from './dto/attach-sketch.dto';

/**
 * UC-53/54/55 — Audio Sketch.
 *
 * File audio KHÔNG đi qua backend: client xin signed URL ở đây rồi upload thẳng
 * lên Supabase Storage (kiến trúc đã chốt, xem PROJECT_STATE §31). Backend giữ
 * phần quyết định nghiệp vụ: quyền edit (BR-26) và giới hạn 3 phút/10MB (BR-56).
 */
@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('projects/:projectId/audio-sketches')
export class AudioSketchesController {
  constructor(private readonly audioSketchesService: AudioSketchesService) {}

  /** Xin quyền ghi 1 file mới; trả về id + path + token cho `uploadToSignedUrl`. */
  @Post('upload-url')
  createUploadUrl(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateUploadUrlDto,
  ) {
    return this.audioSketchesService.createUploadUrl(
      projectId,
      req.user.id,
      dto,
    );
  }

  /** UC-55: gắn sketch đã upload vào project. */
  @Post()
  attach(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: AttachSketchDto,
  ) {
    return this.audioSketchesService.attach(projectId, req.user.id, dto);
  }

  /** Danh sách sketch của project, kèm link nghe có thời hạn. */
  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.audioSketchesService.list(projectId, req.user.id);
  }
}
