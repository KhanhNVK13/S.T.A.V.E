import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CustomSoundsService } from './custom-sounds.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { CreateCustomSoundUploadUrlDto } from './dto/create-upload-url.dto';
import { ConfirmCustomSoundDto } from './dto/confirm-custom-sound.dto';

/**
 * UC-56/58/59 — Custom Sound.
 *
 * File audio KHÔNG đi qua backend: client xin signed URL ở đây rồi upload thẳng
 * lên Supabase Storage (cùng kiến trúc với Audio Sketch).
 * Backend giữ phần quyền sở hữu và giới hạn ≤30 giây/≤10MB (BR-60).
 */
@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('users/me/custom-sounds')
export class CustomSoundsController {
  constructor(private readonly customSoundsService: CustomSoundsService) {}

  /** Xin quyền upload 1 sound mới; trả về id + path + token. */
  @Post('upload-url')
  createUploadUrl(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCustomSoundUploadUrlDto,
  ) {
    return this.customSoundsService.createUploadUrl(req.user.id, {
      durationSec: dto.durationSec,
      sizeBytes: dto.sizeBytes,
      name: dto.name,
      mimeType: dto.mimeType,
    });
  }

  /** UC-56: xác nhận upload xong, lưu vào database. */
  @Post()
  confirmUpload(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ConfirmCustomSoundDto,
  ) {
    return this.customSoundsService.confirmUpload(req.user.id, {
      soundId: dto.soundId,
      name: dto.name,
      originalFilename: dto.originalFilename,
      durationSec: dto.durationSec,
      sizeBytes: dto.sizeBytes,
      mimeType: dto.mimeType,
    });
  }

  /** UC-58: danh sách sound của user hiện tại, kèm link nghe có thời hạn. */
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.customSoundsService.list(req.user.id);
  }

  /** UC-59: xoá sound (chỉ chủ sở hữu). */
  @Delete(':id')
  delete(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customSoundsService.delete(req.user.id, id);
  }
}
