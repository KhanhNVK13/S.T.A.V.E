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
import { CustomSoundsService } from './custom-sounds.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { CreateCustomSoundUploadUrlDto } from './dto/create-upload-url.dto';
import { ConfirmCustomSoundDto } from './dto/confirm-custom-sound.dto';
import { DeleteCustomSoundQueryDto } from './dto/delete-custom-sound.dto';

/**
 * UC-56/58/59/118 — Custom Sound. File đi thẳng từ trình duyệt lên Storage qua
 * signed URL; backend kiểm lại file thật (WAV, ≤30 giây, ≤10MB, hạn mức) khi xác nhận.
 */
@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('users/me/custom-sounds')
export class CustomSoundsController {
  constructor(private readonly customSoundsService: CustomSoundsService) {}

  @Post('upload-url')
  createUploadUrl(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCustomSoundUploadUrlDto,
  ) {
    return this.customSoundsService.createUploadUrl(req.user.id, dto);
  }

  @Post()
  confirmUpload(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ConfirmCustomSoundDto,
  ) {
    return this.customSoundsService.confirmUpload(req.user.id, dto);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.customSoundsService.list(req.user.id);
  }

  @Get(':id/usage')
  usage(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customSoundsService.getUsage(req.user.id, id);
  }

  @Delete(':id')
  delete(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeleteCustomSoundQueryDto,
  ) {
    return this.customSoundsService.delete(
      req.user.id,
      id,
      query.mode ?? 'self',
    );
  }
}
