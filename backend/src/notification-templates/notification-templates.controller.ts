import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { NotificationTemplateItem } from '@stave/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { NotificationTemplatesService } from './notification-templates.service';
import {
  CreateNotificationTemplateDto,
  PreviewNotificationTemplateDto,
} from './dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/notification-templates')
export class NotificationTemplatesController {
  constructor(private readonly service: NotificationTemplatesService) {}

  @Get()
  list() {
    return this.service.listTemplates();
  }

  @Post('preview')
  preview(@Body() dto: PreviewNotificationTemplateDto) {
    return this.service.preview(dto);
  }

  /**
   * Tạo mới khi loại chưa có mẫu (201), sửa khi đã có (200) — UC-110/UC-111.
   * `passthrough` giữ Nest tự serialize body; chỉ đặt mã trạng thái.
   */
  @Put(':type')
  async upsert(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Param('type') type: string,
    @Body() dto: CreateNotificationTemplateDto,
  ): Promise<NotificationTemplateItem> {
    const result = await this.service.upsertTemplate(req.user.id, type, dto);
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.item;
  }

  @Delete(':type')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('type') type: string,
  ): Promise<void> {
    return this.service.deleteTemplate(req.user.id, type);
  }
}
